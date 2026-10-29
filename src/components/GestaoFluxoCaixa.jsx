import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { centsToBRL, brlToCents, todayISO, formatDateBR } from '../lib/gestaoUtils';
import { baixarXlsxAba } from '../lib/bi/exportar';
import { CORES_CATEGORICAS } from '../lib/bi/coresEntidade';
import { montarFluxo } from '../lib/financeiroAvancado';
import { PageShell, Loading, Notice, SecondaryButton, PrimaryButton, StatCard, inputCls } from './GestaoShared';
import BiCartaoGrafico from './bi/BiCartaoGrafico';

const Linha = lazy(() => import('./bi/charts/Linha'));

const SERIES = [
  { id: 'esperado', label: 'Esperado', cor: CORES_CATEGORICAS[0] },
  { id: 'otimista', label: 'Otimista', cor: CORES_CATEGORICAS[1] },
  { id: 'pessimista', label: 'Pessimista', cor: CORES_CATEGORICAS[2] },
];

// Financeiro, Fluxo de caixa projetado (módulo financeiro_avancado). Só Gestão (fin_fluxo_projetado).
export default function GestaoFluxoCaixa({ currentUser }) {
  const [dias, setDias] = useState(30);
  const [raw, setRaw] = useState(null);
  const [erro, setErro] = useState('');
  const [saldo, setSaldo] = useState('');
  const [ocultas, setOcultas] = useState(new Set());

  const carregar = useCallback(async () => {
    setRaw(null);
    setErro('');
    const { data, error } = await supabase.rpc('fin_fluxo_projetado', { p_dias: dias });
    if (error) { setErro('Não foi possível carregar o fluxo de caixa.'); setRaw({}); return; }
    setRaw(data);
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const fluxo = useMemo(() => (raw ? montarFluxo(raw) : null), [raw]);
  const dados = useMemo(() => (fluxo?.semanas || []).map(s => ({ ...s, rotulo: formatDateBR(s.semana).slice(0, 5) })), [fluxo]);

  const salvarSaldo = async () => {
    const cents = brlToCents(saldo);
    if (!saldo.trim() || Number.isNaN(cents)) { setErro('Informe o saldo atual em reais.'); return; }
    const { error } = await supabase.from('school_cash_balances')
      .upsert({ school_id: currentUser.school_id, data: todayISO(), saldo_cents: cents, conta: 'principal', created_by: currentUser.id }, { onConflict: 'school_id,data,conta' });
    if (error) { setErro('Não foi possível salvar o saldo.'); return; }
    setSaldo('');
    carregar();
  };

  const baixar = () => baixarXlsxAba(`fluxo-caixa-${dias}-dias`, [{
    titulo: 'Fluxo de caixa',
    linhas: dados,
    colunas: [
      { label: 'Semana', value: s => formatDateBR(s.semana) },
      { label: 'Entradas em aberto', value: s => s.entradas_cents / 100 },
      { label: 'Saídas a pagar', value: s => s.saidas_cents / 100 },
      { label: 'Saldo esperado', value: s => s.esperado / 100 },
      { label: 'Saldo otimista', value: s => s.otimista / 100 },
      { label: 'Saldo pessimista', value: s => s.pessimista / 100 },
    ],
  }]);

  const alternar = (id) => setOcultas(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <PageShell actions={(
      <>
        <select value={dias} onChange={e => setDias(Number(e.target.value))} className={`${inputCls} !w-auto`} aria-label="Horizonte">
          <option value={30}>Próximos 30 dias</option><option value={60}>Próximos 60 dias</option><option value={90}>Próximos 90 dias</option>
        </select>
        {fluxo?.semanas.length > 0 && <SecondaryButton onClick={baixar} aria-label="Baixar planilha"><Download size={15} /> <span className="hidden sm:inline">Planilha</span></SecondaryButton>}
      </>
    )}>
      <Notice>{erro}</Notice>
      {!fluxo ? <Loading /> : (
        <div className="space-y-3">
          {fluxo.saldoNegativo && (
            <div role="alert" className="px-4 py-3 rounded-zela-lg border bg-warning/10 text-warning border-warning/30 text-sm font-medium">
              O saldo esperado fica negativo a partir da semana de {formatDateBR(fluxo.primeiraSemanaNegativa)}.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Saldo informado" value={fluxo.saldoInicial == null ? '·' : centsToBRL(fluxo.saldoInicial)} hint={raw.saldo_data ? `em ${formatDateBR(raw.saldo_data)}` : 'nenhum saldo informado'} />
            <StatCard label="Saldo esperado no fim" value={centsToBRL(fluxo.semanas.at(-1)?.esperado ?? 0)} tone={fluxo.saldoNegativo ? 'bad' : 'default'} />
            <StatCard label="Taxa de recebimento" value={fluxo.semHistorico ? '·' : `${Math.round(raw.taxa_media * 100)}%`} hint={fluxo.semHistorico ? 'sem histórico: usando 100%' : 'média dos últimos 6 meses'} />
          </div>

          <div className="flex flex-wrap items-end gap-2 bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
            <label className="text-sm text-on-surface flex-1 min-w-[12rem]">
              Saldo atual em caixa (R$)
              <input value={saldo} onChange={e => setSaldo(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${inputCls} mt-1`} />
            </label>
            <PrimaryButton onClick={salvarSaldo}><Save size={15} /> Salvar saldo de hoje</PrimaryButton>
          </div>

          <BiCartaoGrafico
            titulo="Saldo projetado por semana" vazio={dados.length === 0}
            legenda={SERIES.map(s => ({ ...s, oculta: ocultas.has(s.id) }))} onAlternarSerie={alternar}
            tabela={{
              columns: [
                { label: 'Semana', primary: true, render: r => formatDateBR(r.semana) },
                { label: 'Entradas', align: 'right', render: r => centsToBRL(r.entradas_cents) },
                { label: 'Saídas', align: 'right', render: r => centsToBRL(r.saidas_cents) },
                { label: 'Saldo esperado', align: 'right', render: r => centsToBRL(r.esperado) },
              ],
              rows: dados, rowKey: r => r.semana,
            }}
            regra="Entradas = cobranças em aberto multiplicadas pela taxa histórica (média, máxima e mínima mensal dos últimos 6 meses). Saídas = despesas pendentes. Vencidas entram na semana atual."
            ariaLabel="Linhas de saldo projetado por semana"
          >
            <Suspense fallback={<Loading />}>
              <Linha dados={dados} series={SERIES} ocultas={ocultas} formatar={centsToBRL} formatarEixo={(v) => `${Math.round(v / 100)}`} />
            </Suspense>
          </BiCartaoGrafico>
        </div>
      )}
    </PageShell>
  );
}
