import React, { useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, Loader2, Trash2, X, Upload, Users, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TURMAS } from '../lib/constants';
import { uploadFile, removeFile, getSignedUrls, buildSafeFileName } from '../lib/storage';
import { notifyFamilies } from '../lib/notifyFamilies';
import ConfirmModal from './ConfirmModal';

const TURMA_OPTIONS = TURMAS.filter(t => t !== 'Todas as Turmas');
const BUCKET = 'mural-fotos';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export default function AdminMuralFotos({ currentUser, currentSchool }) {
  const [fotos, setFotos] = useState([]);
  const [urls, setUrls] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [caption, setCaption] = useState('');
  const [selectedTurmas, setSelectedTurmas] = useState([]);
  const [sendToAll, setSendToAll] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteFoto, setConfirmDeleteFoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const schoolId = currentSchool?.id || currentUser?.school_id;
  const lightboxFoto = lightboxIndex !== null ? fotos[lightboxIndex] : null;

  const showPrev = useCallback(() => {
    setLightboxIndex(i => (i === null ? null : (i - 1 + fotos.length) % fotos.length));
  }, [fotos.length]);
  const showNext = useCallback(() => {
    setLightboxIndex(i => (i === null ? null : (i + 1) % fotos.length));
  }, [fotos.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e) => {
      if (e.key === 'ArrowLeft') showPrev();
      else if (e.key === 'ArrowRight') showNext();
      else if (e.key === 'Escape') setLightboxIndex(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, showPrev, showNext]);

  const handleDownload = async (foto) => {
    const url = urls.get(foto.storage_path);
    if (!url) return;
    setIsDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = foto.storage_path.split('/').pop() || 'foto.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[AdminMuralFotos] Erro ao baixar foto:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const fetchFotos = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('mural_fotos')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setFotos(data || []);

      const paths = (data || []).map(f => f.storage_path);
      const signedUrls = await getSignedUrls(BUCKET, paths);
      setUrls(signedUrls);
    } catch (err) {
      console.error('[AdminMuralFotos] Erro ao buscar:', err);
      setError('Não foi possível carregar as fotos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFotos();
  }, [schoolId]);

  const resetForm = () => {
    setShowForm(false);
    setPendingFiles([]);
    setCaption('');
    setSelectedTurmas([]);
    setSendToAll(true);
  };

  const toggleTurma = (t) => {
    setSelectedTurmas(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';

    const accepted = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Tipo de arquivo não permitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`Foto muito grande (máx. 10MB): ${file.name}`);
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

  const handleUpload = async () => {
    if (pendingFiles.length === 0 || !schoolId) return;
    if (!sendToAll && selectedTurmas.length === 0) {
      setError('Selecione ao menos uma turma, ou marque "Todas as Turmas".');
      return;
    }

    setIsUploading(true);
    setError('');
    try {
      const turmasValue = sendToAll ? null : selectedTurmas;
      const rows = [];
      for (const file of pendingFiles) {
        const path = `${schoolId}/${buildSafeFileName(file)}`;
        await uploadFile(BUCKET, path, file);
        rows.push({
          school_id: schoolId,
          storage_path: path,
          caption: caption.trim() || null,
          turmas: turmasValue,
          uploaded_by: currentUser.id,
        });
      }
      const { error: insertError } = await supabase.from('mural_fotos').insert(rows);
      if (insertError) throw insertError;

      notifyFamilies({
        type: 'mural_fotos',
        title: rows.length > 1 ? `${rows.length} novas fotos no mural` : 'Nova foto no mural',
        message: caption.trim() || 'A escola compartilhou novas fotos.',
        url: '/?tab=mural-fotos',
        turmas: turmasValue,
      });

      resetForm();
      await fetchFotos();
    } catch (err) {
      console.error('[AdminMuralFotos] Erro ao enviar fotos:', err);
      setError('Não foi possível enviar uma ou mais fotos.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (foto) => setConfirmDeleteFoto(foto);

  const confirmDelete = async () => {
    const foto = confirmDeleteFoto;
    setDeletingId(foto.id);
    try {
      const { error: deleteError } = await supabase.from('mural_fotos').delete().eq('id', foto.id);
      if (deleteError) throw deleteError;
      await removeFile(BUCKET, foto.storage_path).catch(err => console.warn('[AdminMuralFotos] Falha ao limpar arquivo:', err));
      setFotos(prev => prev.filter(f => f.id !== foto.id));
      if (lightboxFoto?.id === foto.id) setLightboxIndex(null);
    } catch (err) {
      console.error('[AdminMuralFotos] Erro ao excluir:', err);
      setError('Não foi possível excluir essa foto.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteFoto(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <ImageIcon size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Mural de Fotos</h2>
            <p className="text-slate-500 text-sm hidden sm:block">Compartilhe fotos com as famílias, por turma ou para todos.</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
          >
            <Upload size={18} /> <span className="hidden sm:inline">Adicionar Fotos</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {showForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Adicionar fotos</h3>
              <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>

            {pendingFiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group">
                    <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePendingFile(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-lg p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="inline-flex items-center gap-2 bg-white border border-dashed border-slate-300 hover:border-indigo-400 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer transition">
              <Upload size={14} /> Escolher fotos (até 10MB cada)
              <input type="file" multiple accept={ALLOWED_TYPES.join(',')} onChange={handleFilesSelected} className="hidden" />
            </label>

            <input
              type="text"
              placeholder="Legenda (opcional, aplicada a todas as fotos deste envio)"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              maxLength={200}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm"
            />

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                <Users size={12} /> Visível para
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSendToAll(true); setSelectedTurmas([]); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    sendToAll ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
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
                        isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleUpload}
              disabled={isUploading || pendingFiles.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
            >
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Publicar {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ''}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : fotos.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ImageIcon className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhuma foto publicada ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {fotos.map((foto, index) => (
              <div key={foto.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-100">
                {urls.get(foto.storage_path) ? (
                  <img
                    src={urls.get(foto.storage_path)}
                    alt={foto.caption || 'Foto do mural'}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setLightboxIndex(index)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 size={18} className="animate-spin text-slate-300" />
                  </div>
                )}
                <button
                  onClick={() => handleDelete(foto)}
                  disabled={deletingId === foto.id}
                  className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-lg p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
                >
                  {deletingId === foto.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
                {!foto.turmas && (
                  <span className="absolute bottom-1.5 left-1.5 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-black/60 text-white">
                    Geral
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxFoto && (
        <div className="fixed inset-0 z-[999] bg-slate-900/90 flex items-center justify-center p-4" onClick={() => setLightboxIndex(null)}>
          <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-xl transition" onClick={() => setLightboxIndex(null)}>
            <X size={24} />
          </button>

          {fotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); showPrev(); }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-xl transition"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); showNext(); }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-xl transition"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <div className="max-w-3xl max-h-full flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img src={urls.get(lightboxFoto.storage_path)} alt={lightboxFoto.caption || 'Foto do mural'} className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {lightboxFoto.caption && <p className="text-white text-sm font-medium text-center">{lightboxFoto.caption}</p>}
              <button
                onClick={() => handleDownload(lightboxFoto)}
                disabled={isDownloading}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Baixar
              </button>
              <button
                onClick={() => handleDelete(lightboxFoto)}
                disabled={deletingId === lightboxFoto.id}
                className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-100 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {deletingId === lightboxFoto.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteFoto && (
        <ConfirmModal
          title="Excluir foto"
          message="Excluir esta foto do mural? Essa ação não pode ser desfeita."
          isLoading={deletingId === confirmDeleteFoto.id}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteFoto(null)}
        />
      )}
    </div>
  );
}
