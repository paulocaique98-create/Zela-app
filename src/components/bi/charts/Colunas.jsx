import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import TooltipBi, { EIXO_PROPS, GRADE_PROPS } from './TooltipBi';

// Colunas agrupadas (uma ou mais séries). Um único eixo Y.
// dados: [{ [eixo]: 'Set/26', serie1: 10, serie2: 8 }]
// series: [{ id, label, cor }]; ocultas: Set de ids; formatar: valor → texto.
// divergente: colore por sinal (positivo/negativo) com as cores informadas.
export default function Colunas({ dados, eixo = 'rotulo', series, ocultas = new Set(), formatar, formatarEixo, divergente = null }) {
  const visiveis = series.filter(s => !ocultas.has(s.id));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid {...GRADE_PROPS} />
        <XAxis dataKey={eixo} {...EIXO_PROPS} interval="preserveStartEnd" />
        <YAxis {...EIXO_PROPS} width={52} tickFormatter={formatarEixo || formatar} />
        <Tooltip content={<TooltipBi formatar={formatar} />} cursor={{ fill: 'var(--color-primary)', fillOpacity: 0.06 }} />
        {visiveis.map(s => (
          <Bar key={s.id} dataKey={s.id} name={s.label} fill={s.cor} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            {divergente && dados.map((d, i) => <Cell key={i} fill={d[s.id] < 0 ? divergente.negativo : d[s.id] > 0 ? divergente.positivo : divergente.zero} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
