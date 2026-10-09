import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Copy, Plus, Loader2, AlertTriangle, TrendingUp, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAction } from '../lib/auditLog';
import { brlToCents, centsToBRL } from '../lib/gestaoUtils';
import { carregarContextoDeMensalidades, contarAlunosPorPlano } from '../lib/mensalidadesData';
import { chamarFuncaoFinanceira } from '../lib/funcoesFinanceiras';
import { CICLOS_DE_HORAS, TURNOS, planoDoAluno, aplicarPercentual, ROTULO_PERIODICIDADE } from '../../supabase/functions/_shared/planPricing.ts';
import { PageShell, Tabs, Loading, Notice, PrimaryButton, SecondaryButton, ResponsiveTable, inputCls } from './GestaoShared';
import ConfirmModal from './ConfirmModal';

// Financeiro · Planos (04/10/2026). Preço MENSAL por ciclo (6, 8 ou 10 horas)
// e turno, por ano letivo. Trimestral, semestral e anual saem do mensal com o
// desconto da família, calculados pelo servidor na hora de criar a
// mensalidade (Financeiro · Mensalidades). Aqui também: corrigir o ciclo e o
// turno de cada aluno, reajustar mensalidades ativas e ligar a criação
// automática de mensalidade ao aprovar matrícula.

const chave = (ciclo, turno) => `${ciclo}|${turno}`;
const emReais = (cents) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GestaoPlanos({ currentUser }) {
  const [aba, setAba] = useState('precos');
  const [ctx, setCtx] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setCtx(await carregarContextoDeMensalidades(currentUser.school_id));
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar os planos.');
      setCtx({ alunos: [], precos: [], contratos: [], vinculos: [], condicoes: [], descontos: [], responsaveis: [] });
    }
  }, [currentUser.school_id]);
  useEffect(() => { carregar(); }, [carregar]);

  const semPlano = useMemo(() => (ctx ? contarAlunosPorPlano(ctx.alunos).semPlano : 0), [ctx]);

  return (
    <PageShell description="Preço mensal por ciclo e turno. Trimestral, semestral e anual são calculados na hora de criar a mensalidade, com o desconto da família.">
      <Tabs
        tabs={[
          { id: 'precos', label: 'Preços' },
          { id: 'alunos', label: 'Alunos por ciclo e turno', badge: semPlano || null },
          { id: 'reajuste', label: 'Reajuste' },
          { id: 'automatico', label: 'Criação automática' },
        ]}
        active={aba}
        onChange={setAba}
      />
      <div className="space-y-4">
        <Notice>{erro}</Notice>
        {!ctx ? <Loading /> : (
          <>
            {aba === 'precos' && <PrecosTab currentUser={currentUser} ctx={ctx} recarregar={carregar} irParaAlunos={() => setAba('alunos')} />}
            {aba === 'alunos' && <AlunosTab currentUser={currentUser} ctx={ctx} recarregar={carregar} />}
            {aba === 'reajuste' && <ReajusteTab ctx={ctx} />}
            {aba === 'automatico' && <AutomaticoTab currentUser={currentUser} />}
          </>
        )}
      </div>
    </PageShell>
  );
}

// ─── Preços ─────────────────────────────────────────────────────────────────
function PrecosTab({ currentUser, ctx, recarregar, irParaAlunos }) {
  const anoAtual = new Date().getFullYear();
  const [extras, setExtras] = useState([]);
  const anos = useMemo(() => [...new Set([...ctx.precos.map(p => p.school_year), anoAtual, anoAtual + 1, ...extras])].sort(), [ctx.precos, anoAtual, extras]);
  const [ano, setAno] = useState(anoAtual);
  const [valores, setValores] = useState({});
  const [fonte, setFonte] = useState('');
  const [percentual, setPercentual] = useState('0');
  const [novoAno, setNovoAno] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const { contagem, semPlano } = useMemo(() => contarAlunosPorPlano(ctx.alunos), [ctx.alunos]);
  const doAno = useMemo(() => ctx.precos.filter(p => p.school_year === ano), [ctx.precos, ano]);

  useEffect(() => {
    const inicial = {};
    for (const p of doAno) inicial[chave(p.ciclo_horas, p.turno)] = emReais(p.monthly_amount_cents);
    setValores(inicial);
    setErro('');
  }, [doAno]);

  const anosComPreco = [...new Set(ctx.precos.map(p => p.school_year))].filter(a => a !== ano);
  useEffect(() => { if (!anosComPreco.includes(Number(fonte))) setFonte(anosComPreco[anosComPreco.length - 1] ? String(anosComPreco[anosComPreco.length - 1]) : ''); }, [ano, ctx.precos]); // eslint-disable-line react-hooks/exhaustive-deps

  const copiar = () => {
    const pct = Number(String(percentual).replace(',', '.'));
    if (!Number.isFinite(pct) || pct <= -100 || pct > 300) { setErro('Informe um percentual válido (entre menos 99 e 300).'); return; }
    const origem = ctx.precos.filter(p => p.school_year === Number(fonte));
    const novo = {};
    for (const p of origem) novo[chave(p.ciclo_horas, p.turno)] = emReais(aplicarPercentual(p.monthly_amount_cents, pct));
    setValores(novo);
    setErro('');
    setAviso(`Valores de ${fonte}${pct ? ` com ${pct > 0 ? '+' : ''}${pct}%` : ''} copiados para ${ano}. Confira e clique em Salvar preços.`);
  };

  const adicionarAno = () => {
    const n = Number(novoAno);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) { setErro('Informe um ano válido, por exemplo 2028.'); return; }
    setExtras(e => [...e, n]);
    setAno(n);
    setNovoAno('');
    setErro('');
  };

  const salvar = async () => {
    setErro('');
    setAviso('');
    const gravar = [];
    const apagar = [];
    for (const ciclo of CICLOS_DE_HORAS) {
      for (const turno of TURNOS) {
        const texto = String(valores[chave(ciclo, turno)] || '').trim();
        const existente = doAno.find(p => p.ciclo_horas === ciclo && p.turno === turno);
        if (!texto) { if (existente) apagar.push(existente.id); continue; }
        const cents = brlToCents(texto);
        if (cents <= 0) { setErro(`Valor inválido em ${ciclo}h ${turno}. Use o formato 1.200,00.`); return; }
        gravar.push({ school_id: currentUser.school_id, school_year: ano, ciclo_horas: ciclo, turno, monthly_amount_cents: cents });
      }
    }
    setSalvando(true);
    try {
      if (gravar.length) {
        const { error } = await supabase.from('school_plan_prices').upsert(gravar, { onConflict: 'school_id,school_year,ciclo_horas,turno' });
        if (error) throw error;
      }
      if (apagar.length) {
        const { error } = await supabase.from('school_plan_prices').delete().in('id', apagar);
        if (error) throw error;
      }
      logAction({
        schoolId: currentUser.school_id, actorId: currentUser.id, action: 'update_plan_prices', entityType: 'school_plan_prices',
        details: { ano, precos: gravar.map(g => `${g.ciclo_horas}h ${g.turno}: ${centsToBRL(g.monthly_amount_cents)}`), removidos: apagar.length },
      });
      setAviso(`Preços de ${ano} salvos. Mensalidades que já existem não mudam; para isso use a aba Reajuste.`);
      await recarregar();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar os preços.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="planos-ano" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Ano letivo</label>
          <select id="planos-ano" value={ano} onChange={e => setAno(Number(e.target.value))} className={`${inputCls} w-32`}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="planos-novo-ano" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Outro ano</label>
            <input id="planos-novo-ano" value={novoAno} onChange={e => setNovoAno(e.target.value)} inputMode="numeric" placeholder="2028" className={`${inputCls} w-24`} />
          </div>
          <SecondaryButton onClick={adicionarAno} disabled={!novoAno}><Plus size={15} /> Adicionar</SecondaryButton>
        </div>
      </div>

      {semPlano > 0 && (
        <div className="p-3 rounded-zela-md bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{semPlano === 1 ? '1 aluno está sem ciclo ou sem turno e não consegue receber preço da tabela.' : `${semPlano} alunos estão sem ciclo ou sem turno e não conseguem receber preço da tabela.`} <button type="button" onClick={irParaAlunos} className="font-bold underline">Corrigir agora</button></span>
        </div>
      )}

      <Notice>{erro}</Notice>
      {aviso && <Notice type="success">{aviso}</Notice>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
              <th className="py-2 pr-3">Ciclo</th>
              {TURNOS.map(t => <th key={t} className="py-2 pr-3">{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {CICLOS_DE_HORAS.map(ciclo => (
              <tr key={ciclo} className="border-b border-outline-variant/50 align-top">
                <td className="py-3 pr-3 font-bold text-on-surface whitespace-nowrap">{ciclo} horas</td>
                {TURNOS.map(turno => {
                  const k = chave(ciclo, turno);
                  const n = contagem.get(k) || 0;
                  return (
                    <td key={turno} className="py-2 pr-3">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">R$</span>
                        <input
                          id={`preco-${ciclo}-${turno}`}
                          aria-label={`Preço mensal de ${ciclo} horas ${turno}`}
                          value={valores[k] || ''}
                          onChange={e => setValores(v => ({ ...v, [k]: e.target.value }))}
                          inputMode="decimal"
                          placeholder="0,00"
                          className={`${inputCls} pl-9 w-40 tabular-nums`}
                        />
                      </div>
                      <p className="text-[11px] text-on-surface-variant/70 mt-1">{n} {n === 1 ? 'aluno' : 'alunos'} agora</p>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-on-surface-variant">
        Valor mensal por aluno, antes do desconto da família. Deixe em branco o que a escola não oferece. Mudar a tabela não altera mensalidades que já existem.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={salvar} disabled={salvando}>{salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar preços de {ano}</PrimaryButton>
      </div>

      {anosComPreco.length > 0 && (
        <div className="p-3 rounded-zela-md border border-outline-variant bg-surface-container-low space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Começar de outro ano</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="planos-fonte" className="block text-[11px] text-on-surface-variant mb-1">Copiar de</label>
              <select id="planos-fonte" value={fonte} onChange={e => setFonte(e.target.value)} className={`${inputCls} w-28`}>
                {anosComPreco.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="planos-pct" className="block text-[11px] text-on-surface-variant mb-1">Reajuste (%)</label>
              <input id="planos-pct" value={percentual} onChange={e => setPercentual(e.target.value)} inputMode="decimal" className={`${inputCls} w-24`} />
            </div>
            <SecondaryButton onClick={copiar} disabled={!fonte}><Copy size={15} /> Copiar para {ano}</SecondaryButton>
          </div>
          <p className="text-[11px] text-on-surface-variant/70">Os valores aparecem na tabela acima; só valem depois de Salvar preços.</p>
        </div>
      )}
    </div>
  );
}

// ─── Alunos por ciclo e turno ───────────────────────────────────────────────
function AlunosTab({ currentUser, ctx, recarregar }) {
  const [edicoes, setEdicoes] = useState({});
  const [salvandoId, setSalvandoId] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);
  const comContrato = useMemo(() => new Set(ctx.contratos.map(c => c.student_id)), [ctx.contratos]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return ctx.alunos
      .map(a => ({ ...a, plano: planoDoAluno(a) }))
      .filter(a => (!soPendentes || a.plano.faltando.length > 0) && (!termo || a.name.toLocaleLowerCase('pt-BR').includes(termo)))
      .sort((x, y) => (y.plano.faltando.length - x.plano.faltando.length) || x.name.localeCompare(y.name));
  }, [ctx.alunos, busca, soPendentes]);

  const valorAtual = (a) => ({
    ciclo: edicoes[a.id]?.ciclo ?? (a.plano.ciclo ? String(a.plano.ciclo) : ''),
    turno: edicoes[a.id]?.turno ?? (a.plano.turno || ''),
  });
  const mudou = (a) => {
    const v = valorAtual(a);
    return v.ciclo !== (a.plano.ciclo ? String(a.plano.ciclo) : '') || v.turno !== (a.plano.turno || '');
  };

  const salvar = async (a) => {
    const v = valorAtual(a);
    setErro('');
    setAviso('');
    setSalvandoId(a.id);
    try {
      const { error } = await supabase.from('students').update({
        contracted_hours: v.ciclo ? Number(v.ciclo) : null,
        turno: v.turno || null,
      }).eq('id', a.id);
      if (error) throw error;
      logAction({
        schoolId: currentUser.school_id, actorId: currentUser.id, action: 'update_student_plan', entityType: 'student', entityId: a.id,
        details: { name: a.name, de: `${a.contracted_hours || 'sem ciclo'} · ${a.turno || 'sem turno'}`, para: `${v.ciclo || 'sem ciclo'} · ${v.turno || 'sem turno'}` },
      });
      setEdicoes(e => { const { [a.id]: _, ...resto } = e; void _; return resto; });
      setAviso(`${a.name}: ${v.ciclo ? `${v.ciclo}h` : 'sem ciclo'} ${v.turno || 'sem turno'}.${comContrato.has(a.id) ? ' A mensalidade que já existe continua com o mesmo valor.' : ''}`);
      await recarregar();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
    } finally {
      setSalvandoId(null);
    }
  };

  const colunas = [
    { label: 'Aluno', primary: true, render: a => (
      <div className="min-w-0">
        <p className="font-semibold text-on-surface truncate">{a.name}</p>
        {a.turma && <p className="text-xs text-on-surface-variant">{a.turma}</p>}
      </div>
    ) },
    { label: 'Ciclo', render: a => (
      <select aria-label={`Ciclo de ${a.name}`} value={valorAtual(a).ciclo} onChange={e => setEdicoes(x => ({ ...x, [a.id]: { ...valorAtual(a), ciclo: e.target.value } }))} className={`${inputCls} w-28`}>
        <option value="">Sem ciclo</option>
        {CICLOS_DE_HORAS.map(c => <option key={c} value={c}>{c} horas</option>)}
        {a.contracted_hours && !a.plano.ciclo && <option value={String(a.contracted_hours)} disabled>{a.contracted_hours} (fora do padrão)</option>}
      </select>
    ) },
    { label: 'Turno', render: a => (
      <select aria-label={`Turno de ${a.name}`} value={valorAtual(a).turno} onChange={e => setEdicoes(x => ({ ...x, [a.id]: { ...valorAtual(a), turno: e.target.value } }))} className={`${inputCls} w-36`}>
        <option value="">Sem turno</option>
        {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
        {a.turno && !a.plano.turno && <option value={a.turno} disabled>{a.turno} (fora do padrão)</option>}
      </select>
    ) },
    { label: 'Mensalidade', hideOnMobile: false, render: a => (comContrato.has(a.id) ? <span className="text-xs text-on-surface-variant">Já tem mensalidade</span> : <span className="text-xs text-on-surface-variant/70">·</span>) },
    { label: '', actions: true, align: 'right', render: a => mudou(a) && (
      <PrimaryButton onClick={() => salvar(a)} disabled={salvandoId === a.id}>
        {salvandoId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
      </PrimaryButton>
    ) },
  ];

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-zela-md bg-surface-container-low border border-outline-variant text-xs text-on-surface-variant space-y-1">
        <p>O preço da mensalidade segue o ciclo e o turno que estão no cadastro do aluno. Corrija aqui quando precisar; cada troca fica registrada na auditoria.</p>
        <p>Trocar o ciclo muda também as horas contratadas usadas no cálculo de hora extra. O horário de entrada e saída do aluno não muda por aqui. Mensalidade que já existe não muda de valor.</p>
      </div>
      <Notice>{erro}</Notice>
      {aviso && <Notice type="success">{aviso}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
          <input id="planos-busca-aluno" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno pelo nome" aria-label="Buscar aluno pelo nome" className={`${inputCls} pl-9`} />
        </div>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} /> Só sem ciclo ou sem turno
        </label>
      </div>
      {linhas.length === 0 ? <p className="text-sm text-on-surface-variant">Nenhum aluno encontrado.</p> : <ResponsiveTable columns={colunas} rows={linhas} />}
    </div>
  );
}

// ─── Reajuste ───────────────────────────────────────────────────────────────
function ReajusteTab({ ctx }) {
  const anos = useMemo(() => [...new Set(ctx.precos.map(p => p.school_year))].sort(), [ctx.precos]);
  const [modo, setModo] = useState(anos.length ? 'table' : 'percent');
  const [ano, setAno] = useState(anos[anos.length - 1] || new Date().getFullYear());
  const [percentual, setPercentual] = useState('5');
  const [previa, setPrevia] = useState(null);
  const [marcados, setMarcados] = useState({});
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  const corpo = () => (modo === 'table'
    ? { mode: 'table', school_year: Number(ano) }
    : { mode: 'percent', percent: Number(String(percentual).replace(',', '.')) });

  const verPrevia = async () => {
    setErro('');
    setResultado(null);
    setCarregando(true);
    try {
      const data = await chamarFuncaoFinanceira('readjust-contracts', { ...corpo(), dry_run: true });
      setPrevia(data.linhas);
      setMarcados(Object.fromEntries(data.linhas.filter(l => l.acao === 'reajustar').map(l => [l.contract_id, true])));
    } catch (e) {
      setErro(e.message);
      setPrevia(null);
    } finally {
      setCarregando(false);
    }
  };

  const aplicar = async () => {
    setConfirmando(false);
    setErro('');
    setCarregando(true);
    try {
      const ids = Object.keys(marcados).filter(id => marcados[id]);
      const data = await chamarFuncaoFinanceira('readjust-contracts', { ...corpo(), dry_run: false, contract_ids: ids });
      setResultado(data.resultados);
      setPrevia(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  const reajustaveis = (previa || []).filter(l => l.acao === 'reajustar');
  const quantos = reajustaveis.filter(l => marcados[l.contract_id]).length;
  const feitos = (resultado || []).filter(r => r.ok).length;
  const falhas = (resultado || []).filter(r => !r.ok && !r.pulado);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="p-3 rounded-zela-md bg-surface-container-low border border-outline-variant text-xs text-on-surface-variant space-y-1">
        <p>Muda o valor das mensalidades ativas. O desconto da família que já estava no contrato é mantido.</p>
        <p>Vale para as cobranças que o Asaas gerar daqui para frente. As cobranças que já foram emitidas ficam como estão; para uma delas, use Ajustar valor em Financeiro · Cobranças.</p>
      </div>
      <Notice>{erro}</Notice>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input type="radio" name="modo-reajuste" checked={modo === 'table'} onChange={() => setModo('table')} disabled={anos.length === 0} />
          Pelo preço da tabela de Planos de
          <select aria-label="Ano da tabela" value={ano} onChange={e => setAno(e.target.value)} disabled={modo !== 'table'} className={`${inputCls} w-24`}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input type="radio" name="modo-reajuste" checked={modo === 'percent'} onChange={() => setModo('percent')} />
          Por percentual
          <input aria-label="Percentual de reajuste" value={percentual} onChange={e => setPercentual(e.target.value)} disabled={modo !== 'percent'} inputMode="decimal" className={`${inputCls} w-20`} /> %
        </label>
      </div>
      <PrimaryButton onClick={verPrevia} disabled={carregando}>{carregando ? <Loader2 size={15} className="animate-spin" /> : <TrendingUp size={15} />} Ver prévia</PrimaryButton>

      {previa && (
        previa.length === 0 ? <p className="text-sm text-on-surface-variant">Nenhuma mensalidade ativa para reajustar.</p> : (
          <>
            <ResponsiveTable
              rows={previa}
              rowKey={l => l.contract_id}
              columns={[
                { label: '', hideOnMobile: true, render: l => l.acao === 'reajustar' && <input type="checkbox" aria-label={`Reajustar ${l.student_name}`} checked={Boolean(marcados[l.contract_id])} onChange={e => setMarcados(m => ({ ...m, [l.contract_id]: e.target.checked }))} /> },
                { label: 'Aluno', primary: true, render: l => l.student_name || '·' },
                { label: 'Periodicidade', render: l => ROTULO_PERIODICIDADE[l.billing_cycle] || l.billing_cycle },
                { label: 'Hoje', className: 'tabular-nums', render: l => centsToBRL(l.from_amount_cents) },
                { label: 'Depois', className: 'tabular-nums font-bold', render: l => (l.acao === 'reajustar' ? centsToBRL(l.to_amount_cents) : <span className="text-on-surface-variant font-normal text-xs">{l.motivo}</span>) },
                { label: '', actions: true, render: l => l.acao === 'reajustar' && (
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(marcados[l.contract_id])} onChange={e => setMarcados(m => ({ ...m, [l.contract_id]: e.target.checked }))} /> Reajustar</label>
                ) },
              ]}
            />
            <PrimaryButton onClick={() => setConfirmando(true)} disabled={carregando || quantos === 0}>Aplicar reajuste em {quantos} {quantos === 1 ? 'mensalidade' : 'mensalidades'}</PrimaryButton>
          </>
        )
      )}

      {resultado && (
        <div className="space-y-2">
          <Notice type="success">{`${feitos} ${feitos === 1 ? 'mensalidade reajustada' : 'mensalidades reajustadas'}.`}</Notice>
          {falhas.length > 0 && <Notice>{`${falhas.length} não ${falhas.length === 1 ? 'pôde' : 'puderam'} ser reajustada${falhas.length === 1 ? '' : 's'}: ${falhas.map(f => `${f.student_name} (${f.erro})`).join(' · ')}`}</Notice>}
        </div>
      )}

      {confirmando && (
        <ConfirmModal
          title="Aplicar reajuste"
          message={`Reajustar ${quantos} ${quantos === 1 ? 'mensalidade' : 'mensalidades'} no Asaas e no Zela Escola? As cobranças futuras passam a sair com o valor novo.`}
          confirmLabel="Aplicar reajuste"
          danger={false}
          isLoading={carregando}
          onConfirm={aplicar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}

// ─── Criação automática ─────────────────────────────────────────────────────
function AutomaticoTab({ currentUser }) {
  const [config, setConfig] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    supabase.from('school_financial_settings').select('auto_create_on_approval, default_due_day, default_billing_type')
      .eq('school_id', currentUser.school_id).maybeSingle()
      .then(({ data, error }) => {
        if (error) { setErro('Não foi possível carregar as configurações.'); return; }
        setConfig(data || { auto_create_on_approval: false, default_due_day: 10, default_billing_type: 'UNDEFINED' });
      });
  }, [currentUser.school_id]);

  const salvar = async () => {
    setErro('');
    setAviso('');
    const dia = Number(config.default_due_day);
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) { setErro('O dia de vencimento vai de 1 a 28.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('school_financial_settings').upsert({
      school_id: currentUser.school_id,
      auto_create_on_approval: Boolean(config.auto_create_on_approval),
      default_due_day: dia,
      default_billing_type: config.default_billing_type,
    }, { onConflict: 'school_id' });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    logAction({ schoolId: currentUser.school_id, actorId: currentUser.id, action: 'update_financial_settings', entityType: 'school_financial_settings', details: { auto: Boolean(config.auto_create_on_approval), dia, forma: config.default_billing_type } });
    setAviso('Configuração salva.');
  };

  if (!config) return erro ? <Notice>{erro}</Notice> : <Loading />;
  return (
    <div className="space-y-4 max-w-xl">
      <div className="p-3 rounded-zela-md bg-surface-container-low border border-outline-variant text-xs text-on-surface-variant space-y-1">
        <p>Quando ligada, ao aprovar uma matrícula ou rematrícula o Zela Escola já cria a mensalidade do aluno no Asaas, com o preço da tabela de Planos e o desconto da família.</p>
        <p>Só cria quando tudo estiver pronto: aluno com ciclo e turno, preço cadastrado, responsável financeiro com CPF e família que não seja bolsista. O que ficar de fora aparece em Financeiro · Mensalidades, aguardando.</p>
      </div>
      <Notice>{erro}</Notice>
      {aviso && <Notice type="success">{aviso}</Notice>}
      <label className="flex items-center gap-3 text-sm font-bold text-on-surface">
        <input type="checkbox" checked={config.auto_create_on_approval} onChange={e => setConfig(c => ({ ...c, auto_create_on_approval: e.target.checked }))} />
        Criar a mensalidade ao aprovar a matrícula
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="auto-dia" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Dia do vencimento</label>
          <input id="auto-dia" value={config.default_due_day} onChange={e => setConfig(c => ({ ...c, default_due_day: e.target.value }))} inputMode="numeric" className={inputCls} />
          <p className="text-[11px] text-on-surface-variant/70 mt-1">O 1º vencimento é o próximo desse dia (de 1 a 28).</p>
        </div>
        <div>
          <label htmlFor="auto-forma" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Forma de pagamento</label>
          <select id="auto-forma" value={config.default_billing_type} onChange={e => setConfig(c => ({ ...c, default_billing_type: e.target.value }))} className={inputCls}>
            <option value="UNDEFINED">Link de pagamento (família escolhe)</option>
            <option value="PIX">PIX</option>
            <option value="BOLETO">Boleto</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant">A criação automática é sempre mensal. Trimestral, semestral ou anual a Gestão cria em Financeiro · Mensalidades.</p>
      <PrimaryButton onClick={salvar} disabled={salvando}>{salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar</PrimaryButton>
    </div>
  );
}
