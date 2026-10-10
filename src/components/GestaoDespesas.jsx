import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ListFilter, Plus, Receipt, Edit, Download, CheckCircle2, Paperclip } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadFile, buildSafeFileName, getSignedUrl } from '../lib/storage';
import { centsToBRL, brlToCents, formatDateBR, monthRange, todayISO, downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton, StatCard, ResponsiveTable } from './GestaoShared';
import { EXPENSE_CATEGORIES } from './GestaoFornecedores';

const STATUS = { pendente: 'Pendente', pago: 'Paga', cancelado: 'Cancelada' };
const STATUS_CLS = { pendente: 'bg-warning/10 text-warning border-warning/30', pago: 'bg-success/10 text-success border-success/30', cancelado: 'bg-surface-container text-on-surface-variant border-outline-variant' };
const BUCKET = 'expense-attachments';

// Financeiro, Despesas (contas a pagar). Permissões: despesas.ver /
// despesas.gerenciar (Gestão sempre; admin se liberado em Permissões).
export default function GestaoDespesas({ currentUser, canManage = true }) {
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [rows, setRows] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [error, setError] = useState('');
  const range = monthRange(offset);

  const load = useCallback(async () => {
    setRows(null);
    let q = supabase.from('expenses').select('*, suppliers:supplier_id(name)').eq('school_id', currentUser.school_id)
      .gte('due_date', range.start).lte('due_date', range.end).order('due_date');
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data, error: e } = await q;
    if (e) { setError('Não foi possível carregar as despesas.'); setRows([]); return; }
    setRows(data || []);
  }, [currentUser.school_id, range.start, range.end, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from('suppliers').select('id, name').eq('school_id', currentUser.school_id).eq('active', true).order('name').then(({ data }) => setSuppliers(data || []));
  }, [currentUser.school_id]);

  const sum = (st) => (rows || []).filter(r => r.status === st).reduce((s, r) => s + r.amount_cents, 0);
  const overdue = (rows || []).filter(r => r.status === 'pendente' && r.due_date < todayISO());

  const openAttachment = async (path) => {
    try { window.open(await getSignedUrl(BUCKET, path), '_blank', 'noopener'); } catch { setError('Não foi possível abrir o anexo.'); }
  };

  const cancel = async (r) => {
    const { error: e } = await supabase.from('expenses').update({ status: 'cancelado', paid_on: null, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (e) setError(e.message); else load();
  };

  const exportButton = rows?.length > 0 && (
    <SecondaryButton onClick={() => downloadCSV(`despesas-${range.start.slice(0, 7)}.csv`, rows, [
      { label: 'Vencimento', value: r => formatDateBR(r.due_date) }, { label: 'Descrição', value: 'description' },
      { label: 'Categoria', value: 'category' }, { label: 'Fornecedor', value: r => r.suppliers?.name || '' },
      { label: 'Situação', value: r => STATUS[r.status] }, { label: 'Pago em', value: r => r.paid_on ? formatDateBR(r.paid_on) : '' },
      { label: 'Valor', value: r => (r.amount_cents / 100).toFixed(2).replace('.', ',') },
    ])} aria-label="Baixar planilha" title="Baixar planilha"><Download size={15} /> <span className="hidden sm:inline">Planilha</span></SecondaryButton>
  );
  const novaDespesa = () => setEditing({ description: '', category: '', amount: '', due_date: todayISO(), supplier_id: '', notes: '' });

  return (
    <PageShell
      description="Contas a pagar da escola."
      infoOnMobile
      actions={<>
        {exportButton}
        {canManage && <PrimaryButton onClick={novaDespesa}><Plus size={16} /> Nova despesa</PrimaryButton>}
      </>}
    >
      <Notice>{error}</Notice>
      {(canManage || exportButton) && (
        <div className="flex items-center gap-2 mb-3 sm:hidden">
          {canManage && <PrimaryButton className="flex-1 justify-center h-10" onClick={novaDespesa}><Plus size={16} /> Nova despesa</PrimaryButton>}
          {exportButton && <div className="[&>button]:h-10">{exportButton}</div>}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setOffset(o => o - 1)} aria-label="Mês anterior"><ChevronLeft size={18} aria-hidden="true" /></SecondaryButton>
          <span className="flex-1 sm:flex-none text-sm font-bold text-on-surface capitalize sm:w-24 text-center">{range.label}</span>
          <SecondaryButton onClick={() => setOffset(o => o + 1)} aria-label="Próximo mês"><ChevronRight size={18} aria-hidden="true" /></SecondaryButton>
        </div>
        <div className="relative w-full sm:w-44">
          <ListFilter size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <select
            id="expense-status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Situação"
            className={`w-full h-10 appearance-none cursor-pointer pl-9 pr-9 py-0 border rounded-zela-md text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary ${
              statusFilter ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <option value="">Todas</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        </div>
      </div>
      {rows === null ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="A pagar no mês" value={centsToBRL(sum('pendente'))} tone="warn" />
            <StatCard label="Pago no mês" value={centsToBRL(sum('pago'))} tone="good" />
            <StatCard label="Em atraso" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} className="col-span-2 sm:col-span-1" hint={centsToBRL(overdue.reduce((s, r) => s + r.amount_cents, 0))} />
          </div>
          {rows.length === 0 ? <EmptyState icon={Receipt} text="Nenhuma despesa neste mês." /> : (
            <ResponsiveTable
              rows={rows}
              columns={[
                { label: 'Descrição', primary: true, render: r => (
                  <>
                    <p className="font-medium text-on-surface">{r.description}</p>
                    {r.suppliers?.name && <p className="text-xs font-normal text-on-surface-variant">{r.suppliers.name}</p>}
                  </>
                ) },
                { label: 'Vencimento', render: r => <span className={`whitespace-nowrap ${r.status === 'pendente' && r.due_date < todayISO() ? 'text-error font-bold' : ''}`}>{formatDateBR(r.due_date)}</span> },
                { label: 'Categoria', className: 'text-on-surface-variant', render: r => r.category },
                { label: 'Valor', align: 'right', className: 'font-bold', render: r => centsToBRL(r.amount_cents) },
                { label: 'Situação', render: r => <span className={`px-2 py-0.5 rounded-sm text-xs font-bold border ${STATUS_CLS[r.status]}`}>{STATUS[r.status]}{r.paid_on ? ` em ${formatDateBR(r.paid_on)}` : ''}</span> },
                { label: '', actions: true, align: 'right', className: 'whitespace-nowrap', render: r => (r.attachment_path || (canManage && r.status === 'pendente')) && (
                  <span className="inline-flex items-center gap-1">
                    {r.attachment_path && <button onClick={() => openAttachment(r.attachment_path)} className="p-1.5 text-on-surface-variant hover:text-primary" aria-label="Abrir anexo"><Paperclip size={14} /></button>}
                    {canManage && r.status === 'pendente' && <button onClick={() => setPaying(r)} className="p-1.5 text-success hover:bg-success/10 rounded-zela-md" aria-label="Marcar como paga"><CheckCircle2 size={15} /></button>}
                    {canManage && r.status === 'pendente' && <button onClick={() => setEditing({ ...r, amount: (r.amount_cents / 100).toFixed(2).replace('.', ','), supplier_id: r.supplier_id || '' })} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md" aria-label="Editar"><Edit size={14} /></button>}
                    {canManage && r.status === 'pendente' && <button onClick={() => cancel(r)} className="px-1.5 text-xs font-bold text-on-surface-variant hover:text-error">Cancelar</button>}
                  </span>
                ) },
              ]}
            />
          )}
        </>
      )}
      {editing && <DespesaModal currentUser={currentUser} suppliers={suppliers} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {paying && <PagarModal expense={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
    </PageShell>
  );
}

function DespesaModal({ currentUser, suppliers, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const amountCents = brlToCents(form.amount);
    if (!form.description.trim() || !form.category || !form.due_date || amountCents <= 0) {
      setError('Preencha descrição, categoria, valor e vencimento.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      let attachmentPath = form.attachment_path || null;
      if (file) {
        attachmentPath = `${currentUser.school_id}/despesas/${buildSafeFileName(file)}`;
        await uploadFile(BUCKET, attachmentPath, file);
      }
      const payload = {
        description: form.description.trim(), category: form.category, amount_cents: amountCents, due_date: form.due_date,
        supplier_id: form.supplier_id || null, notes: form.notes?.trim() || null, attachment_path: attachmentPath,
        updated_at: new Date().toISOString(),
      };
      const { error: e } = form.id
        ? await supabase.from('expenses').update(payload).eq('id', form.id)
        : await supabase.from('expenses').insert({ ...payload, school_id: currentUser.school_id, created_by: currentUser.id });
      if (e) throw e;
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title={form.id ? 'Editar despesa' : 'Nova despesa'} onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={save} disabled={isSaving}>Salvar</PrimaryButton></>}>
      <Notice>{error}</Notice>
      <Field label="Descrição" id="exp-desc"><input id="exp-desc" value={form.description} onChange={set('description')} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria" id="exp-cat">
          <select id="exp-cat" value={form.category} onChange={set('category')} className={inputCls}>
            <option value="">Selecionar</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fornecedor" id="exp-sup">
          <select id="exp-sup" value={form.supplier_id} onChange={set('supplier_id')} className={inputCls}>
            <option value="">Nenhum</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Valor (R$)" id="exp-amount"><input id="exp-amount" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0,00" className={inputCls} /></Field>
        <Field label="Vencimento" id="exp-due"><input id="exp-due" type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} /></Field>
      </div>
      <Field label="Observações" id="exp-notes"><textarea id="exp-notes" rows={2} value={form.notes || ''} onChange={set('notes')} className={inputCls} /></Field>
      <Field label="Nota ou boleto (opcional)" id="exp-file" hint={form.attachment_path && !file ? 'Já há um anexo; envie outro para substituir.' : ''}>
        <input id="exp-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-xs" />
      </Field>
    </Modal>
  );
}

function PagarModal({ expense, onClose, onSaved }) {
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('pix');
  const [error, setError] = useState('');
  const save = async () => {
    const { error: e } = await supabase.from('expenses').update({ status: 'pago', paid_on: date, payment_method: method, updated_at: new Date().toISOString() }).eq('id', expense.id);
    if (e) { setError(e.message); return; }
    onSaved();
  };
  return (
    <Modal title="Marcar despesa como paga" onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={save}>Confirmar pagamento</PrimaryButton></>}>
      <Notice>{error}</Notice>
      <p className="text-sm text-on-surface-variant">{expense.description}, {centsToBRL(expense.amount_cents)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pago em" id="exp-paid-on"><input id="exp-paid-on" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Forma" id="exp-method">
          <select id="exp-method" value={method} onChange={e => setMethod(e.target.value)} className={inputCls}>
            <option value="pix">PIX</option><option value="boleto">Boleto</option><option value="transfer">Transferência</option>
            <option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="debit">Débito automático</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
