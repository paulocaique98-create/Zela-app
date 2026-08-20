import React, { useEffect, useState } from 'react';
import { Megaphone, Loader2, Trash2, Pencil, X, Check, Plus, Users, Paperclip, FileText, Image as ImageIcon, File as FileIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TURMAS } from '../lib/constants';
import { uploadFile, removeFile, getSignedUrl, buildSafeFileName } from '../lib/storage';
import { notifyFamilies } from '../lib/notifyFamilies';

const TURMA_OPTIONS = TURMAS.filter(t => t !== 'Todas as Turmas');

const BUCKET = 'comunicados-anexos';
const MAX_FILES = 5;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function AttachmentIcon({ type, size = 14 }) {
  if (type?.startsWith('image/')) return <ImageIcon size={size} />;
  if (type === 'application/pdf') return <FileText size={size} />;
  return <FileIcon size={size} />;
}

export default function AdminComunicados({ currentUser, currentSchool }) {
  const [comunicados, setComunicados] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedTurmas, setSelectedTurmas] = useState([]); // [] = Todas as Turmas
  const [sendToAll, setSendToAll] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Anexos: existingAttachments (já salvos, ao editar) + pendingFiles (novos, ainda
  // não enviados ao Storage — só sobem de fato ao publicar/salvar).
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [openingPath, setOpeningPath] = useState(null);

  const schoolId = currentSchool?.id || currentUser?.school_id;

  const fetchComunicados = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('comunicados')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setComunicados(data || []);
    } catch (err) {
      console.error('[AdminComunicados] Erro ao buscar:', err);
      setError('Não foi possível carregar os comunicados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComunicados();
  }, [schoolId]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setBody('');
    setSelectedTurmas([]);
    setSendToAll(true);
    setExistingAttachments([]);
    setPendingFiles([]);
  };

  const handleEdit = (comunicado) => {
    setEditingId(comunicado.id);
    setTitle(comunicado.title);
    setBody(comunicado.body);
    setSendToAll(!comunicado.turmas || comunicado.turmas.length === 0);
    setSelectedTurmas(comunicado.turmas || []);
    setExistingAttachments(comunicado.attachments || []);
    setPendingFiles([]);
    setShowForm(true);
  };

  const toggleTurma = (t) => {
    setSelectedTurmas(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const totalAttachmentCount = existingAttachments.length + pendingFiles.length;

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois de remover

    const accepted = [];
    for (const file of files) {
      if (totalAttachmentCount + accepted.length >= MAX_FILES) {
        setError(`No máximo ${MAX_FILES} anexos por comunicado.`);
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Tipo de arquivo não permitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`Arquivo muito grande (máx. 15MB): ${file.name}`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) {
      setError('');
      setPendingFiles(prev => [...prev, ...accepted]);
    }
  };

  const removePendingFile = (index) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = async (attachment) => {
    try {
      await removeFile(BUCKET, attachment.path);
    } catch (err) {
      console.error('[AdminComunicados] Erro ao remover anexo do storage:', err);
    }
    setExistingAttachments(prev => prev.filter(a => a.path !== attachment.path));
  };

  const openAttachment = async (attachment) => {
    setOpeningPath(attachment.path);
    try {
      const url = await getSignedUrl(BUCKET, attachment.path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      console.error('[AdminComunicados] Erro ao abrir anexo:', err);
      setError('Não foi possível abrir o anexo.');
    } finally {
      setOpeningPath(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !schoolId) return;
    if (!sendToAll && selectedTurmas.length === 0) {
      setError('Selecione ao menos uma turma, ou marque "Todas as Turmas".');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const turmasValue = sendToAll ? null : selectedTurmas;
      const titleValue = title.trim().toUpperCase();
      const comunicadoId = editingId || crypto.randomUUID();

      // Sobe os arquivos novos pro Storage antes de salvar a linha do comunicado.
      const uploadedAttachments = [];
      for (const file of pendingFiles) {
        const fileName = buildSafeFileName(file);
        const path = `${schoolId}/${comunicadoId}/${fileName}`;
        await uploadFile(BUCKET, path, file);
        uploadedAttachments.push({ path, name: file.name, type: file.type, size: file.size });
      }
      const attachmentsValue = [...existingAttachments, ...uploadedAttachments];

      if (editingId) {
        const { error: updateError } = await supabase
          .from('comunicados')
          .update({ title: titleValue, body: body.trim(), turmas: turmasValue, attachments: attachmentsValue, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('comunicados')
          .insert({ id: comunicadoId, school_id: schoolId, title: titleValue, body: body.trim(), turmas: turmasValue, attachments: attachmentsValue, created_by: currentUser.id });
        if (insertError) throw insertError;

        notifyFamilies({
          type: 'comunicado',
          title: titleValue,
          message: 'Novo comunicado da escola.',
          url: '/?tab=comunicados',
          turmas: turmasValue,
        });
      }
      resetForm();
      await fetchComunicados();
    } catch (err) {
      console.error('[AdminComunicados] Erro ao salvar:', err);
      setError('Não foi possível salvar o comunicado.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este comunicado? Essa ação não pode ser desfeita.')) return;
    setDeletingId(id);
    try {
      const comunicado = comunicados.find(c => c.id === id);
      const { error: deleteError } = await supabase.from('comunicados').delete().eq('id', id);
      if (deleteError) throw deleteError;
      // Limpeza dos anexos no Storage (best-effort — não bloqueia a exclusão do registro)
      if (comunicado?.attachments?.length) {
        for (const a of comunicado.attachments) {
          removeFile(BUCKET, a.path).catch(err => console.warn('[AdminComunicados] Falha ao limpar anexo:', a.path, err));
        }
      }
      setComunicados(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('[AdminComunicados] Erro ao excluir:', err);
      setError('Não foi possível excluir o comunicado.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <Megaphone size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Comunicados</h2>
            <p className="text-slate-500 text-sm hidden sm:block">Crie e gerencie avisos para as famílias da escola.</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Novo Comunicado</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">{editingId ? 'Editar comunicado' : 'Novo comunicado'}</h3>
              <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Título"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={150}
              required
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm uppercase placeholder:normal-case"
            />
            <textarea
              placeholder="Escreva o comunicado..."
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              required
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm resize-none"
            />
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                <Users size={12} /> Enviar para
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSendToAll(true); setSelectedTurmas([]); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    sendToAll
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                  }`}
                >
                  Todas as Turmas
                </button>
                {TURMA_OPTIONS.map(t => {
                  const isSelected = !sendToAll && selectedTurmas.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setSendToAll(false); toggleTurma(t); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              {!sendToAll && selectedTurmas.length === 0 && (
                <p className="text-[11px] text-amber-600 font-semibold mt-1.5">Selecione ao menos uma turma.</p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                <Paperclip size={12} /> Anexos (imagem, PDF, Word — até {MAX_FILES}, 15MB cada)
              </label>

              {(existingAttachments.length > 0 || pendingFiles.length > 0) && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {existingAttachments.map((a) => (
                    <div key={a.path} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
                      <AttachmentIcon type={a.type} />
                      <span className="max-w-[140px] truncate text-slate-700 font-medium">{a.name}</span>
                      <button type="button" onClick={() => removeExistingAttachment(a)} className="text-slate-400 hover:text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {pendingFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs">
                      <AttachmentIcon type={f.type} />
                      <span className="max-w-[140px] truncate text-indigo-700 font-medium">{f.name}</span>
                      <button type="button" onClick={() => removePendingFile(i)} className="text-indigo-400 hover:text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {totalAttachmentCount < MAX_FILES && (
                <label className="inline-flex items-center gap-2 bg-white border border-dashed border-slate-300 hover:border-indigo-400 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer transition">
                  <Paperclip size={14} /> Adicionar arquivo
                  <input
                    type="file"
                    multiple
                    accept={ALLOWED_TYPES.join(',')}
                    onChange={handleFilesSelected}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving || !title.trim() || !body.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Salvar alterações' : 'Publicar'}
            </button>
          </form>
        )}

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
          comunicados.map(c => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-bold text-slate-800">{c.title}</h4>
                    {c.turmas && c.turmas.length > 0 ? (
                      c.turmas.map(t => (
                        <span key={t} className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border bg-slate-100 text-slate-600 border-slate-200">
                        Todas as Turmas
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleEdit(c)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Excluir"
                  >
                    {deletingId === c.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
              <p className="text-slate-600 text-sm mt-3 whitespace-pre-wrap">{c.body}</p>
              {c.attachments && c.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {c.attachments.map(a => (
                    <button
                      key={a.path}
                      onClick={() => openAttachment(a)}
                      disabled={openingPath === a.path}
                      className="flex items-center gap-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-700 transition"
                    >
                      {openingPath === a.path ? <Loader2 size={14} className="animate-spin" /> : <AttachmentIcon type={a.type} />}
                      <span className="max-w-[160px] truncate">{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
