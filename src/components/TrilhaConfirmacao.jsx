import React from 'react';

// Trilha de confirmação (assinatura visual do Zela): responsável, totem,
// recepção, concluído. Só apresentação: quem usa informa em que etapa está.
// `etapas`: [{ rotulo, detalhe? }]. `atual`: índice da etapa em andamento;
// as anteriores aparecem como feitas. Use atual >= etapas.length para tudo feito.
export const ETAPAS_CHECKIN = [
  { rotulo: 'Responsável' },
  { rotulo: 'Totem' },
  { rotulo: 'Recepção' },
  { rotulo: 'Concluído' },
];

export default function TrilhaConfirmacao({ etapas = ETAPAS_CHECKIN, atual = 0, className = '' }) {
  return (
    <ol aria-label="Etapas da confirmação" className={`grid grid-cols-2 gap-y-3 sm:grid-cols-4 list-none p-0 m-0 ${className}`}>
      {etapas.map((etapa, i) => {
        const feito = i < atual;
        const emCurso = i === atual;
        const estado = feito ? 'feita' : emCurso ? 'em andamento' : 'pendente';
        return (
          <li
            key={etapa.rotulo}
            aria-current={emCurso ? 'step' : undefined}
            className={`relative pt-[22px] text-xs ${feito || emCurso ? 'text-on-surface' : 'text-on-surface-variant'} ${emCurso ? 'font-semibold' : ''}`}
          >
            <span aria-hidden="true" className={`absolute top-1 left-0 right-0 h-0.5 ${feito ? 'bg-primary' : 'bg-outline-variant'}`} />
            <span
              aria-hidden="true"
              className={`absolute top-0 left-0 w-2.5 h-2.5 rounded-full border-2 ${feito ? 'bg-primary border-primary' : emCurso ? 'bg-brass-50 border-brass ring-4 ring-brass-50' : 'bg-surface-container-lowest border-outline-variant'}`}
            />
            {etapa.rotulo}
            <span className="sr-only"> ({estado})</span>
            {etapa.detalhe ? <small className="block font-normal text-on-surface-variant">{etapa.detalhe}</small> : null}
          </li>
        );
      })}
    </ol>
  );
}
