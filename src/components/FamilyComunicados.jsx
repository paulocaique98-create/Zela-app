import React, { useEffect, useState } from 'react';
import { Megaphone, Loader2, ChevronDown, FileText, Image as ImageIcon, File as FileIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSignedUrl } from '../lib/storage';

const BUCKET = 'comunicados-anexos';

function AttachmentIcon({ type, size = 14 }) {
  if (type?.startsWith('image/')) return <ImageIcon size={size} />;
  if (type === 'application/pdf') return <FileText size={size} />;
  return <FileIcon size={size} />;
}

export default function FamilyComunicados({ currentUser, currentSchool }) {
  const [comunicados, setComunicados] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const schoolId = currentSchool?.id || currentUser?.school_id;

  useEffect(() => {
    const load = async () => {
      if (!schoolId || !currentUser?.id) return;
      setIsLoading(true);
      setError('');
      try {
        const [comunicadosRes, readsRes] = await Promise.all([
          supabase.from('comunicados').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
          supabase.from('comunicado_reads').select('comunicado_id').eq('user_id', currentUser.id),
        ]);

        if (comunicadosRes.error) throw comunicadosRes.error;
        if (readsRes.error) throw readsRes.error;

        setComunicados(comunicadosRes.data || []);
        setReadIds(new Set((readsRes.data || []).map(r => r.comunicado_id)));
      } catch (err) {
        console.error('[FamilyComunicados] Erro ao buscar:', err);
        setError('Não foi possível carregar os comunicados.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolId, currentUser?.id]);

  const markAsRead = async (comunicadoId) => {
    if (readIds.has(comunicadoId)) return;
    // Atualiza local imediatamente (otimista) — não bloqueia a leitura por causa da rede
    setReadIds(prev => new Set(prev).add(comunicadoId));
    const { error: upsertError } = await supabase
      .from('comunicado_reads')
      .upsert({ comunicado_id: comunicadoId, user_id: currentUser.id }, { onConflict: 'comunicado_id,user_id' });
    if (upsertError) console.error('[FamilyComunicados] Erro ao marcar como lido:', upsertError);
  };

  const handleToggle = (comunicado) => {
    const isOpening = expandedId !== comunicado.id;
    setExpandedId(isOpening ? comunicado.id : null);
    if (isOpening) markAsRead(comunicado.id);
  };

  const [openingPath, setOpeningPath] = useState(null);
  const openAttachment = async (attachment, e) => {
    e.stopPropagation();
    setOpeningPath(attachment.path);
    try {
      const url = await getSignedUrl(BUCKET, attachment.path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      console.error('[FamilyComunicados] Erro ao abrir anexo:', err);
    } finally {
      setOpeningPath(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <Megaphone size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Comunicados</h2>
          <p className="text-slate-500 text-sm hidden sm:block">Avisos e informações publicados pela escola.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : comunicados.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Megaphone className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhum comunicado publicado ainda.</p>
          </div>
        ) : (
          comunicados.map(c => {
            const isRead = readIds.has(c.id);
            const isExpanded = expandedId === c.id;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => handleToggle(c)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle(c); }}
                className={`w-full text-left bg-white border rounded-2xl p-4 sm:p-5 shadow-sm transition-colors cursor-pointer ${
                  isRead ? 'border-slate-200' : 'border-indigo-300 bg-indigo-50/40'
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    {!isRead && <span className="w-2 h-2 mt-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-slate-800">{c.title}</h4>
                        {c.turmas && c.turmas.map(t => (
                          <span key={t} className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200">
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
                {isExpanded && (
                  <>
                    <p className="text-slate-600 text-sm mt-3 whitespace-pre-wrap">{c.body}</p>
                    {c.attachments && c.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {c.attachments.map(a => (
                          <button
                            key={a.path}
                            onClick={(e) => openAttachment(a, e)}
                            disabled={openingPath === a.path}
                            className="flex items-center gap-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-700 transition"
                          >
                            {openingPath === a.path ? <Loader2 size={14} className="animate-spin" /> : <AttachmentIcon type={a.type} />}
                            <span className="max-w-[160px] truncate">{a.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
