import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import TooltipBi, { EIXO_PROPS, GRADE_PROPS } from './TooltipBi';

// Colunas agrupadas (uma ou mais séries). Um único eixo Y.
// dados: [{ [eixo]: 'Set/26', serie1: 10, serie2: 8 }]
// series: [{ id, label, cor }]; ocultas: Set de ids; formatar: valor → texto.
// divergente: colore por sinal (positivo/negativo) com as cores informadas.
// empilhado: as séries se somam numa só coluna (cantos arredondados só no topo da última).
export default function Colunas({ dados, eixo = 'rotulo', series, ocultas = new Set(), formatar, formatarEixo, divergente = null, empilhado = false }) {
  const visiveis = series.filter(s => !ocultas.has(s.id));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid {...GRADE_PROPS} />
        <XAxis dataKey={eixo} {...EIXO_PROPS} interval="preserveStartEnd" />
        <YAxis {...EIXO_PROPS} width={52} tickFormatter={formatarEixo || formatar} />
        <Tooltip content={<TooltipBi formatar={formatar} />} cursor={{ fill: 'var(--color-primary)', fillOpacity: 0.06 }} />
        {visiveis.map((s, i) => (
          <Bar
            key={s.id} dataKey={s.id} name={s.label} fill={s.cor} maxBarSize={36} isAnimationActive={false}
            stackId={empilhado ? 'pilha' : undefined}
            radius={empilhado ? (i === visiveis.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
            stroke={empilhado ? 'var(--color-surface-container-lowest)' : undefined} strokeWidth={empilhado ? 1 : 0}
          >
            {divergente && dados.map((d, i) => <Cell key={i} fill={d[s.id] < 0 ? divergente.negativo : d[s.id] > 0 ? divergente.positivo : divergente.zero} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
