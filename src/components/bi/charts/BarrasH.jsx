import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts';
import TooltipBi, { EIXO_PROPS } from './TooltipBi';

// Barras horizontais de uma série, uma cor por item (cor da entidade ou da escala).
// dados: [{ nome, valor, cor }]. onSelecionar(nome) liga o filtro cruzado;
// selecionados: Set de nomes ativos (os demais ficam esmaecidos).
export default function BarrasH({ dados, formatar, onSelecionar, selecionados = new Set(), larguraRotulo = 110, rotuloSerie = 'Valor' }) {
  const temSelecao = selecionados.size > 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 0 }} barCategoryGap={2}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="nome" {...EIXO_PROPS} width={larguraRotulo} interval={0} />
        <Tooltip content={<TooltipBi formatar={formatar} />} cursor={{ fill: 'var(--color-primary)', fillOpacity: 0.06 }} />
        <Bar
          dataKey="valor" name={rotuloSerie} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}
          onClick={onSelecionar ? (d) => onSelecionar(d.nome) : undefined}
          style={onSelecionar ? { cursor: 'pointer' } : undefined}
        >
          {dados.map(d => (
            <Cell key={d.nome} fill={d.cor} fillOpacity={temSelecao && !selecionados.has(d.nome) ? 0.35 : 1} />
          ))}
          <LabelList dataKey="valor" position="right" formatter={formatar} fill="var(--color-on-surface)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
