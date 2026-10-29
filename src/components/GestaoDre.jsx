import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Settings2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { centsToBRL } from '../lib/gestaoUtils';
import { rotuloMes } from '../lib/bi/formatos';
import { baixarXlsxAba } from '../lib/bi/exportar';
import { GRUPOS_DRE, montarDre } from '../lib/financeiroAvancado';
import { PageShell, Loading, Notice, EmptyState, SecondaryButton, inputCls } from './GestaoShared';
import { EXPENSE_CATEGORIES } from './GestaoFornecedores';

const REGIMES = { caixa: 'Caixa (pago no período)', competencia: 'Competência (vence no período)' };

function periodo(meses) {
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { inicio: iso(ini), fim: iso(fim) };
}

// Financeiro, DRE (módulo financeiro_avancado). Só Gestão; o banco também barra (fin_dre).
export default function GestaoDre({ currentUser }) {
  const [meses, setMeses] = useState(6);
  const [regime, setRegime] = useState('caixa');
  const [raw, setRaw] = useState(null);
  const [erro, setErro] = useState('');
  const [mapaAberto, setMapaAberto] = useState(false);
  const [mapa, setMapa] = useState({});
  const p = useMemo(() => periodo(meses), [meses]);

  const carregar = useCallback(async () => {
    setRaw(null);
    setErro('');
    const { data, error } = await supabase.rpc('fin_dre', { p_inicio: p.inicio, p_fim: p.fim, p_regime: regime });
    if (error) { setErro('Não foi possível carregar o DRE.'); setRaw({}); return; }
    setRaw(data);
  }, [p, regime]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!mapaAberto) return;
    supabase.from('expense_categories').select('nome, grupo_dre').eq('school_id', currentUser.school_id)
      .then(({ data }) => setMapa(Object.fromEntries((data || []).map(c => [c.nome, c.grupo_dre]))));
  }, [mapaAberto, currentUser.school_id]);

  const dre = useMemo(() => (raw ? montarDre(raw, p.inicio, p.fim) : null), [raw, p]);

  const salvarGrupo = async (nome, grupo) => {
    setMapa(m => ({ ...m, [nome]: grupo }));
    const { error } = await supabase.from('expense_categories')
      .upsert({ school_id: currentUser.school_id, nome, grupo_dre: grupo }, { onConflict: 'school_id,nome' });
    if (error) setErro('Não foi possível salvar o grupo.'); else carregar();
  };

  const linhasPlanilha = () => {
    if (!dre) return [];
    const linha = (nome, l) => ({ nome, ...Object.fromEntries(dre.meses.map(m => [m, (l.porMes[m] || 0) / 100])), total: l.total / 100 });
    return [
      linha('Receita', dre.receita),
      ...dre.grupos.map(g => linha(`(−) ${g.nome}`, g)),
      linha('(−) Total de despesas', dre.despesas),
      linha('Resultado', dre.resultado),
    ];
  };
  const baixar = () => baixarXlsxAba(`dre-${regime}-${p.inicio.slice(0, 7)}-${p.fim.slice(0, 7)}`, [{
    titulo: 'DRE',
    linhas: linhasPlanilha(),
    colunas: [{ label: 'Linha', value: 'nome' }, ...dre.meses.map(m => ({ label: rotuloMes(m), value: m })), { label: 'Total', value: 'total' }],
  }]);

  const vazio = dre && dre.receita.total === 0 && dre.despesas.total === 0;
  const celula = (v, negativoRuim = false) => (
    <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${negativoRuim && v < 0 ? 'text-error' : ''}`}>{centsToBRL(v)}</td>
  );

  return (
    <PageShell actions={(
      <>
        <select value={meses} onChange={e => setMeses(Number(e.target.value))} className={`${inputCls} !w-auto`} aria-label="Período">
          <option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option>
        </select>
        <select value={regime} onChange={e => setRegime(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Regime">
          {Object.entries(REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <SecondaryButton onClick={() => setMapaAberto(v => !v)}><Settings2 size={15} /> <span className="hidden sm:inline">Grupos das despesas</span></SecondaryButton>
        {dre && !vazio && <SecondaryButton onClick={baixar} aria-label="Baixar planilha"><Download size={15} /> <span className="hidden sm:inline">Planilha</span></SecondaryButton>}
      </>
    )}>
      <Notice>{erro}</Notice>

      {mapaAberto && (
        <section className="mb-4 bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
          <h3 className="font-bold text-sm text-on-surface mb-1">Grupos das despesas</h3>
          <p className="text-xs text-on-surface-variant mb-3">Define em qual linha do DRE cada categoria entra. Sem grupo, a categoria cai em Outros.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXPENSE_CATEGORIES.map(nome => (
              <label key={nome} className="flex items-center justify-between gap-3 text-sm text-on-surface">
                <span className="min-w-0 truncate">{nome}</span>
                <select value={mapa[nome] || 'outros'} onChange={e => salvarGrupo(nome, e.target.value)} className={`${inputCls} !w-40`}>
                  {GRUPOS_DRE.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {!dre ? <Loading /> : vazio ? (
        <EmptyState text="Sem receitas nem despesas no período." hint="Troque o período ou o regime." />
      ) : (
        <>
          <div className="overflow-x-auto bg-surface-container-lowest border border-outline-variant rounded-zela-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-on-surface-variant">
                  <th className="px-3 py-2 text-left font-medium">Linha</th>
                  {dre.meses.map(m => <th key={m} className="px-3 py-2 text-right font-medium whitespace-nowrap">{rotuloMes(m)}</th>)}
                  <th className="px-3 py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-outline-variant font-bold">
                  <td className="px-3 py-2">Receita</td>
                  {dre.meses.map(m => <React.Fragment key={m}>{celula(dre.receita.porMes[m])}</React.Fragment>)}
                  {celula(dre.receita.total)}
                </tr>
                {dre.grupos.map(g => (
                  <tr key={g.id} className="border-b border-outline-variant/50 text-on-surface-variant">
                    <td className="px-3 py-2 pl-6">(−) {g.nome}</td>
                    {dre.meses.map(m => <React.Fragment key={m}>{celula(g.porMes[m] || 0)}</React.Fragment>)}
                    {celula(g.total)}
                  </tr>
                ))}
                <tr className="border-b border-outline-variant font-bold">
                  <td className="px-3 py-2">(−) Total de despesas</td>
                  {dre.meses.map(m => <React.Fragment key={m}>{celula(dre.despesas.porMes[m])}</React.Fragment>)}
                  {celula(dre.despesas.total)}
                </tr>
                <tr className="font-bold bg-surface-container">
                  <td className="px-3 py-2">Resultado</td>
                  {dre.meses.map(m => <React.Fragment key={m}>{celula(dre.resultado.porMes[m], true)}</React.Fragment>)}
                  {celula(dre.resultado.total, true)}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            Receita = cobranças {regime === 'caixa' ? 'pagas no mês' : 'com vencimento no mês, sem canceladas'}. Ainda não entram taxas do gateway nem descontos e bolsas, por falta de dado.
          </p>
        </>
      )}
    </PageShell>
  );
}
