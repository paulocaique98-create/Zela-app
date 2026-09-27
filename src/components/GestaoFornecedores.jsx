import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Truck, Edit, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton } from './GestaoShared';

export const EXPENSE_CATEGORIES = [
  'Folha de pagamento', 'Aluguel', 'Água, luz e internet', 'Alimentação', 'Material pedagógico',
  'Limpeza e higiene', 'Manutenção', 'Impostos e taxas', 'Serviços', 'Outros',
];

const empty = { name: '', document: '', category: '', phone: '', email: '', notes: '', active: true };

// Cadastros · Fornecedores (base das Despesas). Permissão:
// fornecedores.gerenciar (Gestão sempre; admin se liberado em Permissões).
export default function GestaoFornecedores({ currentUser }) {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('suppliers').select('*').eq('school_id', currentUser.school_id).order('name');
    if (e) { setError('Não foi possível carregar os fornecedores.'); setRows([]); return; }
    setRows(data || []);
  }, [currentUser.school_id]);

  useEffect(() => { load(); }, [load]);

  const filtered = (rows || []).filter(r => !search || `${r.name} ${r.document || ''} ${r.category || ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageShell
      description="Empresas e pessoas de quem a escola compra ou contrata serviços."
      actions={<PrimaryButton onClick={() => setEditing({ ...empty })}><Plus size={16} /> Novo fornecedor</PrimaryButton>}
    >
      <Notice>{error}</Notice>
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
        <input id="supplier-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, documento ou categoria" className={`${inputCls} pl-9`} />
      </div>
      {rows === null ? <Loading /> : filtered.length === 0 ? <EmptyState icon={Truck} text="Nenhum fornecedor cadastrado." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(r => (
            <div key={r.id} className={`bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 ${r.active ? '' : 'opacity-60'}`}>
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-on-surface text-sm truncate">{r.name}</p>
                  <p className="text-xs text-on-surface-variant">{[r.category, r.document].filter(Boolean).join(' · ') || 'Sem categoria'}</p>
                  {(r.phone || r.email) && <p className="text-xs text-on-surface-variant/80 mt-1 truncate">{[r.phone, r.email].filter(Boolean).join(' · ')}</p>}
                  {!r.active && <p className="text-[11px] font-bold text-on-surface-variant mt-1">Inativo</p>}
                </div>
                <button onClick={() => setEditing(r)} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md shrink-0" aria-label="Editar"><Edit size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <FornecedorModal currentUser={currentUser} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </PageShell>
  );
}

function FornecedorModal({ currentUser, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome.'); return; }
    setIsSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(), document: form.document?.trim() || null, category: form.category || null,
      phone: form.phone?.trim() || null, email: form.email?.trim() || null, notes: form.notes?.trim() || null,
      active: form.active !== false, updated_at: new Date().toISOString(),
    };
    const { error: e } = form.id
      ? await supabase.from('suppliers').update(payload).eq('id', form.id)
      : await supabase.from('suppliers').insert({ ...payload, school_id: currentUser.school_id, created_by: currentUser.id });
    setIsSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  return (
    <Modal title={form.id ? 'Editar fornecedor' : 'Novo fornecedor'} onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={save} disabled={isSaving}>Salvar</PrimaryButton></>}>
      <Notice>{error}</Notice>
      <Field label="Nome ou razão social" id="sup-name"><input id="sup-name" value={form.name} onChange={set('name')} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CPF ou CNPJ" id="sup-doc"><input id="sup-doc" value={form.document || ''} onChange={set('document')} className={inputCls} /></Field>
        <Field label="Categoria" id="sup-cat">
          <select id="sup-cat" value={form.category || ''} onChange={set('category')} className={inputCls}>
            <option value="">Selecionar</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Telefone" id="sup-phone"><input id="sup-phone" value={form.phone || ''} onChange={set('phone')} className={inputCls} /></Field>
        <Field label="E-mail" id="sup-email"><input id="sup-email" type="email" value={form.email || ''} onChange={set('email')} className={inputCls} /></Field>
      </div>
      <Field label="Observações" id="sup-notes"><textarea id="sup-notes" rows={2} value={form.notes || ''} onChange={set('notes')} className={inputCls} /></Field>
      {form.id && (
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input id="sup-active" type="checkbox" checked={form.active !== false} onChange={set('active')} /> Fornecedor ativo
        </label>
      )}
    </Modal>
  );
}
