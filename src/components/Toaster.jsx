import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { subscribeToasts } from '../lib/toast';

const STYLES = {
  success: { icon: CheckCircle2, cls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  error: { icon: AlertCircle, cls: 'bg-red-50 border-red-200 text-red-800' },
  info: { icon: Info, cls: 'bg-surface-container-lowest border-outline-variant text-on-surface' },
};

// Mostra os avisos de src/lib/toast.js. No celular ficam acima da barra
// inferior da Família; no computador, no canto inferior direito.
export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => subscribeToasts((t) => {
    setItems(prev => [...prev.slice(-3), t]);
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== t.id)), t.durationMs);
  }), []);

  if (items.length === 0) return null;
  return (
    <div
      className="fixed z-[1000] left-3 right-3 sm:left-auto sm:right-5 sm:w-96 flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      role="status"
      aria-live="polite"
    >
      {items.map(t => {
        const { icon: Icon, cls } = STYLES[t.type] || STYLES.info;
        return (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2 p-3 rounded-zela-lg border shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${cls}`}>
            <Icon size={18} className="shrink-0 mt-0.5" />
            <span className="flex-1 whitespace-pre-wrap">{t.message}</span>
            <button onClick={() => setItems(prev => prev.filter(i => i.id !== t.id))} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Fechar aviso">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
