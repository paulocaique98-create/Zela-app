import React from 'react';

// Indicador numérico: cartão com borda fina e faixa superior que codifica o
// estado. `tom`: neutro | ok | atencao | risco | petroleo. `mono` usa fonte
// técnica de largura fixa (Portal do Dev).
const FAIXAS = {
  neutro: 'border-t-outline-variant',
  ok: 'border-t-success',
  atencao: 'border-t-warning',
  risco: 'border-t-error',
  petroleo: 'border-t-primary',
};

export default function Indicador({ rotulo, valor, detalhe, tom = 'neutro', mono = false, className = '' }) {
  return (
    <div className={`p-4 bg-surface-container-lowest border border-outline-variant border-t-[3px] rounded-zela-md ${FAIXAS[tom] || FAIXAS.neutro} ${className}`}>
      <p className="text-sm text-on-surface-variant">{rotulo}</p>
      <p className={`mt-1.5 text-3xl font-semibold leading-tight tabular-nums text-on-surface ${mono ? 'font-mono' : ''}`}>{valor}</p>
      {detalhe ? <p className="mt-1.5 text-sm text-on-surface-variant">{detalhe}</p> : null}
    </div>
  );
}
