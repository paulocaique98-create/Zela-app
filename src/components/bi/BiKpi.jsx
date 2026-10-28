import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { StatCard } from '../GestaoShared';

const TOM_COR = { good: 'text-success', bad: 'text-error', neutral: 'text-on-surface-variant' };
const ICONE = { up: ArrowUp, down: ArrowDown, flat: Minus };

// StatCard com a variação contra o período de comparação. A cor de status
// nunca vai sozinha: sempre seta + texto ("12% acima").
// variacao: resultado de calcularVariacao() ou null.
export default function BiKpi({ label, value, hint, variacao = null, tone = 'default', onClick, className = '' }) {
  const Icone = variacao ? ICONE[variacao.direcao] : null;
  const rodape = (hint || variacao) && (
    <>
      {variacao && (
        <span className={`inline-flex items-center gap-1 font-semibold ${TOM_COR[variacao.tom]}`}>
          <Icone size={12} aria-hidden="true" />
          {variacao.texto}
        </span>
      )}
      {variacao && hint ? ' · ' : null}
      {hint}
    </>
  );
  return <StatCard label={label} value={value} hint={rodape || undefined} tone={tone} onClick={onClick} className={className} />;
}
