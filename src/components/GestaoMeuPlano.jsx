import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading } from './GestaoShared';
import { ITEM_POR_ID } from '../lib/modulosCatalogo';
import { CICLOS, brl, diasParaVencer, formatarData } from '../lib/planosZela';

// Meu plano: o plano que a escola contratou com o Zela, valores e vencimento.
// Lê só pela RPC meu_plano_escola (própria escola, sem custo do Zela).
export default function GestaoMeuPlano() {
  const [plano, setPlano] = useState(undefined);

  useEffect(() => {
    supabase.rpc('meu_plano_escola').then(({ data, error }) => setPlano(error ? null : data));
  }, []);

  if (plano === undefined) return <Loading />;

  if (!plano) {
    return (
      <PageShell description="O plano contratado pela escola com o Zela Escola.">
        <p className="text-small text-on-surface-variant">Nenhum plano registrado ainda. Fale com o suporte do Zela Escola para conferir a contratação.</p>
      </PageShell>
    );
  }

  const ciclo = CICLOS.find(c => c.id === plano.ciclo)?.label || plano.ciclo;
  const dias = diasParaVencer(plano.fim);
  const itens = ['base', ...(plano.itens || [])].map(id => ITEM_POR_ID[id]?.nome || id);
  const linha = (rotulo, valor) => (
    <div className="flex justify-between gap-4 py-2 border-b border-outline-variant last:border-0">
      <dt className="text-small text-on-surface-variant">{rotulo}</dt>
      <dd className="text-small font-medium text-on-surface text-right">{valor}</dd>
    </div>
  );

  return (
    <PageShell description="O plano contratado pela escola com o Zela Escola.">
      <div className="max-w-2xl space-y-4">
        {dias !== null && dias <= 30 && (
          <div className={`flex items-center gap-2 text-small px-4 py-3 rounded-lg border ${dias < 0 ? 'bg-error/10 border-error/30 text-error' : 'bg-warning/10 border-warning/30 text-warning'}`}>
            {dias < 0 ? <AlertTriangle size={16} /> : <CalendarClock size={16} />}
            {dias < 0 ? 'A contratação venceu. Fale com o suporte do Zela Escola para renovar.' : `A contratação vence em ${dias} dia(s).`}
          </div>
        )}
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-5">
          <p className="text-lg font-bold text-on-surface">{plano.plano}</p>
          <p className="text-small text-on-surface-variant mb-3">{plano.modalidade === 'por_aluno' ? 'Cobrança por aluno' : 'Pacote'}, ciclo {ciclo.toLowerCase()}</p>
          <dl>
            {linha('Alunos contratados', plano.alunos_contratados)}
            {linha('Mensalidade', brl(plano.valor_mensal))}
            {linha(`Valor do ciclo ${ciclo.toLowerCase()}`, brl(plano.valor_ciclo))}
            {linha('Implantação', brl(plano.implantacao_final))}
            {linha('Início', formatarData(plano.inicio))}
            {linha('Vencimento', formatarData(plano.fim))}
          </dl>
        </div>
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-5">
          <p className="text-small font-bold text-on-surface mb-2">O que o plano inclui</p>
          <ul className="list-disc pl-5 text-small text-on-surface-variant space-y-1">
            {itens.map(n => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
