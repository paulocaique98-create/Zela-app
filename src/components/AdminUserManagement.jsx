import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, GraduationCap, Edit, Trash2, Search, X, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAuthorizedPersonPhotoSignedUrls } from '../lib/storage';
import AdminUserRegistration from './AdminUserRegistration';
import AdminImportModal from './AdminImportModal';
import ConfirmModal from './ConfirmModal';

// Gestão de Usuários = só Responsáveis (família). Contas de Admin/Professor (com
// login) ficam em Gerenciamento > Funcionários, junto do resto do cadastro de
// equipe — evita misturar "responsável de aluno" com "equipe da escola".
export default function AdminUserManagement({ currentUser }) {
  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const fetchUsersAndStudents = async () => {
    setIsLoading(true);
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .eq('school_id', currentUser.school_id)
        .eq('role', 'family')
        .order('name', { ascending: true });
      if (usersError) throw usersError;

      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('school_id', currentUser.school_id);
      if (studentsError) throw studentsError;

      const { data: authData, error: authError } = await supabase
        .from('authorized_persons')
        .select('id, name, relation, photo_url, photo_storage_path, family_id')
        .eq('school_id', currentUser.school_id);
      if (authError) throw authError;

      // Leitura híbrida em lote (mesma lógica do App.jsx): Storage tem
      // prioridade, cai pro base64 legado se a pessoa ainda não foi migrada
      // ou se a signed URL falhar.
      const pathsToResolve = (authData || []).map(a => a.photo_storage_path).filter(Boolean);
      const signedUrlByPath = pathsToResolve.length > 0
        ? await getAuthorizedPersonPhotoSignedUrls(pathsToResolve).catch(() => new Map())
        : new Map();
      const resolvePhotoUrl = (ap) => (ap.photo_storage_path
        ? (signedUrlByPath.get(ap.photo_storage_path) || ap.photo_url || null)
        : (ap.photo_url || null));

      const combinedData = usersData.map(user => {
        const familyAuths = (authData || []).filter(
          ap => ap.family_id === user.id
        );
        const matchingAuth = familyAuths.find(
          ap => ap.name.toLowerCase().trim() === user.name.toLowerCase().trim()
        ) || familyAuths.find(ap => ap.relation?.includes('(Titular)'));
        return {
          ...user,
          photo_url: matchingAuth ? resolvePhotoUrl(matchingAuth) : null,
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

  const handleDeleteUser = (userId) => setConfirmDeleteUserId(userId);

  const confirmDeleteUser = async () => {
    const userId = confirmDeleteUserId;
    setDeletingUserId(userId);
    try {
      // Chama a Edge Function para excluir o usuário dos dois ambientes (auth e public)
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });

      if (error) throw error;

      setUsersList(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir usuário: ' + (err.message || 'Desconhecido'));
    } finally {
      setDeletingUserId(null);
      setConfirmDeleteUserId(null);
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
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Gestão de Usuários</h2>
            <p className="text-small text-on-surface-variant">
              {usersList.length} responsável{usersList.length !== 1 ? 'is' : ''} cadastrado{usersList.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Campo de busca em tempo real */}
        <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-on-surface-variant/70" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary outline-none text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant/70 hover:text-on-surface-variant"
              >
                <X size={14}/>
              </button>
            )}
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition font-medium text-sm whitespace-nowrap"
          >
            <FileSpreadsheet size={18} />
            <span className="hidden md:inline">Importar Excel</span>
          </button>
        </div>
      </div>

      {/* Resultados - Scrollable Container */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
            <Users className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-on-surface-variant font-medium text-small">
              {searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Nenhum responsável cadastrado.'}
            </h3>
          </div>
        ) : (
          <>
            {searchTerm && (
              <p className="text-xs text-on-surface-variant/70 mb-4">
                {filteredUsers.length} resultado{filteredUsers.length !== 1 ? 's' : ''} para "<span className="font-semibold text-on-surface-variant">{searchTerm}</span>"
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4">
              {filteredUsers.map(user => (
                <div key={user.id} className="border border-outline-variant rounded-zela-lg p-5 hover:border-primary/30 hover:shadow-md transition-all flex flex-col bg-surface-container-lowest relative group">

                  {/* Botões de ação — sempre visíveis no mobile, hover no desktop */}
                  <div className="absolute top-4 right-4 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                      title="Editar usuário"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-1.5 text-on-surface-variant/70 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Excluir usuário"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Avatar + Nome */}
                  <div className="flex items-center gap-3 mb-4 pr-16">
                    <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-primary/10 bg-gradient-to-br from-primary/20 to-primary/10">
                      {user.photo_url ? (
                        <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-black text-primary text-lg">{user.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-on-surface text-sm">{user.name}</h3>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded w-fit mt-0.5 inline-block bg-secondary/10 text-secondary">
                        Família
                      </span>
                    </div>
                  </div>

                  {/* Contatos */}
                  <div className="space-y-1.5 mb-4 flex-1">
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <Mail size={13} className="text-on-surface-variant/70 shrink-0"/>
                      <span className="truncate text-xs" title={user.email}>{user.email}</span>
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <Phone size={13} className="text-on-surface-variant/70 shrink-0"/>
                        <span className="text-xs">{user.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Alunos vinculados */}
                  {user.students?.length > 0 && (
                    <div className="mt-auto pt-3 border-t border-outline-variant">
                      <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <GraduationCap size={11}/> Alunos ({user.students.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {user.students.map(s => (
                          <span key={s.id} className="bg-surface-container-low border border-outline-variant text-on-surface-variant text-[10px] font-medium px-2 py-0.5 rounded-md">
                            {s.name} {s.turma ? <span className="text-on-surface-variant/70">· {s.turma}</span> : ''}
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

      {/* Modal de Importação */}
      {showImportModal && (
        <AdminImportModal
          currentUser={currentUser}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            fetchUsersAndStudents();
          }}
        />
      )}

      {confirmDeleteUserId && (
        <ConfirmModal
          title="Excluir usuário"
          message="Tem certeza que deseja excluir este usuário? Todos os dados vinculados serão perdidos."
          isLoading={deletingUserId === confirmDeleteUserId}
          onConfirm={confirmDeleteUser}
          onCancel={() => setConfirmDeleteUserId(null)}
        />
      )}
    </div>
  );
}
