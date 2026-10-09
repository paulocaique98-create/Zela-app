import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { subscribeToasts } from '../lib/toast';

const STYLES = {
  success: { icon: CheckCircle2, cls: 'bg-surface-container-lowest border-outline-variant border-l-success text-on-surface', iconCls: 'text-success' },
  error: { icon: AlertCircle, cls: 'bg-surface-container-lowest border-outline-variant border-l-error text-on-surface', iconCls: 'text-error' },
  info: { icon: Info, cls: 'bg-surface-container-lowest border-outline-variant border-l-primary text-on-surface', iconCls: 'text-primary' },
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
        const { icon: Icon, cls, iconCls } = STYLES[t.type] || STYLES.info;
        return (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2 p-3 rounded-zela-md border border-l-4 shadow-md text-sm font-medium ${cls}`}>
            <Icon size={18} aria-hidden="true" className={`shrink-0 mt-0.5 ${iconCls}`} />
            <span className="flex-1 whitespace-pre-wrap">{t.message}</span>
            <button onClick={() => setItems(prev => prev.filter(i => i.id !== t.id))} className="shrink-0 -m-2 p-2 min-w-11 min-h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface" aria-label="Fechar aviso">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
