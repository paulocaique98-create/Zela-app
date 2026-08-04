import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import Header from './components/Header';
import MobileMenu from './components/MobileMenu';
import AuthModal from './components/AuthModal';
import { supabase } from './lib/supabase';
import { preloadFaceModels } from './lib/faceModels';
import { navigateTo } from './utils/navigate';

const Login = lazy(() => import('./components/Login'));
const FamilyPortal = lazy(() => import('./components/FamilyPortal'));
const AdminPortal = lazy(() => import('./components/AdminPortal'));
const DeveloperLayout = lazy(() => import('./components/DeveloperLayout'));
const TotemComingSoon = lazy(() => import('./components/TotemComingSoon'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));
const AdminKioskFullscreen = lazy(() => import('./components/AdminKioskFullscreen'));

// Helper para extrair o horário curto "HH:mm" de forma segura de qualquer formato
const parseShortTime = (timeStr, todayDate = null) => {
  if (!timeStr) return null;
  if (timeStr.includes('|')) {
    const parts = timeStr.split('|');
    const datePart = parts[0];
    const timePart = parts[1] || '';
    if (todayDate && datePart !== todayDate) return null;
    return timePart.substring(0, 5);
  }
  return timeStr.substring(0, 5);
};

export default function App() {
  const [students, setStudents] = useState([]);
  const [authorized, setAuthorized] = useState([]);

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('zela_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // ── Roteamento reativo via History API ──
  // currentPath reage a pushState (via navigateTo) e ao botão Voltar do navegador.
  // Sem isso, window.location.pathname é lido apenas 1x no render inicial.
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [adminTab, setAdminTab] = useState('home');
  const [familyTab, setFamilyTab] = useState('home'); // home | history | settings
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', relation: 'Outro', emergencyOrder: '', isTemporary: false, temporaryUntil: '' });

  // Emergency State
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyData, setEmergencyData] = useState(null);

  const [currentSchool, setCurrentSchool] = useState(null);
  const [globalLogo, setGlobalLogo] = useState(null);

  // Ref para o canal Realtime — permite cancelar quando o usuário deslogar
  const realtimeChannelRef = useRef(null);

  // Ref estável para currentUser — evita closures desatualizadas em listeners de longa duração
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Valida sessão na montagem do app (roda apenas 1x)
  useEffect(() => {
    const validateSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session && localStorage.getItem('zela_user')) {
        localStorage.removeItem('zela_user');
        setCurrentUser(null);
      }
    };
    validateSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('zela_user');
        setCurrentUser(null);
      }
      // TOKEN_REFRESHED: ignorado intencionalmente — não causa nenhuma ação
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // [] = roda apenas 1x na montagem, não reregistra ao trocar de rota

  // Listener de visibilidade — detecta usuário excluído ao voltar para a aba.
  // CRÍTICO: NÃO chama fetchData() — o Realtime já mantém os dados atualizados.
  // Só age se o usuário foi removido do banco; caso normal (usuário válido) = NÃO FAZ NADA.
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Só agir quando a aba volta ao foco
      if (document.visibilityState !== 'visible') return;

      const user = currentUserRef.current;
      // Sem usuário logado = não há sessão para verificar
      if (!user) return;

      const { data: { session } } = await supabase.auth.getSession();
      // Sem sessão Supabase ativa = não fazer nada (o onAuthStateChange já trata)
      if (!session) return;

      // Verifica se o usuário ainda existe na tabela pública
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();

      // USUÁRIO VÁLIDO → retornar imediatamente sem causar nenhum efeito
      if (userData) return;

      // Só chega aqui se o usuário foi excluído do banco
      // Reload intencional: limpa completamente o estado após exclusão
      await supabase.auth.signOut();
      localStorage.removeItem('zela_user');
      setCurrentUser(null);
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []); // [] = listener estável, não reregistra a cada render

  const fetchGlobalLogo = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'global_logo')
        .maybeSingle();
      if (data) {
        setGlobalLogo(data.value);
      } else {
        setGlobalLogo(null);
      }
    } catch (e) {
      console.error('Erro ao buscar logo global:', e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchGlobalLogo();
      if (currentUser.role !== 'developer') {
        fetchData();
        setupRealtime();
      }
    } else {
      setGlobalLogo(null);
      // Cancela a subscrição ao deslogar
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    }
  }, [currentUser]);

  // Sufixo estável por sessão — evita recriar o canal desnecessariamente a cada render
  const channelSuffixRef = useRef(Math.random().toString(36).substring(2, 8));

  const setupRealtime = () => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    console.info('[Zela] Conectando ao canal Realtime (students)...');
    const channelName = `students-realtime-${currentUser.id}-${channelSuffixRef.current}`;

    const formatStudent = (s) => {
      return {
        id: s.id,
        name: s.name,
        familyId: s.family_id,
        status: s.status,
        contractedHours: s.contracted_hours,
        todayRecord: {
          entry: parseShortTime(s.today_entry),
          exit: parseShortTime(s.today_exit),
          // Preserva os valores completos para usar como horário original na confirmação
          entry_full: s.today_entry || null,
          exit_full: s.today_exit || null,
        },
      };
    };

    // SEM filtro de coluna no canal — filtros de coluna exigem REPLICA IDENTITY FULL;
    // sem essa configuração no banco, os eventos são descartados silenciosamente no servidor.
    // A filtragem por escola/família é feita no callback (mais confiável e independe do banco).
    const pgFilter = { event: '*', schema: 'public', table: 'students' };

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', pgFilter, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === 'UPDATE') {
          // Para UPDATE: verificar se o aluno existe no estado local — mais confiável
          // que filtrar por school_id no payload (school_id pode não vir no Realtime
          // dependendo da configuração de colunas da publicação).
          setStudents((prev) => {
            if (!prev.some(s => s.id === newRow.id)) return prev; // não é desta escola
            console.debug('[Zela] Realtime evento recebido:', eventType, newRow?.id, newRow?.status);
            return prev.map((s) => {
              if (s.id !== newRow.id) return s;
              const formatted = formatStudent(newRow);
              return {
                ...s,
                ...formatted,
                todayRecord: { ...s.todayRecord, ...formatted.todayRecord }
              };
            });
          });

        } else if (eventType === 'INSERT') {
          // Para INSERT: filtrar por school_id/family_id se vierem no payload
          if (currentUser.role === 'family') {
            if (newRow?.family_id && newRow.family_id !== currentUser.id) return;
          } else {
            if (newRow?.school_id && newRow.school_id !== currentUser.school_id) return;
          }
          console.debug('[Zela] Realtime evento recebido:', eventType, newRow?.id);
          setStudents((prev) => [...prev, formatStudent(newRow)]);

        } else if (eventType === 'DELETE') {
          setStudents((prev) => prev.filter((s) => s.id !== oldRow.id));
        }
      })
      .on('broadcast', { event: 'emergency_alert' }, (payload) => {
        setEmergencyData(payload.payload);
        setIsEmergency(true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Zela] Realtime conectado com sucesso.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[Zela] Realtime desconectado: ${status}.`);
        }
      });

    realtimeChannelRef.current = channel;
  };

  const fetchData = async () => {
    console.info('[Zela] Carregando dados da escola e alunos...');
    setIsLoading(true);
    try {
      let schoolPromise = Promise.resolve({ data: null });
      if (currentUser.school_id) {
        schoolPromise = supabase
          .from('schools')
          .select('*')
          .eq('id', currentUser.school_id)
          .single();
      }

      // Fetch Students
      let studentsQuery = supabase.from('students').select('*').eq('school_id', currentUser.school_id);
      if (currentUser.role === 'family') {
        studentsQuery = studentsQuery.eq('family_id', currentUser.id);
      }

      // Fetch Authorized Persons
      let authQuery = supabase.from('authorized_persons').select('*').eq('school_id', currentUser.school_id);
      if (currentUser.role === 'family') {
        authQuery = authQuery.eq('family_id', currentUser.id);
      }

      const [schoolRes, studentsRes, authRes] = await Promise.all([
        schoolPromise,
        studentsQuery,
        authQuery
      ]);

      if (schoolRes.data) setCurrentSchool(schoolRes.data);
      const studentsData = studentsRes.data;
      const authData = authRes.data;

      const todayDate = new Date().toISOString().split('T')[0];

      const formattedStudents = (studentsData || []).map(s => {
        // Parse date and time if it's in the new format "YYYY-MM-DD|HH:mm:ss"
        let entryTime = s.today_entry;
        let exitTime = s.today_exit;
        let sStatus = s.status;

        const parsedEntry = parseShortTime(entryTime, todayDate);
        const parsedExit = parseShortTime(exitTime, todayDate);

        // Se a entrada foi resetada (virou o dia) e o status ainda era 'in_school', 'left', etc, volta para 'idle'
        if (!parsedEntry && s.today_entry) {
          sStatus = 'idle';
          // Opcional: Atualizar no banco em background
          supabase.from('students').update({ status: 'idle', today_entry: null, today_exit: null }).eq('id', s.id).then();
        }

        return {
          id: s.id,
          name: s.name,
          familyId: s.family_id,
          status: sStatus,
          contractedHours: s.contracted_hours,
          todayRecord: {
            entry: parsedEntry,
            exit: parsedExit,
            entry_full: s.today_entry,
            exit_full: s.today_exit
          }
        };
      });
      setStudents(formattedStudents);

      // Authorized Persons (já carregado pelo Promise.all acima)

      const formattedAuth = (authData || []).map(a => ({
        id: a.id,
        name: a.name,
        relation: a.relation,
        hasPhoto: a.has_photo,
        photo_url: a.photo_url,
        has_biometrics: a.face_descriptor != null,
        status: a.status,
        emergencyOrder: a.emergency_order,
        temporaryUntil: a.temporary_until
      }));
      setAuthorized(formattedAuth);

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
    localStorage.setItem('zela_user', JSON.stringify(user));
    setFamilyTab('home');
    
    // Preload dos modelos faciais em background sem travar UI
    preloadFaceModels().catch(console.error);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentSchool(null);
    setStudents([]);
    setAuthorized([]);
    localStorage.removeItem('zela_user');
    // Faz o logoff do Auth Supabase por garantia
    supabase.auth.signOut().catch(() => {});
  };

  // Temporizador de inatividade (10 minutos)
  // Usa currentPath para detectar o totem, evitando leitura direta de window.location
  useEffect(() => {
    let inactivityTimer;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      // Se não houver usuário logado ou estiver no totem, não ativa o timer
      if (!currentUser || currentPath === '/totem') return;
      
      inactivityTimer = setTimeout(() => {
        handleLogout();
        // Reload intencional após inatividade — limpa todo o estado do app
        window.location.reload();
      }, 600000); // 10 minutos (600.000 ms)
    };

    // Eventos que indicam atividade do usuário
    const events = ['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll'];

    // Atribui os listeners de evento apenas se houver usuário logado e fora do totem
    if (currentUser && currentPath !== '/totem') {
      events.forEach(event => window.addEventListener(event, resetTimer));
      resetTimer(); // Inicia o contador logo de cara
    }

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [currentUser, currentPath]);

  const togglePhoto = async (id, photoUrl = null, descriptorArray = null) => {
    try {
      const updates = { has_photo: !!photoUrl };
      if (photoUrl) {
        updates.photo_url = photoUrl;
      } else {
        updates.photo_url = null;
      }

      if (descriptorArray) {
        updates.face_descriptor = JSON.stringify(descriptorArray);
      } else {
        updates.face_descriptor = null;
      }

      const { error } = await supabase.from('authorized_persons').update(updates).eq('id', id);
      if (!error) {
        setAuthorized(prev => prev.map(p => p.id === id ? { ...p, hasPhoto: !!photoUrl, has_biometrics: !!descriptorArray, photo_url: photoUrl } : p));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAuth = async (newPerson) => {
    try {
      const dbPerson = {
        family_id: currentUser.id,
        name: newPerson.name,
        relation: newPerson.relation,
        has_photo: newPerson.hasPhoto || false,

        emergency_order: newPerson.emergencyOrder || null,
        temporary_until: newPerson.temporaryUntil ? newPerson.temporaryUntil.split('/').reverse().join('-') : null,
        school_id: currentUser.school_id
      };

      const { data, error } = await supabase.from('authorized_persons').insert([dbPerson]).select();

      if (!error && data && data.length > 0) {
        const a = data[0];
        setAuthorized([...authorized, {
          id: a.id,
          name: a.name,
          relation: a.relation,
          hasPhoto: a.has_photo,
          status: a.status,
          emergencyOrder: a.emergency_order,
          temporaryUntil: a.temporary_until
        }]);
      }
    } catch (err) {
      console.error(err);
    }

    setIsAuthModalOpen(false);
    setAuthForm({ name: '', relation: 'Outro', emergencyOrder: '', isTemporary: false, temporaryUntil: '' });
  };

  const updateStudentStatus = async (studentId, newStatus) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const now = new Date();
    const nowStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const nowShortStr = nowStr.substring(0, 5);
    const dateStr = now.toISOString().split('T')[0];
    const fullRecordStr = `${dateStr}|${nowStr}`;

    // Determina o tipo de evento para o log
    const isRequestEntry = newStatus === 'pending_entry';
    const isRequestExit = newStatus === 'pending_exit';
    const isConfirmEntry = newStatus === 'in_school';
    const isConfirmExit = newStatus === 'left';

    try {
      // 1. Atualiza o status atual do aluno na tabela students
      let studentUpdates = { status: newStatus };

      // Grava o horário exato da solicitação pelo pai/totem (ou direto pelo admin se não havia solicitação)
      let usedEntryStr = student.todayRecord.entry_full;
      let usedExitStr = student.todayRecord.exit_full;

      if (isRequestEntry || (isConfirmEntry && !student.todayRecord.entry)) {
        studentUpdates.today_entry = fullRecordStr;
        studentUpdates.today_exit = null;
        usedEntryStr = fullRecordStr;
        usedExitStr = null;
      } else if (isRequestExit || (isConfirmExit && !student.todayRecord.exit)) {
        studentUpdates.today_exit = fullRecordStr;
        usedExitStr = fullRecordStr;
      }

      const { error } = await supabase.from('students').update(studentUpdates).eq('id', studentId);
      if (error) throw error;

      // 2. Se for confirmação de entrada ou saída, insere log imutável usando o horário da solicitação original!
      if (isConfirmEntry || isConfirmExit) {
        let eventTimeIso = now.toISOString();

        // Busca o horário salvo (pode estar no estado local ou precisar ir ao banco)
        let recordStr = isConfirmEntry ? usedEntryStr : usedExitStr;

        // Fallback: se o estado local não tem o horário completo (veio via Realtime antigo), busca no banco
        if (!recordStr) {
          const { data: freshStudent } = await supabase
            .from('students')
            .select('today_entry, today_exit')
            .eq('id', studentId)
            .single();
          if (freshStudent) {
            recordStr = isConfirmEntry ? freshStudent.today_entry : freshStudent.today_exit;
          }
        }

        if (recordStr && recordStr.includes('|')) {
          const [datePart, timePart] = recordStr.split('|');
          const localDate = new Date(`${datePart}T${timePart}`);
          if (!isNaN(localDate.getTime())) {
            eventTimeIso = localDate.toISOString();
          }
        }

        const { error: logError } = await supabase.from('attendance_logs').insert([{
          student_id: studentId,
          family_id: student.familyId,
          school_id: currentUser.school_id,
          event_type: isConfirmEntry ? 'entry' : 'exit',
          event_time: eventTimeIso,
          recorded_by: currentUser.id,
        }]);
      }

      // 3. Atualiza estado local do React
      setStudents(prev => prev.map(s => {
        if (s.id !== studentId) return s;
        return {
          ...s,
          status: newStatus,
          todayRecord: {
            entry: parseShortTime(usedEntryStr) || s.todayRecord.entry,
            exit: parseShortTime(usedExitStr) || (isConfirmEntry ? null : s.todayRecord.exit),
            // Mantém os valores completos: se a confirmação não mudou, preserva o anterior
            entry_full: usedEntryStr || s.todayRecord.entry_full,
            exit_full: isConfirmEntry ? null : (usedExitStr || s.todayRecord.exit_full),
          },
        };
      }));

      // 4. Se foi uma saída confirmada, reseta para idle após 2s
      if (isConfirmExit) {
        setTimeout(async () => {
          await supabase.from('students').update({ status: 'idle' }).eq('id', studentId);
          setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, status: 'idle' } : s
          ));
        }, 2000);
      }

    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      throw err;
    }
  };

  const requestKioskAccess = async (studentIds) => {
    if (!studentIds || studentIds.length === 0) return;
    for (const studentId of studentIds) {
      const student = students.find(s => s.id === studentId);
      if (!student) continue;
      
      let newStatus = student.status;
      if (['idle', 'left', 'absent'].includes(student.status)) {
        newStatus = 'pending_entry';
      } else if (student.status === 'in_school') {
        newStatus = 'pending_exit';
      }
      
      if (newStatus !== student.status) {
        // Transição normal: novo status diferente do atual
        const { error } = await supabase
          .from('students')
          .update({ status: newStatus })
          .eq('id', studentId);
        
        if (error) {
          console.error('Erro ao atualizar status do aluno:', error);
          throw new Error(error.message);
        }
        
        await updateStudentStatus(studentId, newStatus);

      } else if (newStatus === 'pending_entry' || newStatus === 'pending_exit') {
        // Aluno já está no status pending: re-disparar o evento Realtime
        // fazendo um UPDATE no banco sem mudar o status (atualiza today_entry
        // para notificar o monitor que pode ter perdido o evento anterior).
        const timestampField = newStatus === 'pending_entry' ? 'today_entry' : 'today_exit';
        const now = new Date();
        const nowStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toISOString().split('T')[0];
        const fullRecordStr = `${dateStr}|${nowStr}`;
        
        await supabase
          .from('students')
          .update({ status: newStatus, [timestampField]: fullRecordStr })
          .eq('id', studentId);
        // Nota: não lança erro aqui — é um re-envio, não uma operação crítica
        console.info('[Zela] Re-disparando notificação Realtime para aluno já em status pending:', studentId);
      }
    }
  };


  const triggerEmergency = async (data) => {
    if (realtimeChannelRef.current) {
      await realtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'emergency_alert',
        payload: { triggeredBy: currentUser.name, time: new Date().toLocaleTimeString(), ...data },
      });
      // Set local state as well
      setEmergencyData({ triggeredBy: currentUser.name, time: new Date().toLocaleTimeString(), ...data });
      setIsEmergency(true);
    }
  };

  const dismissEmergency = () => {
    setIsEmergency(false);
    setEmergencyData(null);
  };

  // ──────── ROUTING GLOBAL ────────
  // Usa currentPath (estado reativo) em vez de window.location.pathname (estático).
  // currentPath é atualizado por navigateTo() via popstate e pelo botão Voltar do navegador.
  if (currentPath === '/reset-password' || window.location.hash.includes('type=recovery')) {
    return <Suspense fallback={<div className="h-screen flex items-center justify-center">Carregando...</div>}><ResetPassword /></Suspense>;
  }

  if (currentPath === '/totem') {
    return <Suspense fallback={<div className="h-screen flex items-center justify-center">Carregando...</div>}><TotemComingSoon /></Suspense>;
  }

  if (!currentUser) {
    return <Suspense fallback={<div className="h-screen flex items-center justify-center">Carregando...</div>}><Login onLogin={handleLogin} /></Suspense>;
  }

  // ──────── ROUTING GLOBAL ────────
  if (currentPath === '/admin/totem-checkin') {
    if (currentUser.role !== 'admin') {
      // Redireciona sem reload — o guardrail apenas muda a rota exibida
      navigateTo('/');
      return null;
    }
    return (
      <Suspense fallback={<div className="h-screen bg-slate-900 flex items-center justify-center">Carregando Kiosk...</div>}>
        <AdminKioskFullscreen 
          currentUser={currentUser} 
          currentSchool={currentSchool} 
          students={students} 
          updateStudentStatus={updateStudentStatus}
          requestKioskAccess={requestKioskAccess}
        />
      </Suspense>
    );
  }

  return (
    <div className="h-screen h-[100dvh] w-screen overflow-hidden flex flex-col bg-slate-100 font-sans text-slate-800 selection:bg-indigo-100">
      <Header
        currentUser={currentUser}
        currentSchool={currentSchool}
        globalLogo={globalLogo}
        onLogout={handleLogout}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        onTriggerEmergency={triggerEmergency}
      />

      <main className="flex-1 overflow-hidden flex flex-col p-3 sm:p-4 md:p-6 lg:p-6">
        <div className="w-full h-full flex flex-col">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-900"></div>
            </div>
          ) : (
            <Suspense fallback={
              <div className="flex justify-center items-center py-20 w-full h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-900"></div>
              </div>
            }>
              {currentUser.role === 'developer' ? (
                <DeveloperLayout 
                  currentUser={currentUser} 
                  onUpdateGlobalLogo={fetchGlobalLogo}
                  isMobileMenuOpen={isMobileMenuOpen}
                  setIsMobileMenuOpen={setIsMobileMenuOpen}
                  onLogout={handleLogout}
                />
              ) : currentUser.role === 'admin' ? (
                <AdminPortal
                  currentUser={currentUser}
                  currentSchool={currentSchool}
                  students={students}
                  adminTab={adminTab}
                  setAdminTab={setAdminTab}
                  updateStudentStatus={updateStudentStatus}
                  onUpdateSchool={fetchData}
                  isMobileMenuOpen={isMobileMenuOpen}
                  setIsMobileMenuOpen={setIsMobileMenuOpen}
                  onLogout={handleLogout}
                />
              ) : (
                <FamilyPortal
                  currentUser={currentUser}
                  currentSchool={currentSchool}
                  setCurrentUser={setCurrentUser}
                  students={students}
                  familyTab={familyTab}
                  setFamilyTab={setFamilyTab}
                  updateStudentStatus={updateStudentStatus}
                  authorized={authorized}
                  togglePhoto={togglePhoto}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                  isMobileMenuOpen={isMobileMenuOpen}
                  setIsMobileMenuOpen={setIsMobileMenuOpen}
                  onLogout={handleLogout}
                />
              )}
            </Suspense>
          )}
        </div>
      </main>

      {isAuthModalOpen && (
        <AuthModal
          authForm={authForm}
          setAuthForm={setAuthForm}
          onClose={() => setIsAuthModalOpen(false)}
          onSave={handleSaveAuth}
        />
      )}

      {/* EMERGENCY OVERLAY */}
      {isEmergency && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-red-900/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-red-600 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-4 border-red-500 flex flex-col animate-pulse">
            <div className="p-8 text-center text-white space-y-6">
              <div className="w-24 h-24 bg-white text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              </div>
              <div>
                <h1 className="text-4xl font-black uppercase tracking-widest mb-2">Emergência!</h1>
                <p className="text-red-100 text-lg font-medium">Atenção: A equipe da escola acionou o botão de pânico.</p>
              </div>
              <div className="bg-red-800/50 p-4 rounded-2xl border border-red-700/50 backdrop-blur-sm text-left">
                <p className="text-sm font-bold text-red-200 uppercase mb-1">Detalhes da Ocorrência:</p>
                <p className="font-mono text-white mb-1">Acionado por: {emergencyData?.triggeredBy || 'Equipe Zela'}</p>
                <p className="font-mono text-white">Horário: {emergencyData?.time || '--:--'}</p>
                {emergencyData?.message && <p className="font-mono text-amber-300 mt-2">"{emergencyData.message}"</p>}
              </div>
              <div className="pt-6 border-t border-red-500">
                <button onClick={dismissEmergency} className="bg-white text-red-600 font-black py-4 px-8 rounded-2xl hover:bg-red-50 active:scale-95 transition-all shadow-xl w-full text-lg uppercase tracking-wider">
                  Ciente / Dispensar Alerta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
