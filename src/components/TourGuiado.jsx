import { useEffect, useMemo, useRef, useState } from 'react';
import { passosDoTour } from '../lib/ajuda/tour';

// Tour guiado em janela: um passo por menu da Central de Ajuda. Teclado:
// setas navegam, Esc pula. Concluir e pular chamam onFechar (grava o "já viu").
export default function TourGuiado({ perfil, method = null, onFechar }) {
  const passos = useMemo(() => passosDoTour(perfil, method), [perfil, method]);
  const [i, setI] = useState(0);
  const botaoRef = useRef(null);
  const ultimo = i === passos.length - 1;
  const passo = passos[i];

  useEffect(() => { botaoRef.current?.focus(); }, [i]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onFechar();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, passos.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar, passos.length]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="tour-titulo">
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-xl">
        <p className="text-xs font-semibold text-brass">Passo {i + 1} de {passos.length}</p>
        <h2 id="tour-titulo" className="font-serif text-xl font-bold text-on-surface mt-1">{passo.titulo}</h2>
        <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{passo.texto}</p>

        <div className="mt-4 h-1 rounded bg-outline-variant/60" aria-hidden="true">
          <div className="h-1 rounded bg-brass" style={{ width: `${((i + 1) / passos.length) * 100}%` }} />
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={onFechar} className="min-h-[44px] px-3 text-sm font-semibold text-on-surface-variant hover:underline">
            Pular tour
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="min-h-[44px] px-4 rounded-lg border border-outline-variant text-sm font-semibold text-on-surface hover:border-brass">
                Voltar
              </button>
            )}
            <button
              ref={botaoRef}
              type="button"
              onClick={() => (ultimo ? onFechar() : setI(i + 1))}
              className="min-h-[44px] px-4 rounded-lg bg-brass text-sm font-semibold text-on-surface hover:opacity-90"
            >
              {ultimo ? 'Concluir' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
