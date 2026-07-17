import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, GraduationCap, Edit, Trash2, Search, X, Save, KeyRound, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TURMAS } from './AdminDailyPresence';
import AdminUserRegistration from './AdminUserRegistration';

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

      const { data: authData, error: authError } = await supabase
        .from('authorized_persons')
        .select('id, name, relation, photo_url, family_id')
        .eq('school_id', currentUser.school_id);
      if (authError) throw authError;

      const combinedData = usersData.map(user => {
        const familyAuths = (authData || []).filter(
          ap => ap.family_id === user.id
        );
        const matchingAuth = familyAuths.find(
          ap => ap.name.toLowerCase().trim() === user.name.toLowerCase().trim()
        ) || familyAuths.find(ap => ap.relation?.includes('(Titular)'));
        return {
          ...user,
          photo_url: matchingAuth?.photo_url || null,
          authorized: familyAuths,
          students: studentsData.filter(s => s.family_id === user.id),
        };
      });
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
                    <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-indigo-100 bg-gradient-to-br from-indigo-100 to-indigo-200">
                      {user.photo_url ? (
                        <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-black text-indigo-700 text-lg">{user.name.charAt(0).toUpperCase()}</span>
                      )}
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
        <AdminUserRegistration
          currentUser={currentUser}
          editingUser={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  );
}
