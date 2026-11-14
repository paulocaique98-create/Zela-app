import React from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import useAssinaturaZela from '../hooks/useAssinaturaZela';
import { brl, formatarData } from '../lib/planosZela';
import { statusParcela, nomeParcela, linkSeguro, resumoParcelas } from '../lib/assinaturaZela';

const TOM = {
  ok: 'bg-success/10 text-success border-success/30',
  alerta: 'bg-brass-50 text-brass border-brass',
  neutro: 'bg-surface-container text-on-surface-variant border-outline-variant',
};

function Etiqueta({ status }) {
  const s = statusParcela(status);
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-sm border ${TOM[s.tom]}`}>{s.label}</span>;
}

function Link({ url }) {
  const href = linkSeguro(url);
  if (!href) return <span className="text-small text-on-surface-variant">Sem link</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-small font-medium text-primary hover:underline">
      <ExternalLink size={14} /> Abrir link
    </a>
  );
}

// Assinatura da escola com o Zela: todas as parcelas e os links de pagamento. Só leitura.
export default function GestaoParcelasZela() {
  const { parcelas, recarregar } = useAssinaturaZela();

  if (parcelas === undefined) return <p className="text-small text-on-surface-variant">Carregando parcelas...</p>;
  if (parcelas === null) {
    return (
      <p className="text-small text-on-surface-variant">
        Não foi possível carregar as parcelas. <button type="button" onClick={recarregar} className="text-primary font-medium">Tentar de novo</button>
      </p>
    );
  }

  const r = resumoParcelas(parcelas);

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-small font-bold text-on-surface">Parcelas e pagamentos</p>
        <button type="button" onClick={recarregar} className="inline-flex items-center gap-1 text-small text-on-surface-variant hover:text-on-surface" aria-label="Atualizar parcelas">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {parcelas.length === 0 ? (
        <p className="text-small text-on-surface-variant">Nenhuma cobrança registrada ainda. Quando o Zela Edu gerar os links de pagamento, eles aparecem aqui.</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><dt className="text-xs text-on-surface-variant">Pago</dt><dd className="text-small font-bold text-on-surface">{brl(r.pago)}</dd></div>
            <div><dt className="text-xs text-on-surface-variant">Em aberto</dt><dd className="text-small font-bold text-on-surface">{brl(r.emAberto)}</dd></div>
            <div>
              <dt className="text-xs text-on-surface-variant">Próximo vencimento</dt>
              <dd className="text-small font-bold text-on-surface">{r.proxima ? `${formatarData(r.proxima.vencimento)}, ${brl(r.proxima.valor)}` : 'Nada em aberto'}</dd>
            </div>
          </dl>

          <ul className="divide-y divide-outline-variant">
            {parcelas.map((p) => (
              <li key={`${p.tipo}-${p.numero}-${p.vencimento}-${p.contrato_ciclo}`} className="py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-small font-medium text-on-surface">{nomeParcela(p)}</p>
                  <p className="text-xs text-on-surface-variant">
                    Vence em {formatarData(p.vencimento)}
                    {p.status === 'paga' && p.paga_em ? `, paga em ${formatarData(String(p.paga_em).slice(0, 10))}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-small font-medium text-on-surface">{brl(p.valor)}</span>
                  <Etiqueta status={p.status} />
                  {(p.status === 'pendente' || p.status === 'vencida') && <Link url={p.invoice_url} />}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
