import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Truck, Edit, Search, X, Phone, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton } from './GestaoShared';

export const EXPENSE_CATEGORIES = [
  'Folha de pagamento', 'Aluguel', 'Água, luz e internet', 'Alimentação', 'Material pedagógico',
  'Limpeza e higiene', 'Manutenção', 'Impostos e taxas', 'Serviços', 'Outros',
];

const empty = { name: '', document: '', category: '', phone: '', email: '', notes: '', active: true };

// Cadastros, Fornecedores (base das Despesas). Permissão:
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

  const novo = () => setEditing({ ...empty });

  return (
    <PageShell
      description="Empresas e pessoas de quem a escola compra ou contrata serviços."
      infoOnMobile
      actions={<PrimaryButton onClick={novo}><Plus size={16} /> Novo fornecedor</PrimaryButton>}
    >
      <Notice>{error}</Notice>
      <PrimaryButton className="w-full justify-center h-10 mb-3 sm:hidden" onClick={novo}><Plus size={16} /> Novo fornecedor</PrimaryButton>
      <div className="relative mb-4 sm:max-w-sm">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          id="supplier-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar fornecedor"
          aria-label="Buscar por nome, documento ou categoria"
          className="w-full h-10 pl-9 pr-9 bg-surface-container-lowest border border-outline-variant rounded-zela-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {search && (
          <button onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-on-surface-variant hover:bg-surface-container rounded-zela-md"><X size={14} /></button>
        )}
      </div>
      {rows === null ? <Loading /> : filtered.length === 0 ? <EmptyState icon={Truck} text={search ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'} /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(r => (
            <div key={r.id} className={`bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 hover:border-primary/30 transition ${r.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center shrink-0"><Truck size={18} aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-on-surface text-sm truncate">{r.name}</p>
                    {!r.active && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-sm bg-surface-container text-on-surface-variant border border-outline-variant shrink-0">Inativo</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-surface-container-low text-on-surface-variant border border-outline-variant">{r.category || 'Sem categoria'}</span>
                    {r.document && <span className="text-xs text-on-surface-variant">{r.document}</span>}
                  </div>
                  {(r.phone || r.email) && (
                    <div className="mt-2 space-y-1">
                      {r.phone && <p className="flex items-center gap-1.5 text-xs text-on-surface-variant"><Phone size={12} aria-hidden="true" className="shrink-0" />{r.phone}</p>}
                      {r.email && <p className="flex items-center gap-1.5 text-xs text-on-surface-variant min-w-0"><Mail size={12} aria-hidden="true" className="shrink-0" /><span className="truncate">{r.email}</span></p>}
                    </div>
                  )}
                </div>
                <button onClick={() => setEditing(r)} className="h-9 w-9 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md shrink-0 -mt-1 -mr-1" aria-label={`Editar ${r.name}`}><Edit size={15} /></button>
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
