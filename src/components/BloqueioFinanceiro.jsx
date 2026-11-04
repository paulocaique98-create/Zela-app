import React from 'react';
import { Lock, ExternalLink, LogOut } from 'lucide-react';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Tela única da Gestão enquanto a escola está bloqueada por inadimplência.
// Os dados vêm de meu_estado_bloqueio (servidor, só da escola de quem está logado).
export default function BloqueioFinanceiro({ estado, onLogout }) {
  const cob = estado?.cobranca;
  return (
    <div className="min-h-screen flex items-center justify-center bg-brass-50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-brass bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <Lock className="text-brass shrink-0" size={28} />
          <h1 className="text-xl font-semibold text-brass">Acesso suspenso por pendência financeira</h1>
        </div>
        <p className="text-sm text-on-surface-variant mb-4">
          Enquanto a pendência não for paga, o sistema fica fora do ar para toda a escola. Check in e check out,
          autorizados para retirada e reconhecimento facial estão parados. Volte ao controle manual de retirada
          até a liberação. Nenhum dado foi apagado.
        </p>
        {cob ? (
          <div className="rounded-xl border border-brass bg-brass-50 p-4 mb-4 text-sm text-on-surface space-y-1">
            <div><span className="font-medium">{cob.tipo === 'implantacao' ? 'Cobrança:' : 'Parcela:'}</span> {cob.tipo === 'implantacao' ? 'Implantação' : cob.numero}</div>
            <div><span className="font-medium">Valor:</span> {brl(cob.valor)}</div>
            <div><span className="font-medium">Vencimento:</span> {dataBR(cob.vencimento)}</div>
            <div><span className="font-medium">Dias de atraso:</span> {cob.dias_atraso}</div>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant mb-4">
            O acesso foi suspenso pela Zela. Entre em contato para regularizar.
          </p>
        )}
        {cob?.invoice_url && (
          <a
            href={cob.invoice_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-brass text-white py-3 font-medium mb-3"
          >
            <ExternalLink size={18} /> Pagar agora
          </a>
        )}
        <p className="text-xs text-on-surface-variant mb-3">O acesso volta sozinho assim que o pagamento é confirmado.</p>
        <button type="button" onClick={onLogout} className="flex items-center gap-2 text-sm text-on-surface-variant hover:underline">
          <LogOut size={16} /> Sair
        </button>
      </div>
    </div>
  );
}
