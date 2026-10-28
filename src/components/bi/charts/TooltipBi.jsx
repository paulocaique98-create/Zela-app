import React from 'react';

export const EIXO_PROPS = {
  tick: { fill: 'var(--color-on-surface-variant)', fontSize: 11 },
  axisLine: false,
  tickLine: false,
};
export const GRADE_PROPS = { stroke: 'var(--color-outline-variant)', strokeOpacity: 0.6, vertical: false };

// Tooltip com todas as séries do ponto. formatar(valor, serie) devolve o texto.
export default function TooltipBi({ active, payload, label, formatar, rotulo }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-md shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-on-surface mb-1">{rotulo ? rotulo(label, payload[0]?.payload) : label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="flex items-center gap-2 text-on-surface-variant">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.payload?.fill }} aria-hidden="true" />
          <span>{p.name}:</span>
          <span className="font-semibold text-on-surface">{formatar ? formatar(p.value, p) : p.value}</span>
        </p>
      ))}
    </div>
  );
}
