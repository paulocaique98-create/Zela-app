import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import TooltipBi, { EIXO_PROPS, GRADE_PROPS } from './TooltipBi';

// Linhas de 2px, marcadores de 8px, crosshair e tooltip com todas as séries.
export default function Linha({ dados, eixo = 'rotulo', series, ocultas = new Set(), formatar, formatarEixo }) {
  const visiveis = series.filter(s => !ocultas.has(s.id));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={dados} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRADE_PROPS} />
        <XAxis dataKey={eixo} {...EIXO_PROPS} interval="preserveStartEnd" />
        <YAxis {...EIXO_PROPS} width={52} tickFormatter={formatarEixo || formatar} />
        <Tooltip content={<TooltipBi formatar={formatar} />} cursor={{ stroke: 'var(--color-outline)', strokeDasharray: '3 3' }} />
        {visiveis.map(s => (
          <Line
            key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={s.cor} strokeWidth={2}
            dot={{ r: 4, fill: s.cor, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
