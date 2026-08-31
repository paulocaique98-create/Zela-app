import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { setErrorLogContext } from './lib/errorLogger';
import Header from './components/Header';
import LoadingLogo from './components/LoadingLogo';
import AuthModal from './components/AuthModal';
import { supabase } from './lib/supabase';
import { uploadAuthorizedPersonPhoto, removeAuthorizedPersonPhoto, getAuthorizedPersonPhotoSignedUrl, getAuthorizedPersonPhotoSignedUrls } from './lib/storage';

const Login = lazy(() => import('./components/Login'));
const FamilyPortal = lazy(() => import('./components/FamilyPortal'));
const AdminPortal = lazy(() => import('./components/AdminPortal'));
const TeacherPortal = lazy(() => import('./components/TeacherPortal'));
const DeveloperLayout = lazy(() => import('./components/DeveloperLayout'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));
const SelfRegister = lazy(() => import('./components/SelfRegister'));

// Helper para obter a data (YYYY-MM-DD) no fuso de Brasília, independente do fuso
// do dispositivo/servidor. Usar toISOString() aqui pegaria a data em UTC, que já
// está "amanhã" entre ~21h e 23h59 no horário de Brasília (UTC-3).
const getBrasiliaDateStr = (date = new Date()) =>
  date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Mesmo limiar (MATCH_THRESHOLD) usado no reconhecimento ao vivo
// (AdminFaceScanner) — se duas biometrias ficam mais parecidas que isso,
// abaixo desse valor o próprio reconhecimento já as trataria como a mesma
// pessoa, então não faz sentido permitir cadastrar as duas.
const FACE_DUPLICATE_THRESHOLD = 0.45;

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

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
  const [teacherTab, setTeacherTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', relation: 'Outro', emergencyOrder: '', isTemporary: false, temporaryUntil: '' });
  const [authError, setAuthError] = useState('');

  // Emergency State
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyData, setEmergencyData] = useState(null);

  // Alerta de check-in/check-out pendente para o Admin
  // { studentName, type: 'Check-in'|'Check-out', studentId }
  const [pendingAlert, setPendingAlert] = useState(null);

  const [currentSchool, setCurrentSchool] = useState(() => {
    // Só confia na escola em cache se ela pertencer ao mesmo usuário em cache —
    // evita mostrar a logo de outra escola (ex: dispositivo compartilhado, troca
    // de conta) por um instante antes do fetchData corrigir.
    const savedSchool = localStorage.getItem('zela_school');
    const savedUser = localStorage.getItem('zela_user');
    if (!savedSchool || !savedUser) return null;
    try {
      const school = JSON.parse(savedSchool);
      const user = JSON.parse(savedUser);
      return school.id === user.school_id ? school : null;
    } catch {
      return null;
    }
  });
  const [globalLogo, setGlobalLogo] = useState(null);

  // Ref para o canal Realtime — permite cancelar quando o usuário deslogar
  const realtimeChannelRef = useRef(null);
  const emergencyChannelRef = useRef(null);
  // Ref para controle do auto-reconnect (evita múltiplos timeouts simultâneos)
  const reconnectTimerRef = useRef(null);

  // Ref estável para currentUser — evita closures desatualizadas em listeners de longa duração
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Ref estável para adminTab — usada para não disparar o alerta de "Nova
  // Solicitação" no próprio dispositivo que está com a tela de Autoatendimento
  // aberta (ele mesmo acabou de gerar o check-in/check-out, não precisa se
  // avisar); os demais dispositivos logados como admin continuam recebendo.
  const adminTabRef = useRef(adminTab);
  useEffect(() => {
    adminTabRef.current = adminTab;
  }, [adminTab]);

  // Desbloqueio de áudio: navegadores exigem um gesto do usuário antes de tocar áudio.
  // Registramos um listener de clique que resume o AudioContext na primeira interação.
  useEffect(() => {
    const unlockAudio = () => {
      if (!window._zelaAudioUnlocked) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          ctx.resume();
          window._zelaAudioUnlocked = true;
          console.info('[Zela] Audio context desbloqueado.');
        } catch {
          // AudioContext não suportado no browser — silent fail
        }
      }
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

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

  // Associa o usuário logado ao contexto de erro (client_error_logs) — não
  // exibido em lugar nenhum da UI, só ajuda a rastrear de qual conta/escola
  // um erro reportado veio, sem guardar dado sensível (nome/e-mail ficam de fora).
  useEffect(() => {
    setErrorLogContext(currentUser);
  }, [currentUser?.id, currentUser?.role, currentUser?.school_id]);

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
      if (emergencyChannelRef.current) {
        supabase.removeChannel(emergencyChannelRef.current);
        emergencyChannelRef.current = null;
      }
    }
  }, [currentUser?.id]); // Depende apenas do ID (primitivo estável) — evita recriar o canal ao reatribuir o objeto currentUser

  // Sufixo estável por sessão — evita recriar o canal desnecessariamente a cada render
  const channelSuffixRef = useRef(Math.random().toString(36).substring(2, 8));

  const setupRealtime = () => {
    // Cancela qualquer reconexão pendente antes de configurar novo canal
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
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
        pendingRequesterId: s.pending_requester_id,
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

          // ── Disparo do alerta de check-in/check-out pendente ──
          // Só dispara para admins, apenas quando há mudança real de status
          // para pending_entry ou pending_exit (não em re-broadcasts do mesmo status).
          if (
            currentUserRef.current?.role === 'admin' &&
            adminTabRef.current !== 'kiosk' &&
            (newRow?.status === 'pending_entry' || newRow?.status === 'pending_exit') &&
            oldRow?.status !== newRow?.status
          ) {
            setPendingAlert({
              studentId: newRow.id,
              studentName: newRow.name,
              type: newRow.status === 'pending_entry' ? 'Check-in' : 'Check-out',
            });
          }

        } else if (eventType === 'INSERT') {
          // Para INSERT: filtrar por school_id/family_id se vierem no payload
          if (currentUserRef.current?.role === 'family') {
            if (newRow?.family_id && newRow.family_id !== currentUserRef.current.id) return;
          } else {
            if (newRow?.school_id && newRow.school_id !== currentUserRef.current?.school_id) return;
          }
          console.debug('[Zela] Realtime evento recebido:', eventType, newRow?.id);
          setStudents((prev) => [...prev, formatStudent(newRow)]);

        } else if (eventType === 'DELETE') {
          setStudents((prev) => prev.filter((s) => s.id !== oldRow.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Zela] Realtime conectado com sucesso.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Zela] Realtime desconectado: ${status}. Reconectando em 5s...`);
          // Auto-reconnect: aguarda 5s e tenta reestabelecer o canal
          reconnectTimerRef.current = setTimeout(() => {
            const user = currentUserRef.current;
            if (user && user.role !== 'developer') {
              console.info('[Zela] Tentando reconectar ao Realtime...');
              setupRealtime();
            }
          }, 5000);
        } else if (status === 'CLOSED') {
          console.warn('[Zela] Realtime canal fechado.');
        }
      });

    realtimeChannelRef.current = channel;

    // Canal compartilhado por escola — todos os usuários da mesma escola entram
    // no mesmo tópico, ao contrário do canal acima (privado por usuário/sessão).
    // O alerta de emergência precisa ser ouvido por todos, não só por quem o disparou.
    if (emergencyChannelRef.current) {
      supabase.removeChannel(emergencyChannelRef.current);
      emergencyChannelRef.current = null;
    }
    if (currentUser.school_id) {
      const emergencyChannel = supabase
        .channel(`emergency-${currentUser.school_id}`)
        .on('broadcast', { event: 'emergency_alert' }, (payload) => {
          setEmergencyData(payload.payload);
          setIsEmergency(true);
        })
        .subscribe();
      emergencyChannelRef.current = emergencyChannel;
    }
  };

  const fetchData = async () => {
    console.info('[Zela] Carregando dados da escola e alunos...');
    setIsLoading(true);
    try {
      let schoolPromise = Promise.resolve({ data: null });
      if (currentUser.school_id) {
        // Envolve o builder do Supabase (que re-executa a query a cada
        // .then() chamado) numa Promise real, executada uma única vez, para
        // poder aplicar a logo assim que chegar sem esperar as consultas de
        // alunos/autorizados — evita o ícone genérico da Zela aparecer por
        // um instante antes da logo real da escola.
        schoolPromise = (async () => {
          const res = await supabase
            .from('schools')
            .select('*')
            .eq('id', currentUser.school_id)
            .single();
          if (res.data) {
            setCurrentSchool(res.data);
            localStorage.setItem('zela_school', JSON.stringify(res.data));
          }
          return res;
        })();
      }

      let studentsQuery = supabase.from('students').select('*').eq('school_id', currentUser.school_id);
      let authQuery = supabase
        .from('authorized_persons')
        .select('id, name, relation, has_photo, photo_storage_path, face_descriptor, status, emergency_order, temporary_until, family_id')
        .eq('school_id', currentUser.school_id);

      if (currentUser.role === 'family') {
        const { data: guardianLinks } = await supabase
          .from('student_guardians')
          .select('student_id')
          .eq('guardian_id', currentUser.id);

        let studentIds = guardianLinks?.map(l => l.student_id) || [];

        // Fallback: se student_guardians vazio, tentar family_id
        if (studentIds.length === 0) {
          const { data: directStudents } = await supabase
            .from('students')
            .select('id')
            .eq('family_id', currentUser.id)
            .eq('school_id', currentUser.school_id);
          studentIds = directStudents?.map(s => s.id) || [];
        }

        if (studentIds.length === 0) {
          // Nenhum aluno encontrado (nem via guardianLinks, nem fallback)
          studentsQuery = studentsQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
          authQuery = authQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
        } else {
          studentsQuery = studentsQuery.in('id', studentIds);

          authQuery = authQuery.eq('family_id', currentUser.id);
        }
      }

      const [schoolRes, studentsRes, authRes] = await Promise.all([
        schoolPromise,
        studentsQuery,
        authQuery
      ]);

      if (schoolRes.data) {
        setCurrentSchool(schoolRes.data);
        localStorage.setItem('zela_school', JSON.stringify(schoolRes.data));
      }
      const studentsData = studentsRes.data;
      const authData = authRes.data;

      const todayDate = getBrasiliaDateStr();

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
          supabase.from('students').update({ status: 'idle', today_entry: null, today_exit: null }).eq('id', s.id)
            .then(({ error }) => {
              if (error) console.error('[Zela] Falha ao resetar status do aluno para idle:', s.id, error);
            });
        }

        return {
          id: s.id,
          name: s.name,
          familyId: s.family_id,
          status: sStatus,
          contractedHours: s.contracted_hours,
          pendingRequesterId: s.pending_requester_id,
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
      // Foto vem exclusivamente do Storage via signed URL. Busca em LOTE
      // (uma chamada só, não uma por pessoa) pra não virar N+1 na tela que
      // mais gente carrega no login. Sem photo_storage_path = sem foto
      // (placeholder), sem fallback pra Base64 legado.
      const pathsToResolve = (authData || []).map(a => a.photo_storage_path).filter(Boolean);
      const signedUrlByPath = pathsToResolve.length > 0
        ? await getAuthorizedPersonPhotoSignedUrls(pathsToResolve).catch(() => new Map())
        : new Map();

      const formattedAuth = (authData || []).map(a => ({
        id: a.id,
        name: a.name,
        relation: a.relation,
        hasPhoto: a.has_photo,
        photo_url: a.photo_storage_path ? (signedUrlByPath.get(a.photo_storage_path) || null) : null,
        photo_storage_path: a.photo_storage_path,
        has_biometrics: a.face_descriptor != null,
        status: a.status,
        emergencyOrder: a.emergency_order,
        temporaryUntil: a.temporary_until,
        family_id: a.family_id
      }));
      setAuthorized(formattedAuth);

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (user) => {
    // Se a escola em cache não é a desse usuário (ex: troca de conta no mesmo
    // navegador), descarta antes que o LoadingLogo chegue a exibir a logo errada.
    if (currentSchool && currentSchool.id !== user.school_id) {
      setCurrentSchool(null);
      localStorage.removeItem('zela_school');
    }
    setCurrentUser(user);
    localStorage.setItem('zela_user', JSON.stringify(user));
    setFamilyTab('home');
    // Preload dos modelos de IA (~12,6MB) NÃO acontece mais aqui — família e
    // professor nunca usam reconhecimento facial, e o Admin já pré-carrega
    // sozinho ao montar o painel (AdminPortal.jsx), só quando o módulo de
    // check-in está habilitado para a escola.
  };

  const handleLogout = () => {
    setCurrentUser(null);
    // currentSchool NÃO é limpo aqui de propósito: se o próximo login for da
    // mesma escola (comum — trocar entre conta admin/família, ou logar de novo),
    // a logo já fica disponível na hora, sem cair no ícone genérico da Zela
    // enquanto os dados carregam. handleLogin já valida e descarta esse cache
    // se o próximo usuário for de uma escola diferente.
    setStudents([]);
    setAuthorized([]);
    localStorage.removeItem('zela_user');
    // Faz o logoff do Auth Supabase por garantia
    supabase.auth.signOut().catch(() => { });
  };

  // Temporizador de inatividade (10 minutos)
  useEffect(() => {
    let inactivityTimer;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      if (!currentUser) return;

      inactivityTimer = setTimeout(() => {
        handleLogout();
        // Reload intencional após inatividade — limpa todo o estado do app
        window.location.reload();
      }, 600000); // 10 minutos (600.000 ms)
    };

    // Eventos que indicam atividade do usuário
    const events = ['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll'];

    if (currentUser) {
      events.forEach(event => window.addEventListener(event, resetTimer));
      resetTimer(); // Inicia o contador logo de cara
    }

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [currentUser, currentPath]);

  const togglePhoto = async (id, photoUrl = null, descriptorArray = null, consentGiven = false) => {
    // Antes de gravar uma biometria nova, garante que esse rosto ainda não
    // está cadastrado em OUTRO responsável da mesma escola — foi o que
    // causou a Hanaynna Schmitz ficar irreconhecível: ela tinha duas
    // biometrias cadastradas (uma em cada conta de família), e o
    // reconhecimento ao vivo rejeita como "desconhecido" quando dois
    // cadastros diferentes batem quase igual com o rosto capturado.
    // Fica FORA do try/catch abaixo de propósito: precisa propagar o erro
    // pro caller mostrar o aviso, não ser engolido silenciosamente.
    if (photoUrl && descriptorArray) {
      const { data: existing, error: existingError } = await supabase
        .from('authorized_persons')
        .select('id, name, face_descriptor')
        .eq('school_id', currentUser.school_id)
        .neq('id', id)
        .not('face_descriptor', 'is', null);

      if (!existingError) {
        const duplicate = (existing || []).find(p => {
          try {
            const stored = typeof p.face_descriptor === 'string' ? JSON.parse(p.face_descriptor) : p.face_descriptor;
            return euclideanDistance(descriptorArray, stored) < FACE_DUPLICATE_THRESHOLD;
          } catch {
            return false;
          }
        });
        if (duplicate) {
          throw new Error(`Este rosto já está cadastrado para "${duplicate.name.trim()}". Cada pessoa só pode ter uma biometria cadastrada no sistema — remova o cadastro duplicado antes de tentar novamente.`);
        }
      }
    }

    try {
      const updates = { has_photo: !!photoUrl };

      // Foto nova → vai pro Storage. photo_storage_path é o único campo
      // usado pra referenciar a foto — a coluna legada photo_url não é
      // mais lida nem escrita pelo código.
      if (photoUrl) {
        try {
          const path = await uploadAuthorizedPersonPhoto(currentUser.school_id, id, photoUrl);
          updates.photo_storage_path = path;
        } catch (uploadErr) {
          console.error('Erro ao enviar foto pro Storage:', uploadErr);
          throw new Error('Não foi possível salvar a foto. Tente novamente.');
        }
      } else {
        // Remoção explícita (chamada com photoUrl=null). Se a pessoa tinha
        // um arquivo no Storage, remove primeiro — só zera a referência no
        // banco depois de confirmar.
        const current = authorized.find(p => p.id === id);
        if (current?.photo_storage_path) {
          try {
            await removeAuthorizedPersonPhoto(current.photo_storage_path);
          } catch (removeErr) {
            // Não bloqueia a remoção do cadastro por causa disso — só
            // registra; pior caso é um arquivo órfão no bucket, não uma
            // inconsistência visível pro usuário.
            console.error('Erro ao remover arquivo do Storage (arquivo pode ter ficado órfão):', removeErr);
          }
        }
        updates.photo_storage_path = null;
      }

      if (descriptorArray) {
        updates.face_descriptor = JSON.stringify(descriptorArray);
      } else {
        updates.face_descriptor = null;
      }

      // Registro do consentimento LGPD — só grava a data na primeira vez que a
      // pessoa (ou quem a representa) autoriza o uso da biometria; remover a
      // foto não apaga esse histórico, é só a marca de que já foi autorizado.
      if (photoUrl && descriptorArray && consentGiven) {
        updates.biometric_consent_at = new Date().toISOString();
      }

      const { error } = await supabase.from('authorized_persons').update(updates).eq('id', id);
      if (error) {
        // Upload já confirmado, mas o UPDATE falhou — tenta desfazer o
        // upload pra não deixar arquivo órfão nem estado divergente entre
        // Storage e banco (ver regra de atomicidade).
        if (updates.photo_storage_path) {
          removeAuthorizedPersonPhoto(updates.photo_storage_path).catch(() => {});
        }
        throw new Error('Não foi possível salvar as alterações. Tente novamente.');
      }

      const resolvedPhotoUrl = updates.photo_storage_path
        ? await getAuthorizedPersonPhotoSignedUrl(updates.photo_storage_path).catch(() => null)
        : null;

      setAuthorized(prev => prev.map(p => p.id === id ? {
        ...p,
        hasPhoto: !!photoUrl,
        has_biometrics: !!descriptorArray,
        photo_storage_path: updates.photo_storage_path,
        photo_url: resolvedPhotoUrl,
      } : p));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  // Exclui o cadastro de Autorizado por completo (não só a foto) — a
  // família pediu autonomia pra remover entradas erradas/de teste sem
  // depender do Admin.
  const deleteAuthorized = async (id) => {
    const { error } = await supabase.from('authorized_persons').delete().eq('id', id);
    if (error) throw error;
    setAuthorized(prev => prev.filter(p => p.id !== id));
  };

  const handleSaveAuth = async (newPerson) => {
    setAuthError('');
    try {
      // Não deixa cadastrar um "Autorizado" com o mesmo nome de OUTRO
      // responsável que já tem login próprio (2º Responsável) vinculado aos
      // mesmos alunos — ele precisa cadastrar a própria biometria pela
      // conta dele em Autorizados, senão duas entradas pro mesmo rosto
      // travam o reconhecimento por ambiguidade (ver caso Hanaynna Schmitz).
      // O autocadastro (responsável adicionando A SI MESMO) continua
      // permitido de propósito — é o mecanismo já usado hoje por várias
      // famílias pra fazer o próprio check-in por reconhecimento facial.
      const nameTrim = newPerson.name.trim().toLowerCase();

      const studentIds = (students || []).map(s => s.id).filter(Boolean);
      if (studentIds.length > 0) {
        const { data: guardianLinks } = await supabase
          .from('student_guardians')
          .select('guardian_id')
          .in('student_id', studentIds)
          .neq('guardian_id', currentUser.id);

        const otherGuardianIds = [...new Set((guardianLinks || []).map(g => g.guardian_id))];
        if (otherGuardianIds.length > 0) {
          const { data: otherGuardians } = await supabase
            .from('users')
            .select('id, name')
            .in('id', otherGuardianIds);

          const conflictingGuardian = (otherGuardians || []).find(g => g.name.trim().toLowerCase() === nameTrim);
          if (conflictingGuardian) {
            setAuthError(`"${newPerson.name}" já é o 2º Responsável cadastrado no sistema, com login próprio. Ele(a) mesmo(a) precisa cadastrar a biometria em Autorizados usando a própria conta — não é necessário adicioná-lo(a) aqui.`);
            return;
          }
        }
      }

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

      if (error) {
        setAuthError('Erro ao cadastrar autorizado. Tente novamente.');
        return;
      }

      if (data && data.length > 0) {
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
      setAuthError('Erro ao cadastrar autorizado. Tente novamente.');
      return;
    }

    setIsAuthModalOpen(false);
    setAuthForm({ name: '', relation: 'Outro', emergencyOrder: '', isTemporary: false, temporaryUntil: '' });
  };

  const updateStudentStatus = async (studentId, newStatus, requesterId = null) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const now = new Date();
    const nowStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = getBrasiliaDateStr(now);
    const fullRecordStr = `${dateStr}|${nowStr}`;

    // Determina o tipo de evento para o log
    const isRequestEntry = newStatus === 'pending_entry';
    const isRequestExit = newStatus === 'pending_exit';
    const isConfirmEntry = newStatus === 'in_school';
    const isConfirmExit = newStatus === 'left';

    try {
      // 1. Atualiza o status atual do aluno na tabela students
      let studentUpdates = { status: newStatus };

      // Guarda quem solicitou (pra foto no Monitor) ao entrar em pending, e
      // limpa assim que a solicitação é resolvida (confirmada).
      if (isRequestEntry || isRequestExit) {
        studentUpdates.pending_requester_id = requesterId;
      } else if (isConfirmEntry || isConfirmExit) {
        studentUpdates.pending_requester_id = null;
      }

      // Grava o horário exato da solicitação pelo pai/totem (ou direto pelo admin se não havia solicitação)
      let usedEntryStr = student.todayRecord.entry_full;
      let usedExitStr = student.todayRecord.exit_full;

      // Só reaproveita o horário já gravado quando esta confirmação vem de uma
      // solicitação pendente (pending_entry/pending_exit) — aí o horário certo
      // é o do momento da solicitação, não o do clique de confirmação. Uma
      // confirmação DIRETA (ex: botão "Registrar Saída" da Família, que pula a
      // etapa de pendência) precisa sempre gravar o horário atual: usar
      // "já existe um horário salvo" como critério fazia o 2º check-in/check-out
      // do mesmo dia (ex: saiu e voltou) ser silenciosamente ignorado, porque o
      // campo já tinha um valor de um ciclo anterior daquele mesmo dia.
      const wasPendingEntry = student.status === 'pending_entry';
      const wasPendingExit = student.status === 'pending_exit';

      if (isRequestEntry || (isConfirmEntry && !wasPendingEntry)) {
        studentUpdates.today_entry = fullRecordStr;
        studentUpdates.today_exit = null;
        usedEntryStr = fullRecordStr;
        usedExitStr = null;
      } else if (isRequestExit || (isConfirmExit && !wasPendingExit)) {
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
        if (logError) console.error('Erro ao registrar log de presença:', logError);
      }

      // 3. Atualiza estado local do React
      setStudents(prev => prev.map(s => {
        if (s.id !== studentId) return s;
        return {
          ...s,
          status: newStatus,
          pendingRequesterId: (isRequestEntry || isRequestExit) ? requesterId : (isConfirmEntry || isConfirmExit) ? null : s.pendingRequesterId,
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

  /**
   * rejectStudentStatus — Rejeita/cancela uma solicitação pendente SEM gravar no attendance_logs.
   * 
   * É diferente de updateStudentStatus, que grava log quando o status muda para 'in_school' ou 'left'.
   * Esta função é usada exclusivamente pelo botão "Cancelar Solicitação" do Monitor.
   *
   * pending_entry  → idle      (aluno nunca chegou — cancela entrada)
   * pending_exit   → in_school (aluno continua na escola — cancela saída)
   */
  const rejectStudentStatus = async (studentId, revertToStatus) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ status: revertToStatus, pending_requester_id: null })
        .eq('id', studentId);
      if (error) throw error;

      // Atualiza apenas o status no estado local — preserva todayRecord intacto
      setStudents(prev => prev.map(s =>
        s.id === studentId ? { ...s, status: revertToStatus, pendingRequesterId: null } : s
      ));
    } catch (err) {
      console.error('[Zela] Erro ao rejeitar solicitação:', err);
      throw err;
    }
  };

  // P2.2 (achado da auditoria): calcular a transição a partir do `status`
  // guardado no state em memória (populado via Realtime, que pode
  // atrasar) e escrever sem nenhuma condição fazia dois totens em
  // sequência rápida (ou um totem + o Monitor confirmando ao mesmo
  // tempo) conseguirem calcular a MESMA transição a partir de um estado
  // já ultrapassado — ex: aluno já virou 'in_school' num totem, mas o
  // segundo totem ainda via 'idle' na memória e reenviava 'pending_entry'
  // por cima. Fix: UPDATE condicional (`.eq('status', ...)` no valor que
  // foi lido) + `.select('id')` pra saber se realmente aplicou; se 0
  // linhas afetadas, reconsulta o status real no banco e recalcula a
  // transição em cima do valor atual antes de tentar de novo (1 retry).
  const computeKioskTransition = (currentStatus) => {
    if (['idle', 'left', 'absent'].includes(currentStatus)) return 'pending_entry';
    if (currentStatus === 'in_school') return 'pending_exit';
    return currentStatus;
  };

  const requestKioskAccess = async (studentIds, requesterId = null) => {
    if (!studentIds || studentIds.length === 0) return;
    for (const studentId of studentIds) {
      const student = students.find(s => s.id === studentId);
      if (!student) continue;

      let baseStatus = student.status;
      let newStatus = computeKioskTransition(baseStatus);

      if (newStatus !== baseStatus) {
        // Transição normal: novo status diferente do atual — UPDATE
        // condicional ao status lido, com 1 retry contra o valor real do
        // banco se outro totem/sessão já tiver mudado o status entre a
        // leitura e a escrita.
        let { data: updated, error } = await supabase
          .from('students')
          .update({ status: newStatus, pending_requester_id: requesterId })
          .eq('id', studentId)
          .eq('status', baseStatus)
          .select('id');

        if (error) {
          console.error('Erro ao atualizar status do aluno:', error);
          throw new Error(error.message);
        }

        if (!updated || updated.length === 0) {
          // Concorrência: o status mudou entre a leitura em memória e a
          // escrita. Reconsulta o valor real e recalcula em cima dele.
          const { data: freshStudent, error: freshError } = await supabase
            .from('students')
            .select('status')
            .eq('id', studentId)
            .single();
          if (freshError || !freshStudent) {
            console.error('[Zela] Concorrência no check-in: não foi possível reconsultar o status atual:', freshError);
            continue;
          }
          baseStatus = freshStudent.status;
          newStatus = computeKioskTransition(baseStatus);
          if (newStatus === baseStatus) {
            // O estado real já não permite mais essa transição (ex: outro
            // totem já resolveu a solicitação) — nada a fazer.
            console.info('[Zela] Concorrência no check-in: transição já não é mais válida pro status atual, ignorando.', studentId);
            continue;
          }
          const retry = await supabase
            .from('students')
            .update({ status: newStatus, pending_requester_id: requesterId })
            .eq('id', studentId)
            .eq('status', baseStatus)
            .select('id');
          if (retry.error) {
            console.error('Erro ao atualizar status do aluno (retry):', retry.error);
            throw new Error(retry.error.message);
          }
          if (!retry.data || retry.data.length === 0) {
            // Colisão dupla (extremamente raro) — desiste desta iteração
            // em vez de sobrescrever um estado que já mudou de novo.
            console.warn('[Zela] Concorrência no check-in: 2ª colisão seguida, desistindo desta tentativa.', studentId);
            continue;
          }
        }

        await updateStudentStatus(studentId, newStatus, requesterId);

      } else if (newStatus === 'pending_entry' || newStatus === 'pending_exit') {
        // Aluno já está no status pending: re-disparar o evento Realtime
        // fazendo um UPDATE no banco sem mudar o status (atualiza today_entry
        // para notificar o monitor que pode ter perdido o evento anterior).
        const timestampField = newStatus === 'pending_entry' ? 'today_entry' : 'today_exit';
        const now = new Date();
        const nowStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = getBrasiliaDateStr(now);
        const fullRecordStr = `${dateStr}|${nowStr}`;

        await supabase
          .from('students')
          .update({ status: newStatus, [timestampField]: fullRecordStr, pending_requester_id: requesterId })
          .eq('id', studentId);
        // Nota: não lança erro aqui — é um re-envio, não uma operação crítica
        console.info('[Zela] Re-disparando notificação Realtime para aluno já em status pending:', studentId);
      }
    }
  };


  const triggerEmergency = async (data) => {
    if (emergencyChannelRef.current) {
      await emergencyChannelRef.current.send({
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

  if (currentPath === '/cadastro') {
    return <Suspense fallback={<div className="h-screen flex items-center justify-center">Carregando...</div>}><SelfRegister /></Suspense>;
  }

  if (!currentUser) {
    return <Suspense fallback={<div className="h-screen flex items-center justify-center">Carregando...</div>}><Login onLogin={handleLogin} /></Suspense>;
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
        onNavigateTab={setFamilyTab}
      />

      <main className="flex-1 overflow-hidden flex flex-col p-3 sm:p-4 md:p-6 lg:p-6">
        <div className="w-full h-full flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex justify-center items-center">
              <LoadingLogo logoUrl={currentSchool?.logo_url} size={120} />
            </div>
          ) : (
            <Suspense fallback={
              <div className="flex-1 flex justify-center items-center w-full">
                <LoadingLogo logoUrl={currentSchool?.logo_url} size={120} />
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
                  rejectStudentStatus={rejectStudentStatus}
                  requestKioskAccess={requestKioskAccess}
                  authorized={authorized}
                  togglePhoto={togglePhoto}
                  onUpdateSchool={fetchData}
                  isMobileMenuOpen={isMobileMenuOpen}
                  setIsMobileMenuOpen={setIsMobileMenuOpen}
                  onLogout={handleLogout}
                  pendingAlert={pendingAlert}
                  onDismissAlert={() => setPendingAlert(null)}
                  onGoToMonitor={() => { setPendingAlert(null); setAdminTab('monitor'); }}
                />
              ) : currentUser.role === 'teacher' ? (
                <TeacherPortal
                  currentUser={currentUser}
                  currentSchool={currentSchool}
                  students={students}
                  authorized={authorized}
                  teacherTab={teacherTab}
                  setTeacherTab={setTeacherTab}
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
                  deleteAuthorized={deleteAuthorized}
                  onOpenAuthModal={() => { setAuthError(''); setIsAuthModalOpen(true); }}
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
          error={authError}
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
