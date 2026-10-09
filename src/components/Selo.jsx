import React from 'react';

// Selo de estado: etiqueta pequena (raio 4) com cor sóbria. O texto sempre diz
// o estado, a cor só reforça. `tom`: neutro | ok | atencao | risco | petroleo | latao.
const TONS = {
  neutro: 'bg-surface-container-low text-on-surface-variant',
  ok: 'bg-success/10 text-success',
  atencao: 'bg-warning/10 text-warning',
  risco: 'bg-error/10 text-error',
  petroleo: 'bg-primary/10 text-primary',
  latao: 'bg-brass-50 text-warning',
};

export default function Selo({ tom = 'neutro', icon: Icon, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-sm ${TONS[tom] || TONS.neutro} ${className}`}>
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
