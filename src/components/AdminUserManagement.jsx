import React, { useState, useEffect, useMemo } from 'react';
import { Users, Mail, Phone, GraduationCap, Edit, Trash2, Search, X, FileSpreadsheet, Check, UserRoundCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAuthorizedPersonPhotoSignedUrls } from '../lib/storage';
import AdminUserRegistration from './AdminUserRegistration';
import AdminImportModal from './AdminImportModal';
import ConfirmModal from './ConfirmModal';
import DuplicateStudentWarningModal from './DuplicateStudentWarningModal';

// Gestão de Usuários = só Responsáveis (família). Contas de Admin/Professor (com
// login) ficam em Gerenciamento > Funcionários, junto do resto do cadastro de
// equipe — evita misturar "responsável de aluno" com "equipe da escola".
export default function AdminUserManagement({ currentUser, initialTab = 'active' }) {
  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab); // 'active' | 'pending'
  const [approvingUserId, setApprovingUserId] = useState(null);
  const [confirmRejectUserId, setConfirmRejectUserId] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { userId, matches }

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

      // 2º Responsável não tem aluno vinculado por family_id (isso é exclusivo
      // do titular) — o vínculo dele mora aqui, em student_guardians. Usado só
      // pra exibir "Pai/Mãe de <aluno>" no card de quem não é titular de nenhum
      // aluno diretamente (ver render abaixo).
      const { data: guardianLinksData, error: guardianLinksError } = await supabase
        .from('student_guardians')
        .select('guardian_id, student_id, relationship')
        .eq('school_id', currentUser.school_id);
      if (guardianLinksError) throw guardianLinksError;

      const { data: authData, error: authError } = await supabase
        .from('authorized_persons')
        .select('id, name, relation, photo_storage_path, family_id')
        .eq('school_id', currentUser.school_id);
      if (authError) throw authError;

      // Resolução em lote (mesma lógica do App.jsx): foto vem exclusivamente
      // do Storage; sem photo_storage_path ou signed URL indisponível =
      // sem foto (placeholder).
      const pathsToResolve = (authData || []).map(a => a.photo_storage_path).filter(Boolean);
      const signedUrlByPath = pathsToResolve.length > 0
        ? await getAuthorizedPersonPhotoSignedUrls(pathsToResolve).catch(() => new Map())
        : new Map();
      const resolvePhotoUrl = (ap) => (ap.photo_storage_path ? (signedUrlByPath.get(ap.photo_storage_path) || null) : null);

      const combinedData = usersData.map(user => {
        const familyAuths = (authData || []).filter(
          ap => ap.family_id === user.id
        );
        const matchingAuth = familyAuths.find(
          ap => ap.name.toLowerCase().trim() === user.name.toLowerCase().trim()
        ) || familyAuths.find(ap => ap.relation?.includes('(Titular)'));
        const ownStudents = studentsData.filter(s => s.family_id === user.id);

        // Só monta o vínculo de 2º responsável pra quem não é titular de
        // nenhum aluno — o titular já mostra a lista completa via ownStudents.
        const guardianLinks = ownStudents.length === 0
          ? (guardianLinksData || []).filter(g => g.guardian_id === user.id)
          : [];
        const linkedStudents = guardianLinks
          .map(g => studentsData.find(s => s.id === g.student_id))
          .filter(Boolean);
        const guardianRelationship = guardianLinks[0]?.relationship || null;

        return {
          ...user,
          photo_url: matchingAuth ? resolvePhotoUrl(matchingAuth) : null,
          authorized: familyAuths,
          students: ownStudents,
          linkedStudents,
          guardianRelationship,
        };
      });
      setUsersList(combinedData);
      setAllStudents(studentsData || []);
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
      const { error } = await supabase.functions.invoke('delete-user', {
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

  // Antes de aprovar, checa se algum dos alunos recém-criados por este
  // autocadastro já existe (mesmo nome) sob OUTRO responsável na escola —
  // sinal de que os dois pais/responsáveis se cadastraram cada um por conta
  // própria e duplicaram o mesmo filho (foi o que aconteceu com 8 alunos
  // nesta escola antes dessa checagem existir). Não bloqueia, só avisa: o
  // admin decide, caso a caso, se é a mesma criança ou não.
  const findDuplicateMatches = (user) => {
    if (!user.students?.length) return [];
    return user.students
      .map(s => {
        const norm = s.name.trim().toLowerCase();
        const existing = allStudents.find(other => other.id !== s.id && other.family_id !== user.id && other.name.trim().toLowerCase() === norm);
        if (!existing) return null;
        const existingFamily = usersList.find(u => u.id === existing.family_id);
        return {
          newStudent: { id: s.id, name: s.name, guardianId: user.id, isFinancial: user.guardian_type === 'Responsável Financeiro' },
          existing: { id: existing.id, name: existing.name, school_id: existing.school_id, family_name: existingFamily?.name || 'outro responsável' },
        };
      })
      .filter(Boolean);
  };

  // Aprovar um autocadastro (tela pública "Novo usuário?") — libera o login
  // mudando status 'pending' -> 'active'. Trigger de proteção do banco não
  // bloqueia essa coluna (só protege role/school_id/privilégios de admin).
  const handleApproveUser = async (userId) => {
    const user = usersList.find(u => u.id === userId);
    const matches = user ? findDuplicateMatches(user) : [];
    if (matches.length > 0) {
      setDuplicateWarning({ userId, matches });
      return;
    }
    await approveUser(userId);
  };

  const approveUser = async (userId) => {
    setApprovingUserId(userId);
    try {
      const { error } = await supabase.from('users').update({ status: 'active' }).eq('id', userId);
      if (error) throw error;
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, status: 'active' } : u));
    } catch (err) {
      console.error(err);
      alert('Erro ao aprovar cadastro: ' + (err.message || 'Desconhecido'));
    } finally {
      setApprovingUserId(null);
    }
  };

  const handleDuplicateResolved = async () => {
    const userId = duplicateWarning?.userId;
    setDuplicateWarning(null);
    await fetchUsersAndStudents(); // recarrega antes de aprovar, pra refletir os vínculos/remoções feitos no modal
    if (userId) await approveUser(userId);
  };

  const handleRejectUser = (userId) => setConfirmRejectUserId(userId);

  const confirmRejectUser = async () => {
    const userId = confirmRejectUserId;
    setDeletingUserId(userId);
    try {
      const { error } = await supabase.functions.invoke('delete-user', { body: { userId } });
      if (error) throw error;
      setUsersList(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error(err);
      alert('Erro ao rejeitar cadastro: ' + (err.message || 'Desconhecido'));
    } finally {
      setDeletingUserId(null);
      setConfirmRejectUserId(null);
    }
  };

  const pendingCount = usersList.filter(u => u.status === 'pending').length;

  // Busca em tempo real por nome OU email, dentro da aba ativa (Ativos/Pendentes)
  const filteredUsers = usersList.filter(user => {
    const inTab = activeTab === 'pending' ? user.status === 'pending' : user.status !== 'pending';
    if (!inTab) return false;
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      user.name.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term)
    );
  });

  // Modelo 06 (agrupado por núcleo familiar) validado com o usuário
  // (proposta com 6 layouts, 19/09) -- em vez de 1 card por conta (hoje o
  // titular e o 2º Responsável aparecem soltos, sem nada ligando os dois
  // visualmente), agrupa pelo(s) aluno(s) da família. Cobertura garantida:
  // todo usuário de filteredUsers cai em exatamente 1 grupo, mesmo quem não
  // tem aluno nenhum vinculado (grupo "solo", sem faixa de aluno no topo) --
  // ninguém pode sumir da lista por causa do agrupamento.
  const familyGroups = useMemo(() => {
    const groups = new Map();
    const consumed = new Set();

    // 1) Titulares -- cada um já é dono de um grupo (seus alunos = students).
    filteredUsers.forEach(user => {
      if (user.students?.length > 0) {
        groups.set(user.id, { key: user.id, students: user.students, guardians: [user] });
        consumed.add(user.id);
      }
    });

    // 2) 2º Responsável -- entra no grupo do titular que é dono do(s)
    // mesmo(s) aluno(s) vinculado(s). Se o titular não estiver no recorte
    // atual (ex.: titular ativo, 2º responsável pendente, abas diferentes),
    // vira o próprio grupo usando linkedStudents como referência.
    filteredUsers.forEach(user => {
      if (consumed.has(user.id)) return;
      if (user.linkedStudents?.length > 0) {
        const linkedIds = new Set(user.linkedStudents.map(s => s.id));
        const targetGroup = Array.from(groups.values()).find(g => g.students.some(s => linkedIds.has(s.id)));
        if (targetGroup) {
          targetGroup.guardians.push(user);
        } else {
          groups.set(user.id, { key: user.id, students: user.linkedStudents, guardians: [user] });
        }
        consumed.add(user.id);
      }
    });

    // 3) Ninguém vinculado a aluno nenhum -- grupo solo, sem faixa de aluno.
    filteredUsers.forEach(user => {
      if (consumed.has(user.id)) return;
      groups.set(user.id, { key: user.id, students: [], guardians: [user] });
      consumed.add(user.id);
    });

    return Array.from(groups.values());
  }, [filteredUsers]);

  const guardianBadges = (guardian) => (
    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded w-fit inline-block bg-secondary/10 text-secondary">
        Família
      </span>
      {guardian.linkedStudents?.length > 0 && (
        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded w-fit inline-block bg-primary/10 text-primary">
          2º Responsável
        </span>
      )}
      {guardian.status === 'pending' && (
        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded w-fit inline-block bg-amber-100 text-amber-700">
          Pendente
        </span>
      )}
    </div>
  );

  return (
    // Ganha o máximo de espaço no celular removendo a "moldura de cartão"
    // (borda/sombra/cantos arredondados/padding grande) que sobra dentro do
    // <main> do AdminPortal -- mesmo princípio já aplicado ao modal de
    // Editar Cadastro: o header (hambúrguer, logo) e o menu lateral do
    // AdminPortal continuam exatamente como estão, só o cartão desta tela
    // específica encolhe a moldura no celular. Volta ao visual de cartão
    // normal a partir de sm, igual às outras telas do Admin.
    // -m-3 sm:m-0 cancela exatamente o padding do <main> do AdminPortal
    // (p-3 no celular) só nesta tela -- as outras continuam com a margem
    // normal, e esta some de vez no mobile, encostando nas bordas de
    // verdade (não só "moldura menor").
    <div className="h-full flex flex-col bg-surface-container-lowest -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-zela-xl shadow-none sm:shadow-sm border-0 sm:border sm:border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header -- título "Gestão de Usuários" removido (o Header do app já
          mostra "Zela · Gestão de Usuários"/"Zela Usuários" dinamicamente),
          ícone + contador ficam numa linha só, mais compacta. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 p-2 rounded-zela-md text-primary shrink-0">
            <Users size={18} />
          </div>
          <p className="text-small text-on-surface-variant">
            {usersList.length} {usersList.length !== 1 ? 'responsáveis' : 'responsável'} cadastrado{usersList.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Abas: Ativos / Pendentes de aprovação (autocadastro público) */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-zela-md text-xs font-bold transition-all border ${activeTab === 'active' ? 'bg-primary text-white border-indigo-600' : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}
          >
            Ativos
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`relative px-4 py-2 rounded-zela-md text-xs font-bold transition-all border ${activeTab === 'pending' ? 'bg-primary text-white border-indigo-600' : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}
          >
            Pendentes
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black">
                {pendingCount}
              </span>
            )}
          </button>
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
              {searchTerm
                ? `Nenhum resultado para "${searchTerm}"`
                : activeTab === 'pending' ? 'Nenhum cadastro pendente de aprovação.' : 'Nenhum responsável cadastrado.'}
            </h3>
          </div>
        ) : (
          <>
            {searchTerm && (
              <p className="text-xs text-on-surface-variant/70 mb-4">
                {filteredUsers.length} resultado{filteredUsers.length !== 1 ? 's' : ''} para "<span className="font-semibold text-on-surface-variant">{searchTerm}</span>"
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4">
              {familyGroups.map(group => (
                <div key={group.key} className="border border-outline-variant rounded-zela-lg overflow-hidden hover:border-primary/30 hover:shadow-md transition-all bg-surface-container-lowest">
                  {/* Faixa do(s) aluno(s) -- só existe se o grupo tiver algum
                      aluno (titular ou vínculo de 2º Responsável); grupo
                      "solo" (ninguém vinculado a aluno) não mostra essa faixa. */}
                  {group.students.length > 0 && (
                    <div className="bg-secondary/10 text-secondary text-[10px] font-bold uppercase tracking-wider px-4 py-2 flex items-center gap-1.5">
                      <GraduationCap size={12} className="shrink-0"/>
                      <span className="truncate">
                        {group.students.map(s => s.name).join('  •  ')}
                      </span>
                    </div>
                  )}

                  <div className="p-3.5 space-y-2.5">
                    {group.guardians.map((guardian, gi) => (
                      <div
                        key={guardian.id}
                        className={`relative group/g flex items-start gap-3 ${gi > 0 ? 'pt-3 border-t border-dashed border-outline-variant' : ''}`}
                      >
                        {/* Botões de ação — sempre visíveis no mobile, hover no desktop (mesmo comportamento de antes) */}
                        <div className="absolute top-0 right-0 flex gap-1 opacity-100 md:opacity-0 md:group-hover/g:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingUser(guardian)}
                            className="p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                            title="Editar usuário"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            onClick={() => guardian.status === 'pending' ? handleRejectUser(guardian.id) : handleDeleteUser(guardian.id)}
                            className="p-1.5 text-on-surface-variant/70 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title={guardian.status === 'pending' ? 'Rejeitar cadastro' : 'Excluir usuário'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-primary/10 bg-gradient-to-br from-primary/20 to-primary/10">
                          {guardian.photo_url ? (
                            <img src={guardian.photo_url} alt={guardian.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-black text-primary text-sm">{guardian.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 pr-14">
                          <h3 className="font-bold text-on-surface text-sm truncate">{guardian.name}</h3>
                          {guardianBadges(guardian)}

                          <div className="space-y-1 mt-2">
                            <div className="flex items-center gap-2 text-on-surface-variant">
                              <Mail size={12} className="text-on-surface-variant/70 shrink-0"/>
                              <span className="truncate text-xs" title={guardian.email}>{guardian.email}</span>
                            </div>
                            {guardian.phone && (
                              <div className="flex items-center gap-2 text-on-surface-variant">
                                <Phone size={12} className="text-on-surface-variant/70 shrink-0"/>
                                <span className="text-xs">{guardian.phone}</span>
                              </div>
                            )}
                          </div>

                          {/* 2º Responsável sem faixa de aluno própria acima
                              (grupo criado sozinho porque o titular não está
                              neste recorte) -- mostra o vínculo por texto,
                              igual já era feito antes. */}
                          {group.students.length === 0 && guardian.linkedStudents?.length > 0 && (
                            <p className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-2">
                              <UserRoundCheck size={13} className="text-primary shrink-0"/>
                              {guardian.guardianRelationship || 'Responsável'} de{' '}
                              <span className="font-semibold text-on-surface">
                                {guardian.linkedStudents.map(s => s.name).join(', ')}
                              </span>
                            </p>
                          )}

                          {guardian.status === 'pending' && (
                            <button
                              onClick={() => handleApproveUser(guardian.id)}
                              disabled={approvingUserId === guardian.id}
                              className="mt-2 flex items-center justify-center gap-2 w-full py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition font-bold text-xs disabled:opacity-50"
                            >
                              <Check size={13} /> {approvingUserId === guardian.id ? 'Aprovando...' : 'Aprovar cadastro'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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

      {confirmRejectUserId && (
        <ConfirmModal
          title="Rejeitar cadastro"
          message="Tem certeza que deseja rejeitar este cadastro? A conta e os alunos vinculados serão excluídos permanentemente."
          isLoading={deletingUserId === confirmRejectUserId}
          onConfirm={confirmRejectUser}
          onCancel={() => setConfirmRejectUserId(null)}
        />
      )}

      {duplicateWarning && (
        <DuplicateStudentWarningModal
          matches={duplicateWarning.matches}
          onClose={() => setDuplicateWarning(null)}
          onResolved={handleDuplicateResolved}
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
