import React, { useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, Loader2, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSignedUrls } from '../lib/storage';

const BUCKET = 'mural-fotos';

export default function FamilyMuralFotos({ currentUser, currentSchool }) {
  const [fotos, setFotos] = useState([]);
  const [urls, setUrls] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
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
      console.error('[FamilyMuralFotos] Erro ao baixar foto:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!schoolId) return;
      setIsLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('mural_fotos')
          .select('*')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false })
          .limit(300);
        if (fetchError) throw fetchError;
        setFotos(data || []);

        const paths = (data || []).map(f => f.storage_path);
        const signedUrls = await getSignedUrls(BUCKET, paths);
        setUrls(signedUrls);
      } catch (err) {
        console.error('[FamilyMuralFotos] Erro ao buscar:', err);
        setError('Não foi possível carregar as fotos.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolId]);

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <ImageIcon size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Mural de Fotos</h2>
          <p className="text-on-surface-variant text-small hidden sm:block">Fotos compartilhadas pela escola.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium mb-4">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : fotos.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <ImageIcon className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhuma foto publicada ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {fotos.map((foto, index) => (
              <button
                key={foto.id}
                onClick={() => setLightboxIndex(index)}
                className="relative aspect-square rounded-zela-md overflow-hidden border border-outline-variant bg-surface-container"
              >
                {urls.get(foto.storage_path) ? (
                  <img src={urls.get(foto.storage_path)} alt={foto.caption || 'Foto do mural'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 size={18} className="animate-spin text-outline-variant" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxFoto && (
        <div className="fixed inset-0 z-[999] bg-slate-900/90 flex items-center justify-center p-4" onClick={() => setLightboxIndex(null)}>
          <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-zela-md transition" onClick={() => setLightboxIndex(null)}>
            <X size={24} />
          </button>

          {fotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); showPrev(); }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-zela-md transition"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); showNext(); }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-zela-md transition"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <div className="max-w-3xl max-h-full flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img src={urls.get(lightboxFoto.storage_path)} alt={lightboxFoto.caption || 'Foto do mural'} className="max-w-full max-h-[80vh] rounded-zela-lg object-contain" />
            <div className="flex items-center gap-3">
              {lightboxFoto.caption && <p className="text-white text-sm font-medium text-center">{lightboxFoto.caption}</p>}
              <button
                onClick={() => handleDownload(lightboxFoto)}
                disabled={isDownloading}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-zela-md text-xs font-bold transition disabled:opacity-50"
              >
                {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Baixar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
