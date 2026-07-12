import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, GraduationCap, Edit, Trash2, Search, X, Save, KeyRound, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TURMAS } from './AdminDailyPresence';

// ── Modal de Edição ─────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    role: user.role || 'family',
  });
  const [studentsForm, setStudentsForm] = useState(
    user.students ? user.students.map(s => ({ ...s })) : []
  );
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleStudentChange = (id, field, value) => {
    setStudentsForm(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSendResetEmail = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (resetError) throw resetError;
      setResetSent(true);
      setTimeout(() => setResetSent(false), 3000);
    } catch (e) {
      setError(e.message || 'Erro ao enviar e-mail de redefinição.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError('');
    try {
      const updates = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
      };

      const { error: dbError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (dbError) {
        if (dbError.code === '23505') throw new Error('Este e-mail já está em uso por outro usuário.');
        throw dbError;
      }

      // Salva estudantes se for familia
      if (form.role === 'family') {
        for (const s of studentsForm) {
          const { error: sError } = await supabase
            .from('students')
            .update({
              name: s.name,
              turma: s.turma,
              contracted_hours: parseFloat(s.contracted_hours)
            })
            .eq('id', s.id);
          if (sError) throw sError;
        }
      }

      setSaved(true);
      onSaved({ ...user, ...updates, students: form.role === 'family' ? studentsForm : [] });
      setTimeout(() => { setSaved(false); onClose(); }, 1200);
    } catch (e) {
      setError(e.message || 'Erro ao salvar.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <span className="font-black text-indigo-700">{user.name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Editar Usuário</h2>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome / Identificação</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(11) 90000-0000"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Perfil</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="family">Família</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <KeyRound size={10}/> Segurança da Senha
              </label>
              <button
                type="button"
                onClick={handleSendResetEmail}
                disabled={isLoading || resetSent}
                className="w-full py-3 px-4 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
              >
                {resetSent ? 'E-mail de Redefinição Enviado!' : 'Enviar E-mail de Recuperação'}
              </button>
            </div>
          </div>
          
          {/* Edição de Alunos */}
          {form.role === 'family' && studentsForm.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100">
               <h3 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
                 <GraduationCap size={18}/> Alunos Vinculados
               </h3>
               <div className="space-y-4">
                 {studentsForm.map(student => (
                   <div key={student.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome do Aluno</label>
                       <input 
                         type="text" 
                         value={student.name} 
                         onChange={e => handleStudentChange(student.id, 'name', e.target.value)}
                         className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none"
                       />
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                       <div>
                         <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Turma</label>
                         <select
                           value={student.turma || ''}
                           onChange={e => handleStudentChange(student.id, 'turma', e.target.value)}
                           className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none"
                         >
                           <option value="">Nenhuma</option>
                           {TURMAS.filter(t => t !== 'Todas as Turmas').map(t => (
                             <option key={t} value={t}>{t}</option>
                           ))}
                         </select>
                       </div>
                       <div>
                         <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Horas / Dia</label>
                         <input 
                           type="number" 
                           step="0.5"
                           min="1"
                           value={student.contracted_hours} 
                           onChange={e => handleStudentChange(student.id, 'contracted_hours', e.target.value)}
                           className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none"
                         />
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || saved}
            className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition text-sm disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {saved ? (
              <><CheckCircle2 size={16}/> Salvo!</>
            ) : isLoading ? 'Salvando...' : (
              <><Save size={16}/> Salvar Alterações</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente Principal ─────────────────────────────────────────────────────
export default function AdminUserManagement({ currentUser }) {
  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsersAndStudents = async () => {
    setIsLoading(true);
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .eq('school_id', currentUser.school_id)
        .order('name', { ascending: true });
      if (usersError) throw usersError;

      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('school_id', currentUser.school_id);
      if (studentsError) throw studentsError;

      const combinedData = usersData.map(user => ({
        ...user,
        students: studentsData.filter(s => s.family_id === user.id),
      }));
      setUsersList(combinedData);
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchUsersAndStudents(); }, []);

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Tem certeza que deseja excluir este usuário? Todos os dados vinculados serão perdidos.')) return;
    try {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw error;
      setUsersList(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      alert('Erro ao excluir usuário.');
    }
  };

  const handleUserSaved = (updatedUser) => {
    setUsersList(prev =>
      prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u)
    );
  };

  // Busca em tempo real por nome OU email
  const filteredUsers = usersList.filter(user => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      user.name.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
              <Users size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Gestão de Usuários</h2>
              <p className="text-sm text-slate-500">
                {usersList.length} usuário{usersList.length !== 1 ? 's' : ''} cadastrado{usersList.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Campo de busca em tempo real */}
          <div className="relative w-full md:w-72 shrink-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X size={14}/>
              </button>
            )}
          </div>
        </div>

        {/* Resultados */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Users className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-slate-500 font-medium text-sm">
              {searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Nenhum usuário cadastrado.'}
            </h3>
          </div>
        ) : (
          <>
            {searchTerm && (
              <p className="text-xs text-slate-400 mb-4">
                {filteredUsers.length} resultado{filteredUsers.length !== 1 ? 's' : ''} para "<span className="font-semibold text-slate-600">{searchTerm}</span>"
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredUsers.map(user => (
                <div key={user.id} className="border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-md transition-all flex flex-col bg-white relative group">

                  {/* Botões de ação — sempre visíveis no mobile, hover no desktop */}
                  <div className="absolute top-4 right-4 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      title="Editar usuário"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Excluir usuário"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Avatar + Nome */}
                  <div className="flex items-center gap-3 mb-4 pr-16">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-full flex items-center justify-center shrink-0 border border-indigo-100">
                      <span className="font-black text-indigo-700 text-lg">{user.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 text-sm truncate" title={user.name}>{user.name}</h3>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded w-fit mt-0.5 inline-block ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {user.role === 'admin' ? 'Administrador' : 'Família'}
                      </span>
                    </div>
                  </div>

                  {/* Contatos */}
                  <div className="space-y-1.5 mb-4 flex-1">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail size={13} className="text-slate-400 shrink-0"/>
                      <span className="truncate text-xs" title={user.email}>{user.email}</span>
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone size={13} className="text-slate-400 shrink-0"/>
                        <span className="text-xs">{user.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Alunos vinculados */}
                  {user.role === 'family' && user.students?.length > 0 && (
                    <div className="mt-auto pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <GraduationCap size={11}/> Alunos ({user.students.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {user.students.map(s => (
                          <span key={s.id} className="bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-md">
                            {s.name} {s.turma ? <span className="text-slate-400">· {s.turma}</span> : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal de Edição */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  );
}
