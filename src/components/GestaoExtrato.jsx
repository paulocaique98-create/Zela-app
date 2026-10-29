import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, Landmark, Plus, Ban, CheckCheck, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { centsToBRL, formatDateBR, parseOFXStatement } from '../lib/gestaoUtils';
import { sugerirCobrancas, sugerirDespesas, sugerirRepasse, saldoDoExtrato, separarNovas, STATUS_LINHA } from '../lib/conciliacao';
import { Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton, ResponsiveTable } from './GestaoShared';
import { RegistrarPagamentoModal } from './AdminFinanceiro';

const GATEWAY = ['pix', 'boleto', 'credit_card', 'link'];
const LOTE = 200;
const LINE_COLS = 'id, import_id, account_id, fitid, data, valor_cents, descricao, status, charge_id, expense_id, asaas_transfer_id';

// Financeiro, Recebimentos, aba Extrato: importa o OFX (entradas e saídas), guarda as linhas
// e concilia com cobranças, repasses do Asaas e despesas. A baixa de cobrança segue pela
// Edge Function register-manual-payment (RegistrarPagamentoModal).
export default function GestaoExtrato({ currentUser }) {
  const schoolId = currentUser.school_id;
  const [accounts, setAccounts] = useState(null);
  const [accountId, setAccountId] = useState('');
  const [lines, setLines] = useState(null);
  const [filtro, setFiltro] = useState('pendente');
  const [openCharges, setOpenCharges] = useState([]);
  const [paidCharges, setPaidCharges] = useState([]);
  const [openExpenses, setOpenExpenses] = useState([]);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [paying, setPaying] = useState(null);
  const [novaConta, setNovaConta] = useState(false);
  const [criarDespesa, setCriarDespesa] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: 'success', text: '' });

  const loadAccounts = useCallback(async () => {
    const { data } = await supabase.from('school_bank_accounts')
      .select('id, apelido, banco, agencia, conta_mascarada')
      .eq('school_id', schoolId).eq('ativa', true).order('apelido').limit(50);
    setAccounts(data || []);
    setAccountId(prev => prev || data?.[0]?.id || '');
  }, [schoolId]);

  const loadLines = useCallback(async () => {
    if (!accountId) { setLines([]); return; }
    const { data } = await supabase.from('bank_statement_lines').select(LINE_COLS)
      .eq('school_id', schoolId).eq('account_id', accountId)
      .order('data', { ascending: false }).limit(500);
    setLines(data || []);
    setSelecionadas(new Set());
  }, [schoolId, accountId]);

  const loadCandidatos = useCallback(async () => {
    const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const [ab, pg, ex] = await Promise.all([
      supabase.from('financial_charges').select('id, amount_cents, due_date, status, students:student_id(name)')
        .eq('school_id', schoolId).in('status', ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE']).limit(1000),
      supabase.from('financial_charges').select('id, amount_cents, paid_at, payment_method, students:student_id(name)')
        .eq('school_id', schoolId).eq('status', 'PAID').in('payment_method', GATEWAY).gte('paid_at', desde).limit(1000),
      supabase.from('expenses').select('id, description, amount_cents, due_date, suppliers:supplier_id(name)')
        .eq('school_id', schoolId).eq('status', 'pendente').limit(1000),
    ]);
    setOpenCharges(ab.data || []);
    setPaidCharges(pg.data || []);
    setOpenExpenses(ex.data || []);
  }, [schoolId]);

  useEffect(() => { loadAccounts(); loadCandidatos(); }, [loadAccounts, loadCandidatos]);
  useEffect(() => { loadLines(); }, [loadLines]);

  const aviso = (type, text) => setMsg({ type, text });

  // Cobranças pagas já usadas em algum repasse conciliado ficam fora das próximas sugestões.
  const usadasEmRepasse = useMemo(() => {
    const ids = new Set();
    (lines || []).forEach(l => {
      if (l.asaas_transfer_id?.startsWith('repasse:')) l.asaas_transfer_id.slice(8).split(',').forEach(i => ids.add(i));
      if (l.charge_id) ids.add(l.charge_id);
    });
    return ids;
  }, [lines]);

  const sugestao = useCallback((l) => {
    if (l.status !== 'pendente') return null;
    if (l.valor_cents > 0) {
      const cob = sugerirCobrancas(l, openCharges);
      if (cob.length) return { tipo: 'cobranca', itens: cob };
      const rep = sugerirRepasse(l, paidCharges.filter(c => !usadasEmRepasse.has(c.id)));
      return rep ? { tipo: 'repasse', repasse: rep } : null;
    }
    const desp = sugerirDespesas(l, openExpenses);
    return desp.length ? { tipo: 'despesa', itens: desp } : null;
  }, [openCharges, paidCharges, openExpenses, usadasEmRepasse]);

  const marcar = async (ids, patch) => {
    const { error } = await supabase.from('bank_statement_lines')
      .update({ ...patch, conciliada_em: new Date().toISOString(), conciliada_por: currentUser.id })
      .eq('school_id', schoolId).in('id', ids);
    if (error) throw error;
  };

  const importar = async (file) => {
    if (!file || !accountId) return;
    setBusy(true);
    aviso('success', '');
    try {
      const extrato = parseOFXStatement(await file.text());
      if (extrato.lines.length === 0) { aviso('error', 'Nenhum lançamento encontrado neste arquivo.'); return; }
      const { data: existentes } = await supabase.from('bank_statement_lines').select('fitid')
        .eq('school_id', schoolId).eq('account_id', accountId)
        .in('fitid', extrato.lines.map(l => l.id).slice(0, 2000));
      const novas = separarNovas(extrato.lines, (existentes || []).map(e => e.fitid));
      const { data: imp, error: impErr } = await supabase.from('bank_statement_imports').insert({
        school_id: schoolId, account_id: accountId, arquivo_nome: file.name.slice(0, 120),
        periodo_inicio: extrato.start, periodo_fim: extrato.end,
        saldo_final_cents: extrato.balance?.cents ?? null, saldo_data: extrato.balance?.date || null,
        linhas_total: extrato.lines.length, linhas_novas: novas.length, importado_por: currentUser.id,
      }).select('id').single();
      if (impErr) throw impErr;
      for (let i = 0; i < novas.length; i += LOTE) {
        const { error } = await supabase.from('bank_statement_lines').upsert(
          novas.slice(i, i + LOTE).map(l => ({
            school_id: schoolId, import_id: imp.id, account_id: accountId,
            fitid: l.id, data: l.date, valor_cents: l.amount_cents, descricao: (l.memo || '').slice(0, 200),
          })),
          { onConflict: 'school_id,account_id,fitid', ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      let extra = '';
      const saldo = saldoDoExtrato(extrato);
      if (saldo) {
        const conta = accounts.find(a => a.id === accountId)?.apelido || 'principal';
        const { error } = await supabase.from('school_cash_balances').upsert(
          { school_id: schoolId, data: saldo.data, saldo_cents: saldo.saldo_cents, conta, created_by: currentUser.id },
          { onConflict: 'school_id,data,conta' },
        );
        extra = error ? ' O saldo do extrato não pôde ser levado ao fluxo de caixa.' : ` Saldo de ${centsToBRL(saldo.saldo_cents)} em ${formatDateBR(saldo.data)} enviado ao fluxo de caixa.`;
      }
      aviso('success', `${novas.length} linha(s) nova(s); ${extrato.lines.length - novas.length} já estavam importadas.${extra}`);
      await loadLines();
    } catch (err) {
      aviso('error', err.message || 'Erro ao importar o extrato.');
    } finally {
      setBusy(false);
    }
  };

  const conciliarRepasse = async (l, rep) => {
    setBusy(true);
    try {
      await marcar([l.id], { status: 'conciliada', asaas_transfer_id: `repasse:${rep.cobrancas.map(c => c.id).join(',')}` });
      aviso('success', `Repasse conciliado com ${rep.cobrancas.length} cobranças (taxa estimada ${centsToBRL(rep.taxa_cents)}).`);
      await loadLines();
    } catch (err) { aviso('error', err.message); } finally { setBusy(false); }
  };

  const baixarDespesa = async (l, despesa) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('expenses')
        .update({ status: 'pago', paid_on: l.data, updated_at: new Date().toISOString() })
        .eq('school_id', schoolId).eq('id', despesa.id).eq('status', 'pendente');
      if (error) throw error;
      await marcar([l.id], { status: 'conciliada', expense_id: despesa.id });
      aviso('success', 'Despesa paga e vinculada à linha do extrato.');
      await Promise.all([loadLines(), loadCandidatos()]);
    } catch (err) { aviso('error', err.message); } finally { setBusy(false); }
  };

  const ignorarLote = async () => {
    setBusy(true);
    try {
      await marcar([...selecionadas], { status: 'ignorada' });
      aviso('success', `${selecionadas.size} linha(s) ignorada(s).`);
      await loadLines();
    } catch (err) { aviso('error', err.message); } finally { setBusy(false); }
  };

  // Em lote só entram saídas com UMA despesa candidata (sem dúvida) e repasses; cobranças pedem a baixa individual.
  const conciliarLote = async () => {
    setBusy(true);
    let feitas = 0;
    try {
      const usadas = new Set();
      for (const l of lines.filter(x => selecionadas.has(x.id))) {
        const s = sugestao(l);
        if (s?.tipo === 'despesa' && s.itens.length === 1 && !usadas.has(s.itens[0].id)) {
          usadas.add(s.itens[0].id);
          const { error } = await supabase.from('expenses').update({ status: 'pago', paid_on: l.data, updated_at: new Date().toISOString() })
            .eq('school_id', schoolId).eq('id', s.itens[0].id).eq('status', 'pendente');
          if (error) throw error;
          await marcar([l.id], { status: 'conciliada', expense_id: s.itens[0].id });
          feitas++;
        } else if (s?.tipo === 'repasse') {
          await marcar([l.id], { status: 'conciliada', asaas_transfer_id: `repasse:${s.repasse.cobrancas.map(c => c.id).join(',')}` });
          feitas++;
        }
      }
      aviso('success', `${feitas} linha(s) conciliada(s) em lote. Cobranças e casos duvidosos ficam para a baixa individual.`);
      await Promise.all([loadLines(), loadCandidatos()]);
    } catch (err) { aviso('error', err.message); await loadLines(); } finally { setBusy(false); }
  };

  const visiveis = (lines || []).filter(l => filtro === 'todas' || l.status === filtro);
  const contagem = (st) => (lines || []).filter(l => l.status === st).length;
  const alternar = (id) => setSelecionadas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (accounts === null) return <Loading />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-on-surface-variant">
        Envie o extrato OFX da conta. Entradas casam com cobranças ou com repasses do Asaas, saídas casam com despesas abertas. Reenviar o mesmo extrato não duplica as linhas.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 0 && (
          <select aria-label="Conta bancária" value={accountId} onChange={e => setAccountId(e.target.value)} className={`${inputCls} !w-auto`}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.apelido}{a.banco ? `, ${a.banco}` : ''}</option>)}
          </select>
        )}
        <SecondaryButton onClick={() => setNovaConta(true)}><Plus size={14} /> Conta bancária</SecondaryButton>
        {accountId && (
          <label htmlFor="extrato-ofx" className={`inline-flex items-center gap-2 px-3.5 py-2 bg-primary text-white font-bold rounded-zela-md text-sm cursor-pointer hover:bg-primary-container ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload size={15} /> Enviar extrato OFX
            <input id="extrato-ofx" type="file" accept=".ofx,.OFX,text/plain" className="hidden" onChange={e => { importar(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <Notice type={msg.type}>{msg.text}</Notice>

      {accounts.length === 0 ? (
        <EmptyState icon={Landmark} text="Cadastre uma conta bancária para importar extratos." />
      ) : lines === null ? <Loading /> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[['pendente', `Pendentes (${contagem('pendente')})`], ['conciliada', `Conciliadas (${contagem('conciliada')})`], ['ignorada', `Ignoradas (${contagem('ignorada')})`], ['todas', 'Todas']].map(([id, label]) => (
              <button key={id} onClick={() => setFiltro(id)} className={`px-3 py-1.5 rounded-zela-md text-xs font-bold border ${filtro === id ? 'bg-primary text-white border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant'}`}>{label}</button>
            ))}
            {selecionadas.size > 0 && (
              <>
                <SecondaryButton disabled={busy} onClick={conciliarLote}><CheckCheck size={14} /> Conciliar sugeridas ({selecionadas.size})</SecondaryButton>
                <SecondaryButton disabled={busy} onClick={ignorarLote}><Ban size={14} /> Ignorar ({selecionadas.size})</SecondaryButton>
              </>
            )}
          </div>
          {visiveis.length === 0 ? <EmptyState icon={Landmark} text="Nenhuma linha neste filtro." /> : (
            <ResponsiveTable
              rows={visiveis}
              columns={[
                { label: '', hideOnMobile: true, render: l => l.status === 'pendente' ? <input type="checkbox" aria-label="Selecionar linha" checked={selecionadas.has(l.id)} onChange={() => alternar(l.id)} /> : null },
                { label: 'Valor', primary: true, render: l => <span className={l.valor_cents < 0 ? 'text-on-surface' : 'text-success font-bold'}>{centsToBRL(l.valor_cents)}, {formatDateBR(l.data)}</span> },
                { label: 'Descrição no extrato', className: 'text-on-surface-variant', render: l => l.descricao || '·' },
                { label: 'Situação', render: l => <SituacaoLinha l={l} sugestao={sugestao(l)} busy={busy} onCobranca={c => setPaying({ charge: c, linha: l })} onRepasse={conciliarRepasse} onDespesa={baixarDespesa} onCriar={() => setCriarDespesa(l)} /> },
              ]}
            />
          )}
        </>
      )}

      {novaConta && <ContaModal schoolId={schoolId} onClose={() => setNovaConta(false)} onDone={async (id) => { setNovaConta(false); setAccountId(id); await loadAccounts(); }} />}
      {criarDespesa && (
        <DespesaModal
          schoolId={schoolId} userId={currentUser.id} linha={criarDespesa}
          onClose={() => setCriarDespesa(null)}
          onDone={async (expenseId) => {
            try { await marcar([criarDespesa.id], { status: 'conciliada', expense_id: expenseId }); aviso('success', 'Despesa criada e vinculada à linha.'); } catch (err) { aviso('error', err.message); }
            setCriarDespesa(null);
            await loadLines();
          }}
        />
      )}
      {paying && (
        <RegistrarPagamentoModal
          currentUser={currentUser}
          charge={paying.charge}
          presetDate={paying.linha.data}
          presetAmountCents={paying.linha.valor_cents}
          onClose={() => setPaying(null)}
          onDone={async () => {
            const { linha, charge } = paying;
            setPaying(null);
            try { await marcar([linha.id], { status: 'conciliada', charge_id: charge.id }); aviso('success', 'Baixa registrada e linha conciliada.'); } catch (err) { aviso('error', `Baixa feita, mas a linha não foi marcada: ${err.message}`); }
            await Promise.all([loadLines(), loadCandidatos()]);
          }}
        />
      )}
    </div>
  );
}

function SituacaoLinha({ l, sugestao, busy, onCobranca, onRepasse, onDespesa, onCriar }) {
  if (l.status !== 'pendente') {
    const detalhe = l.charge_id ? 'cobrança' : l.expense_id ? 'despesa' : l.asaas_transfer_id ? 'repasse do Asaas' : '';
    return <span className="text-xs font-bold text-on-surface-variant">{STATUS_LINHA[l.status]}{detalhe ? `, ${detalhe}` : ''}</span>;
  }
  const btn = 'block text-left text-xs font-bold text-primary hover:underline disabled:opacity-50';
  if (sugestao?.tipo === 'cobranca') {
    return <div className="space-y-1">{sugestao.itens.slice(0, 3).map(c => (
      <button key={c.id} disabled={busy} onClick={() => onCobranca(c)} className={btn}>{c.students?.name || 'Aluno'}, vence {formatDateBR(c.due_date)}</button>
    ))}</div>;
  }
  if (sugestao?.tipo === 'repasse') {
    const r = sugestao.repasse;
    return <button disabled={busy} onClick={() => onRepasse(l, r)} className={btn}><Receipt size={12} className="inline mr-1" />Repasse de {r.cobrancas.length} cobranças, taxa {centsToBRL(r.taxa_cents)}</button>;
  }
  if (sugestao?.tipo === 'despesa') {
    return <div className="space-y-1">{sugestao.itens.slice(0, 3).map(d => (
      <button key={d.id} disabled={busy} onClick={() => onDespesa(l, d)} className={btn}>{d.description}{d.suppliers?.name ? `, ${d.suppliers.name}` : ''}, vence {formatDateBR(d.due_date)}</button>
    ))}</div>;
  }
  return (
    <div className="space-y-1">
      <span className="text-xs text-on-surface-variant inline-flex items-center gap-1"><Landmark size={12} /> Sem correspondência</span>
      {l.valor_cents < 0 && <button disabled={busy} onClick={onCriar} className={btn}>Criar despesa a partir da linha</button>}
    </div>
  );
}

function ContaModal({ schoolId, onClose, onDone }) {
  const [f, setF] = useState({ apelido: '', banco: '', agencia: '', conta: '' });
  const [err, setErr] = useState('');
  const salvar = async () => {
    if (!f.apelido.trim()) { setErr('Informe um apelido para a conta.'); return; }
    const { data, error } = await supabase.from('school_bank_accounts').insert({
      school_id: schoolId, apelido: f.apelido.trim(), banco: f.banco.trim() || null, agencia: f.agencia.trim() || null, conta_mascarada: f.conta.trim() || null,
    }).select('id').single();
    if (error) { setErr(error.code === '23505' ? 'Já existe uma conta com este apelido.' : error.message); return; }
    onDone(data.id);
  };
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  return (
    <Modal title="Nova conta bancária" onClose={onClose} footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={salvar}>Salvar</PrimaryButton></>}>
      <Notice>{err}</Notice>
      <Field label="Apelido" id="cb-apelido"><input id="cb-apelido" className={inputCls} value={f.apelido} onChange={set('apelido')} maxLength={60} /></Field>
      <Field label="Banco" id="cb-banco"><input id="cb-banco" className={inputCls} value={f.banco} onChange={set('banco')} maxLength={60} /></Field>
      <Field label="Agência" id="cb-ag"><input id="cb-ag" className={inputCls} value={f.agencia} onChange={set('agencia')} maxLength={20} /></Field>
      <Field label="Conta (mascarada)" id="cb-conta" hint="Guarde só os últimos dígitos, por exemplo ****1234."><input id="cb-conta" className={inputCls} value={f.conta} onChange={set('conta')} maxLength={20} /></Field>
    </Modal>
  );
}

function DespesaModal({ schoolId, userId, linha, onClose, onDone }) {
  const [descricao, setDescricao] = useState(linha.descricao || '');
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    supabase.from('expense_categories').select('nome').eq('school_id', schoolId).order('nome').limit(100).then(({ data }) => setCategorias(data || []));
  }, [schoolId]);
  const salvar = async () => {
    if (!descricao.trim() || !categoria.trim()) { setErr('Informe descrição e categoria.'); return; }
    const { data, error } = await supabase.from('expenses').insert({
      school_id: schoolId, description: descricao.trim().slice(0, 200), category: categoria.trim(),
      amount_cents: Math.abs(linha.valor_cents), due_date: linha.data, paid_on: linha.data, status: 'pago',
      notes: 'Criada a partir do extrato bancário', created_by: userId,
    }).select('id').single();
    if (error) { setErr(error.message); return; }
    onDone(data.id);
  };
  return (
    <Modal title="Criar despesa a partir da linha" onClose={onClose} footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={salvar}>Criar despesa paga</PrimaryButton></>}>
      <Notice>{err}</Notice>
      <p className="text-sm text-on-surface-variant">{centsToBRL(Math.abs(linha.valor_cents))} pagos em {formatDateBR(linha.data)}.</p>
      <Field label="Descrição" id="dp-desc"><input id="dp-desc" className={inputCls} value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={200} /></Field>
      <Field label="Categoria" id="dp-cat">
        <input id="dp-cat" list="dp-cats" className={inputCls} value={categoria} onChange={e => setCategoria(e.target.value)} maxLength={80} />
        <datalist id="dp-cats">{categorias.map(c => <option key={c.nome} value={c.nome} />)}</datalist>
      </Field>
    </Modal>
  );
}
