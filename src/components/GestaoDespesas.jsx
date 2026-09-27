import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Receipt, Edit, Download, CheckCircle2, Paperclip } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadFile, buildSafeFileName, getSignedUrl } from '../lib/storage';
import { centsToBRL, brlToCents, formatDateBR, monthRange, todayISO, downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton, StatCard } from './GestaoShared';
import { EXPENSE_CATEGORIES } from './GestaoFornecedores';

const STATUS = { pendente: 'Pendente', pago: 'Paga', cancelado: 'Cancelada' };
const STATUS_CLS = { pendente: 'bg-amber-50 text-amber-700 border-amber-200', pago: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelado: 'bg-slate-100 text-slate-500 border-slate-200' };
const BUCKET = 'expense-attachments';

// Financeiro · Despesas (contas a pagar). Permissões: despesas.ver /
// despesas.gerenciar (Gestão sempre; admin se liberado em Permissões).
export default function GestaoDespesas({ currentUser }) {
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

  return (
    <PageShell
      description="Contas a pagar da escola."
      actions={<>
        {rows?.length > 0 && <SecondaryButton onClick={() => downloadCSV(`despesas-${range.start.slice(0, 7)}.csv`, rows, [
          { label: 'Vencimento', value: r => formatDateBR(r.due_date) }, { label: 'Descrição', value: 'description' },
          { label: 'Categoria', value: 'category' }, { label: 'Fornecedor', value: r => r.suppliers?.name || '' },
          { label: 'Situação', value: r => STATUS[r.status] }, { label: 'Pago em', value: r => r.paid_on ? formatDateBR(r.paid_on) : '' },
          { label: 'Valor', value: r => (r.amount_cents / 100).toFixed(2).replace('.', ',') },
        ])}><Download size={15} /> Planilha</SecondaryButton>}
        <PrimaryButton onClick={() => setEditing({ description: '', category: '', amount: '', due_date: todayISO(), supplier_id: '', notes: '' })}><Plus size={16} /> Nova despesa</PrimaryButton>
      </>}
    >
      <Notice>{error}</Notice>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SecondaryButton onClick={() => setOffset(o => o - 1)} aria-label="Mês anterior">‹</SecondaryButton>
        <span className="text-sm font-bold text-on-surface capitalize w-24 text-center">{range.label}</span>
        <SecondaryButton onClick={() => setOffset(o => o + 1)} aria-label="Próximo mês">›</SecondaryButton>
        <select id="expense-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="p-2 bg-white border border-outline-variant rounded-zela-md text-sm" aria-label="Situação">
          <option value="">Todas</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {rows === null ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <StatCard label="A pagar no mês" value={centsToBRL(sum('pendente'))} tone="warn" />
            <StatCard label="Pago no mês" value={centsToBRL(sum('pago'))} tone="good" />
            <StatCard label="Em atraso" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} hint={centsToBRL(overdue.reduce((s, r) => s + r.amount_cents, 0))} />
          </div>
          {rows.length === 0 ? <EmptyState icon={Receipt} text="Nenhuma despesa neste mês." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
                  <th className="py-2 pr-3">Vencimento</th><th className="py-2 pr-3">Descrição</th><th className="py-2 pr-3">Categoria</th><th className="py-2 pr-3 text-right">Valor</th><th className="py-2 pr-3">Situação</th><th className="py-2" />
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-outline-variant/50">
                      <td className={`py-2 pr-3 whitespace-nowrap ${r.status === 'pendente' && r.due_date < todayISO() ? 'text-red-600 font-bold' : ''}`}>{formatDateBR(r.due_date)}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-on-surface">{r.description}</p>
                        {r.suppliers?.name && <p className="text-xs text-on-surface-variant">{r.suppliers.name}</p>}
                      </td>
                      <td className="py-2 pr-3 text-on-surface-variant">{r.category}</td>
                      <td className="py-2 pr-3 text-right font-bold">{centsToBRL(r.amount_cents)}</td>
                      <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_CLS[r.status]}`}>{STATUS[r.status]}{r.paid_on ? ` em ${formatDateBR(r.paid_on)}` : ''}</span></td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {r.attachment_path && <button onClick={() => openAttachment(r.attachment_path)} className="p-1.5 text-on-surface-variant hover:text-primary" aria-label="Abrir anexo"><Paperclip size={14} /></button>}
                        {r.status === 'pendente' && <button onClick={() => setPaying(r)} className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-zela-md" aria-label="Marcar como paga"><CheckCircle2 size={15} /></button>}
                        {r.status === 'pendente' && <button onClick={() => setEditing({ ...r, amount: (r.amount_cents / 100).toFixed(2).replace('.', ','), supplier_id: r.supplier_id || '' })} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md" aria-label="Editar"><Edit size={14} /></button>}
                        {r.status === 'pendente' && <button onClick={() => cancel(r)} className="px-1.5 text-xs font-bold text-on-surface-variant hover:text-red-600">Cancelar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
      <p className="text-sm text-on-surface-variant">{expense.description} · {centsToBRL(expense.amount_cents)}</p>
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
