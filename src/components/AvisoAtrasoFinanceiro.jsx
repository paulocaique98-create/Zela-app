import React from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '');

// Aviso fixo no topo enquanto há parcela do Zela em atraso e a escola ainda não foi bloqueada.
// Os dados vêm de meu_aviso_atraso (servidor): a Gestão recebe parcela, valor e link;
// a Recepção recebe só a data do bloqueio.
export default function AvisoAtrasoFinanceiro({ aviso }) {
  if (!aviso) return null;
  const cob = aviso.cobranca;
  const bloqueioEm = cob?.bloqueio_em || aviso.bloqueio_em;

  return (
    <div role="alert" className="shrink-0 bg-brass-50 border-b border-brass text-on-surface px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-2 font-medium text-brass">
          <AlertTriangle size={16} className="shrink-0" />
          {cob ? 'Pagamento do Zela em atraso' : 'Pendência financeira da escola'}
        </span>
        {cob ? (
          <span>
            {cob.tipo === 'implantacao' ? 'Implantação' : `Parcela ${cob.numero}`}, {brl(cob.valor)}, vencida em {dataBR(cob.vencimento)}
            {' '}({cob.dias_atraso} {cob.dias_atraso === 1 ? 'dia' : 'dias'} de atraso).
          </span>
        ) : (
          <span>Procure a Gestão para regularizar.</span>
        )}
        <span>
          O acesso será suspenso em {dataBR(bloqueioEm)}. Com a suspensão, volte ao controle manual de retirada.
        </span>
        {cob?.invoice_url && (
          <a
            href={cob.invoice_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-zela-md bg-brass text-white px-3 py-1 font-medium"
          >
            <ExternalLink size={14} /> Pagar agora
          </a>
        )}
      </div>
    </div>
  );
}
