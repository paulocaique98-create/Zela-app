import React, { useEffect, useState } from 'react';
import { Users, Loader2, Trash2, Pencil, X, Check, Plus, Search, Phone, Mail, Briefcase } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';

const emptyForm = { name: '', cargo: '', phone: '', email: '', doc_number: '', admission_date: '', status: 'ativo', notes: '' };

export default function AdminFuncionarios({ currentUser, currentSchool }) {
  const [funcionarios, setFuncionarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const schoolId = currentSchool?.id || currentUser?.school_id;

  const fetchFuncionarios = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('funcionarios')
        .select('*')
        .eq('school_id', schoolId)
        .order('name', { ascending: true });
      if (fetchError) throw fetchError;
      setFuncionarios(data || []);
    } catch (err) {
      console.error('[AdminFuncionarios] Erro ao buscar:', err);
      setError('Não foi possível carregar os funcionários.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFuncionarios();
  }, [schoolId]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (f) => {
    setEditingId(f.id);
    setForm({
      name: f.name || '',
      cargo: f.cargo || '',
      phone: f.phone || '',
      email: f.email || '',
      doc_number: f.doc_number || '',
      admission_date: f.admission_date || '',
      status: f.status || 'ativo',
      notes: f.notes || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.cargo.trim() || !schoolId) return;

    setIsSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        cargo: form.cargo.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        doc_number: form.doc_number.trim() || null,
        admission_date: form.admission_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('funcionarios')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('funcionarios')
          .insert({ ...payload, school_id: schoolId, created_by: currentUser.id });
        if (insertError) throw insertError;
      }
      resetForm();
      await fetchFuncionarios();
    } catch (err) {
      console.error('[AdminFuncionarios] Erro ao salvar:', err);
      setError('Não foi possível salvar o funcionário.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('funcionarios').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setFuncionarios(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('[AdminFuncionarios] Erro ao excluir:', err);
      setError('Não foi possível excluir o funcionário.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const filteredFuncionarios = funcionarios.filter(f => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return f.name.toLowerCase().includes(term) || f.cargo.toLowerCase().includes(term);
  });

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Funcionários</h2>
            <p className="text-slate-500 text-sm hidden sm:block">
              {funcionarios.length} funcionário{funcionarios.length !== 1 ? 's' : ''} cadastrado{funcionarios.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!showForm && funcionarios.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou cargo..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm w-full sm:w-64"
              />
            </div>
          )}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm shrink-0"
            >
              <Plus size={18} /> <span className="hidden sm:inline">Novo Funcionário</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">{editingId ? 'Editar funcionário' : 'Novo funcionário'}</h3>
              <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nome completo"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <input
                type="text"
                placeholder="Cargo / Função"
                value={form.cargo}
                onChange={e => setForm({ ...form, cargo: e.target.value })}
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <input
                type="tel"
                placeholder="Telefone"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <input
                type="email"
                placeholder="E-mail"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <input
                type="text"
                placeholder="CPF"
                value={form.doc_number}
                onChange={e => setForm({ ...form, doc_number: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Data de admissão</label>
                <input
                  type="date"
                  value={form.admission_date}
                  onChange={e => setForm({ ...form, admission_date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>
              <div className="flex gap-2">
                {['ativo', 'inativo'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, status: s })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border capitalize ${
                      form.status === s
                        ? s === 'ativo' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-500 border-slate-500 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              placeholder="Observações (opcional)"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm resize-none"
            />

            <button
              type="submit"
              disabled={isSaving || !form.name.trim() || !form.cargo.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </form>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredFuncionarios.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">
              {funcionarios.length === 0 ? 'Nenhum funcionário cadastrado ainda.' : 'Nenhum funcionário encontrado.'}
            </p>
          </div>
        ) : (
          filteredFuncionarios.map(f => (
            <div key={f.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-bold text-slate-800">{f.name}</h4>
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${
                      f.status === 'ativo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {f.status}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1"><Briefcase size={12} /> {f.cargo}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                    {f.phone && <span className="flex items-center gap-1"><Phone size={12} /> {f.phone}</span>}
                    {f.email && <span className="flex items-center gap-1"><Mail size={12} /> {f.email}</span>}
                  </div>
                  {f.notes && <p className="text-slate-600 text-sm mt-2 whitespace-pre-wrap">{f.notes}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleEdit(f)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={deletingId === f.id}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Excluir"
                  >
                    {deletingId === f.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {confirmDeleteId && (
        <ConfirmModal
          title="Excluir funcionário"
          message="Excluir este funcionário? Essa ação não pode ser desfeita."
          isLoading={deletingId === confirmDeleteId}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
