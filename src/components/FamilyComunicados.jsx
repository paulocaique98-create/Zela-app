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
          supabase.from('comunicados').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(300),
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
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <Megaphone size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Comunicados</h2>
          <p className="text-on-surface-variant text-small hidden sm:block">Avisos e informações publicados pela escola.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : comunicados.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <Megaphone className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum comunicado publicado ainda.</p>
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
                className={`w-full text-left bg-white border rounded-zela-lg p-4 sm:p-5 shadow-sm transition-colors cursor-pointer ${
                  isRead ? 'border-outline-variant' : 'border-primary/40 bg-primary/5'
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    {!isRead && <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-on-surface">{c.title}</h4>
                        {c.turmas && c.turmas.map(t => (
                          <span key={t} className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/20">
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="text-on-surface-variant text-xs mt-0.5">
                        {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-on-surface-variant/70 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
                {isExpanded && (
                  <>
                    <p className="text-on-surface-variant text-sm mt-3 whitespace-pre-wrap">{c.body}</p>
                    {c.attachments && c.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {c.attachments.map(a => (
                          <button
                            key={a.path}
                            onClick={(e) => openAttachment(a, e)}
                            disabled={openingPath === a.path}
                            className="flex items-center gap-1.5 bg-surface-container-low hover:bg-primary/10 border border-outline-variant hover:border-primary/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary transition"
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
