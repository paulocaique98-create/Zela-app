import React, { useEffect, useState } from 'react';
import { Users, Loader2, Trash2, Pencil, X, Check, Plus, Search, Phone, Mail, Briefcase, KeyRound, GraduationCap, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CARGOS_FUNCIONARIOS, TURMAS, SETORES_CHAT } from '../lib/constants';
import ConfirmModal from './ConfirmModal';
import AdminUserRegistration from './AdminUserRegistration';

const DEPARTAMENTOS_LABEL = Object.fromEntries(SETORES_CHAT.map(s => [s.value, s.label]));

const emptyForm = { name: '', cargo: '', phone: '', email: '', doc_number: '', admission_date: '', status: 'ativo', notes: '' };

// Cargos que plausivelmente precisam logar no sistema — mapeados pro papel/
// departamento sugerido no atalho "Criar acesso de login". Cargos operacionais
// sem necessidade de acesso (cozinheira, porteiro, auxiliares, estagiária)
// ficam de fora, sem o botão.
const CARGO_PARA_ACESSO = {
  'Professora': { role: 'teacher' },
  'Coordenadora': { role: 'admin', departamento: 'coordenacao' },
  'Diretora': { role: 'admin', departamento: 'diretoria_pedagogica' },
  'Administradora': { role: 'admin', departamento: 'administrativo' },
  'Recepcionista': { role: 'admin', departamento: 'recepcao' },
};

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
  const [creatingAccessFor, setCreatingAccessFor] = useState(null);

  // ── Contas de Acesso (Admin/Professor) — mesma funcionalidade que existia em
  // Gerenciamento > Usuários, movida pra cá pra não misturar com Responsáveis.
  const [accessUsers, setAccessUsers] = useState([]);
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);
  const [accessSearchTerm, setAccessSearchTerm] = useState('');
  const [editingAccessUser, setEditingAccessUser] = useState(null);
  const [confirmDeleteAccessId, setConfirmDeleteAccessId] = useState(null);
  const [deletingAccessId, setDeletingAccessId] = useState(null);
  const [editingTurmasFor, setEditingTurmasFor] = useState(null);
  const [turmasDraft, setTurmasDraft] = useState([]);
  const [isSavingTurmas, setIsSavingTurmas] = useState(false);

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
        .order('name', { ascending: true })
        .limit(500);
      if (fetchError) throw fetchError;
      setFuncionarios(data || []);
    } catch (err) {
      console.error('[AdminFuncionarios] Erro ao buscar:', err);
      setError('Não foi possível carregar os funcionários.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAccessUsers = async () => {
    if (!schoolId) return;
    setIsLoadingAccess(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('school_id', schoolId)
        .in('role', ['admin', 'teacher'])
        .order('name', { ascending: true });
      if (fetchError) throw fetchError;
      setAccessUsers(data || []);
    } catch (err) {
      console.error('[AdminFuncionarios] Erro ao buscar contas de acesso:', err);
    } finally {
      setIsLoadingAccess(false);
    }
  };

  useEffect(() => {
    fetchFuncionarios();
    fetchAccessUsers();
  }, [schoolId]);

  const handleDeleteAccessUser = (id) => setConfirmDeleteAccessId(id);

  const confirmDeleteAccessUser = async () => {
    const userId = confirmDeleteAccessId;
    setDeletingAccessId(userId);
    try {
      const { error } = await supabase.functions.invoke('delete-user', { body: { userId } });
      if (error) throw error;
      setAccessUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error('[AdminFuncionarios] Erro ao excluir conta de acesso:', err);
      alert('Erro ao excluir usuário: ' + (err.message || 'Desconhecido'));
    } finally {
      setDeletingAccessId(null);
      setConfirmDeleteAccessId(null);
    }
  };

  const handleAccessUserSaved = (updatedUser) => {
    setAccessUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
  };

  const openTurmasEditor = (user) => {
    setEditingTurmasFor(user);
    setTurmasDraft(user.turmas || []);
  };

  const toggleTurmaDraft = (t) => {
    setTurmasDraft(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const saveTurmas = async () => {
    if (!editingTurmasFor) return;
    setIsSavingTurmas(true);
    try {
      const { error } = await supabase.from('users').update({ turmas: turmasDraft }).eq('id', editingTurmasFor.id);
      if (error) throw error;
      setAccessUsers(prev => prev.map(u => u.id === editingTurmasFor.id ? { ...u, turmas: turmasDraft } : u));
      setEditingTurmasFor(null);
    } catch (err) {
      console.error('[AdminFuncionarios] Erro ao salvar turmas:', err);
      alert('Erro ao salvar turmas: ' + (err.message || 'Desconhecido'));
    } finally {
      setIsSavingTurmas(false);
    }
  };

  const filteredAccessUsers = accessUsers.filter(u => {
    const term = accessSearchTerm.toLowerCase().trim();
    if (!term) return true;
    return u.name.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term);
  });

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
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Funcionários</h2>
            <p className="text-on-surface-variant text-small hidden sm:block">
              {funcionarios.length} funcionário{funcionarios.length !== 1 ? 's' : ''} cadastrado{funcionarios.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!showForm && funcionarios.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
              <input
                type="text"
                placeholder="Buscar por nome ou cargo..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full sm:w-64"
              />
            </div>
          )}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm shrink-0"
            >
              <Plus size={18} /> <span className="hidden sm:inline">Novo Funcionário</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface text-sm">{editingId ? 'Editar funcionário' : 'Novo funcionário'}</h3>
              <button type="button" onClick={resetForm} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition">
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
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <select
                value={form.cargo}
                onChange={e => setForm({ ...form, cargo: e.target.value })}
                required
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="">Cargo / Função...</option>
                {CARGOS_FUNCIONARIOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="tel"
                placeholder="Telefone"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <input
                type="email"
                placeholder="E-mail"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <input
                type="text"
                placeholder="CPF"
                value={form.doc_number}
                onChange={e => setForm({ ...form, doc_number: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Data de admissão</label>
                <input
                  type="date"
                  value={form.admission_date}
                  onChange={e => setForm({ ...form, admission_date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Status</label>
              <div className="flex gap-2">
                {['ativo', 'inativo'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, status: s })}
                    className={`px-3 py-1.5 rounded-zela-md text-xs font-bold transition-all border capitalize ${
                      form.status === s
                        ? s === 'ativo' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-surface-container-low0 border-slate-500 text-white'
                        : 'bg-white border-outline-variant text-on-surface-variant hover:border-indigo-300'
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
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-on-surface text-sm resize-none"
            />

            <button
              type="submit"
              disabled={isSaving || !form.name.trim() || !form.cargo.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </form>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredFuncionarios.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <Users className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">
              {funcionarios.length === 0 ? 'Nenhum funcionário cadastrado ainda.' : 'Nenhum funcionário encontrado.'}
            </p>
          </div>
        ) : (
          filteredFuncionarios.map(f => (
            <div key={f.id} className="bg-white border border-outline-variant rounded-zela-lg p-4 sm:p-5 shadow-sm">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-bold text-on-surface">{f.name}</h4>
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${
                      f.status === 'ativo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-surface-container text-on-surface-variant border-outline-variant'
                    }`}>
                      {f.status}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-xs mt-0.5 flex items-center gap-1"><Briefcase size={12} /> {f.cargo}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-on-surface-variant">
                    {f.phone && <span className="flex items-center gap-1"><Phone size={12} /> {f.phone}</span>}
                    {f.email && <span className="flex items-center gap-1"><Mail size={12} /> {f.email}</span>}
                  </div>
                  {f.notes && <p className="text-on-surface-variant text-sm mt-2 whitespace-pre-wrap">{f.notes}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {CARGO_PARA_ACESSO[f.cargo] && (
                    <button
                      onClick={() => setCreatingAccessFor(f)}
                      className="p-2 text-on-surface-variant/70 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      title="Criar acesso de login"
                    >
                      <KeyRound size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(f)}
                    className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={deletingId === f.id}
                    className="p-2 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Excluir"
                  >
                    {deletingId === f.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {/* ── CONTAS DE ACESSO AO SISTEMA (Admin/Professor) ── */}
        <div className="pt-6 mt-2 border-t border-outline-variant">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-h3 text-on-surface">Contas de Acesso ao Sistema</h3>
              <p className="text-on-surface-variant text-small">
                {accessUsers.length} conta{accessUsers.length !== 1 ? 's' : ''} de login (Administradores e Professores)
              </p>
            </div>
            {accessUsers.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou e-mail..."
                  value={accessSearchTerm}
                  onChange={e => setAccessSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full sm:w-64"
                />
              </div>
            )}
          </div>

          {isLoadingAccess ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : filteredAccessUsers.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant/70">
              <KeyRound className="mx-auto h-10 w-10 text-outline-variant mb-2" />
              <p className="text-sm font-semibold text-on-surface-variant">
                {accessUsers.length === 0 ? 'Nenhuma conta de acesso criada ainda.' : 'Nenhuma conta encontrada.'}
              </p>
              <p className="text-xs text-on-surface-variant/70 mt-1">Use o botão <KeyRound size={11} className="inline" /> em um funcionário acima pra criar uma.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredAccessUsers.map(u => (
                <div key={u.id} className="bg-white border border-outline-variant rounded-zela-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-on-surface text-sm truncate">{u.name}</h4>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border shrink-0 ${
                          u.role === 'admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {u.role === 'admin' ? 'Admin' : 'Professor'}
                        </span>
                      </div>
                      <p className="text-on-surface-variant/70 text-xs truncate mt-0.5">{u.email}</p>
                      {u.role === 'admin' && u.departamento && (
                        <p className="text-on-surface-variant text-xs mt-1">{DEPARTAMENTOS_LABEL[u.departamento] || u.departamento}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditingAccessUser(u)}
                        className="p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteAccessUser(u.id)}
                        disabled={deletingAccessId === u.id}
                        className="p-1.5 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Excluir"
                      >
                        {deletingAccessId === u.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>

                  {u.role === 'teacher' && (
                    <div className="mt-3 pt-3 border-t border-outline-variant">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider flex items-center gap-1">
                          <GraduationCap size={11} /> Turmas
                        </p>
                        <button
                          onClick={() => openTurmasEditor(u)}
                          className="text-[10px] font-bold text-primary hover:text-indigo-800 transition"
                        >
                          Trocar
                        </button>
                      </div>
                      {u.turmas?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {u.turmas.map(t => (
                            <span key={t} className="bg-surface-container-low border border-outline-variant text-on-surface-variant text-[10px] font-medium px-2 py-0.5 rounded-md">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-600 font-semibold">Nenhuma turma vinculada</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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

      {creatingAccessFor && (
        <AdminUserRegistration
          currentUser={currentUser}
          forceModal
          initialData={{
            name: creatingAccessFor.name,
            phone1: creatingAccessFor.phone || '',
            email: creatingAccessFor.email || '',
            ...CARGO_PARA_ACESSO[creatingAccessFor.cargo],
          }}
          onClose={() => { setCreatingAccessFor(null); fetchAccessUsers(); }}
        />
      )}

      {editingAccessUser && (
        <AdminUserRegistration
          currentUser={currentUser}
          editingUser={editingAccessUser}
          onClose={() => setEditingAccessUser(null)}
          onSaved={handleAccessUserSaved}
        />
      )}

      {confirmDeleteAccessId && (
        <ConfirmModal
          title="Excluir conta de acesso"
          message="Tem certeza que deseja excluir esta conta? A pessoa perderá o acesso ao sistema imediatamente."
          isLoading={deletingAccessId === confirmDeleteAccessId}
          onConfirm={confirmDeleteAccessUser}
          onCancel={() => setConfirmDeleteAccessId(null)}
        />
      )}

      {editingTurmasFor && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-zela-xl shadow-2xl p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-on-surface">Turmas de {editingTurmasFor.name}</h3>
                <p className="text-xs text-on-surface-variant/70 mt-0.5">Selecione as turmas que este professor leciona</p>
              </div>
              <button onClick={() => setEditingTurmasFor(null)} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-lg transition">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {TURMAS.filter(t => t !== 'Todas as Turmas').map(t => {
                const isSelected = turmasDraft.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTurmaDraft(t)}
                    className={`px-3 py-1.5 rounded-zela-md text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-primary border-indigo-600 text-white'
                        : 'bg-white border-outline-variant text-on-surface-variant hover:border-indigo-300'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingTurmasFor(null)}
                disabled={isSavingTurmas}
                className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-bold py-3 rounded-zela-md transition text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveTurmas}
                disabled={isSavingTurmas}
                className="flex-[1.5] flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 text-white font-bold py-3 rounded-zela-md transition text-sm"
              >
                {isSavingTurmas ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
