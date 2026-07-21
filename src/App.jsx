import React, { useState, useEffect, useRef } from 'react';
import Login from './components/Login';
import Header from './components/Header';
import MobileMenu from './components/MobileMenu';
import FamilyPortal from './components/FamilyPortal';
import AdminPortal from './components/AdminPortal';
import AuthModal from './components/AuthModal';
import DeveloperLayout from './components/DeveloperLayout';
import TotemComingSoon from './components/TotemComingSoon';
import ResetPassword from './components/ResetPassword';
import AdminKioskFullscreen from './components/AdminKioskFullscreen';
import { supabase } from './lib/supabase';

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

  const [adminTab, setAdminTab] = useState('monitor');
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

  // Valida a sessão do Supabase ao carregar o app.
  // Se o token guardado no localStorage expirou ou é inválido,
  // derruba a sessão local para evitar o app abrir "logado" indevidamente.
  useEffect(() => {
    const validateSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session && localStorage.getItem('zela_user')) {
        // Token inválido/expirado — faz logout silencioso
        localStorage.removeItem('zela_user');
        setCurrentUser(null);
      }
    };
    validateSession();

    // Escuta mudanças de estado de auth (ex: token expirado em tempo real)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem('zela_user');
          setCurrentUser(null);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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

  const setupRealtime = () => {
    // Remove canal anterior se existir
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    // Nome único por usuário — evita conflito quando admin e família
    // estão no mesmo navegador em abas diferentes
    const channelName = `students-realtime-${currentUser.id}`;

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

    // Filtro: família ouve apenas seus próprios alunos; admin ouve tudo da sua escola
    const filter = currentUser.role === 'family'
      ? { event: '*', schema: 'public', table: 'students', filter: `family_id=eq.${currentUser.id}` }
      : { event: '*', schema: 'public', table: 'students', filter: `school_id=eq.${currentUser.school_id}` };

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', filter, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === 'UPDATE') {
          setStudents((prev) =>
            prev.map((s) => (s.id === newRow.id ? formatStudent(newRow) : s))
          );
        } else if (eventType === 'INSERT') {
          setStudents((prev) => [...prev, formatStudent(newRow)]);
        } else if (eventType === 'DELETE') {
          setStudents((prev) => prev.filter((s) => s.id !== oldRow.id));
        }
      })
      .on('broadcast', { event: 'emergency_alert' }, (payload) => {
        setEmergencyData(payload.payload);
        setIsEmergency(true);
      })
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (currentUser.school_id) {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('*')
          .eq('id', currentUser.school_id)
          .single();
        if (schoolData) setCurrentSchool(schoolData);
      }

      // Fetch Students
      let studentsQuery = supabase.from('students').select('*').eq('school_id', currentUser.school_id);
      if (currentUser.role === 'family') {
        studentsQuery = studentsQuery.eq('family_id', currentUser.id);
      }
      const { data: studentsData } = await studentsQuery;

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

      // Fetch Authorized Persons
      let authQuery = supabase.from('authorized_persons').select('*').eq('school_id', currentUser.school_id);
      if (currentUser.role === 'family') {
        authQuery = authQuery.eq('family_id', currentUser.id);
      }
      const { data: authData } = await authQuery;

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
  useEffect(() => {
    let inactivityTimer;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      // Se não houver usuário logado ou estiver no totem, não ativa o timer
      if (!currentUser || window.location.pathname === '/totem') return;
      
      inactivityTimer = setTimeout(() => {
        handleLogout();
        window.location.reload();
      }, 600000); // 10 minutos (600.000 ms)
    };

    // Eventos que indicam atividade do usuário
    const events = ['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll'];

    // Atribui os listeners de evento apenas se houver usuário logado
    if (currentUser && window.location.pathname !== '/totem') {
      events.forEach(event => window.addEventListener(event, resetTimer));
      resetTimer(); // Inicia o contador logo de cara
    }

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [currentUser]);

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
  if (window.location.pathname === '/reset-password' || window.location.hash.includes('type=recovery')) {
    return <ResetPassword />;
  }

  if (window.location.pathname === '/totem') {
    return <TotemComingSoon />;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  // ──────── ROUTING GLOBAL ────────
  if (window.location.pathname === '/admin/totem-checkin') {
    if (currentUser.role !== 'admin') {
      window.location.href = '/';
      return null;
    }
    return (
      <AdminKioskFullscreen 
        currentUser={currentUser} 
        currentSchool={currentSchool} 
        students={students} 
        updateStudentStatus={updateStudentStatus} 
      />
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
          ) : currentUser.role === 'developer' ? (
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
