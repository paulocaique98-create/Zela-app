import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { parseShortTime } from '../utils/attendanceUtils';

// Mecanismo de tempo real do Monitor, reconstruído do zero (16/09) depois de
// dois incidentes reais em produção onde o canal Realtime da tabela
// `students` parava de entregar eventos silenciosamente, por dois motivos
// DIFERENTES: (1) canal fechado com status CLOSED sem reconectar sozinho, e
// (2) canal mostrando "conectado" e mesmo assim não entregando o evento de
// um reconhecimento facial real, com o Monitor já aberto. Caçar cada motivo
// de falha do Realtime um por um não é confiável a longo prazo — a resposta
// aqui é nunca depender 100% dele:
//
//   - Realtime continua sendo o caminho principal: alerta (modal + som) no
//     INSTANTE exato do reconhecimento, como a escola pediu.
//   - Uma reconciliação por polling roda em paralelo, mais agressiva (4s)
//     sempre que o canal não estiver certificado como conectado, e também
//     roda devagar (20s) mesmo quando ele parece conectado — cobre
//     justamente o pior dos dois incidentes reais (parece conectado, mas
//     não entrega nada, sem gerar nenhum aviso).
//   - Reautentica o Realtime explicitamente a cada renovação de token de
//     sessão, em vez de confiar só no comportamento automático da lib.
//
// O alerta e o polling só têm efeito prático pra quem tem lista de alunos
// pra monitorar (admin vê a escola inteira; família vê só os próprios
// filhos via RLS) — developer não usa nenhum dos dois.
export function useRealtimeMonitor({ currentUser, setStudents, adminTab }) {
  const [pendingAlert, setPendingAlert] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'degraded'

  const channelRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const fastPollTimerRef = useRef(null);
  const channelSuffixRef = useRef(Math.random().toString(36).substring(2, 8));
  // Chave "id:status:requester" já alertada — evita o mesmo alerta duplicado
  // quando o Realtime e o polling pegam a mesma transição quase ao mesmo tempo.
  const alertedRef = useRef(new Set());

  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const adminTabRef = useRef(adminTab);
  useEffect(() => { adminTabRef.current = adminTab; }, [adminTab]);

  const dismissAlert = useCallback(() => setPendingAlert(null), []);

  const formatStudent = (s) => ({
    id: s.id,
    name: s.name,
    familyId: s.family_id,
    status: s.status,
    contractedHours: s.contracted_hours,
    pendingRequesterId: s.pending_requester_id,
    todayRecord: {
      entry: parseShortTime(s.today_entry),
      exit: parseShortTime(s.today_exit),
      entry_full: s.today_entry || null,
      exit_full: s.today_exit || null,
      entry_at: s.today_entry_at || null,
      exit_at: s.today_exit_at || null,
    },
  });

  // Dispara o alerta (modal + som — o som mora dentro do próprio
  // CheckinAlertModal) só quando o status É AGORA pending E era diferente
  // antes — nunca em re-broadcast do mesmo status. Reaproveitado tanto pelo
  // evento Realtime quanto pela reconciliação por polling.
  const maybeAlert = useCallback((row, previousStatus) => {
    if (currentUserRef.current?.role !== 'admin') return;
    if (adminTabRef.current === 'kiosk') return; // não se auto-alerta no próprio totem
    if (row.status !== 'pending_entry' && row.status !== 'pending_exit') return;
    if (previousStatus === row.status) return;

    const alertKey = `${row.id}:${row.status}:${row.pending_requester_id || ''}`;
    if (alertedRef.current.has(alertKey)) return;
    alertedRef.current.add(alertKey);
    if (alertedRef.current.size > 200) alertedRef.current.clear(); // não precisa lembrar pra sempre

    setPendingAlert({
      studentId: row.id,
      studentName: row.name,
      type: row.status === 'pending_entry' ? 'Check-in' : 'Check-out',
    });
  }, []);

  // Busca o estado real no banco AGORA e reconcilia com o estado local —
  // rede de segurança: se o Realtime perdeu algum evento (por qualquer
  // motivo, inclusive um que a gente ainda não viu), isso corrige sozinho
  // em poucos segundos, sem depender de F5. RLS já limita o que cada papel
  // enxerga (admin = escola inteira, família = só os próprios filhos).
  const reconcile = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user || user.role === 'developer' || !user.school_id) return;

    const { data, error } = await supabase
      .from('students')
      .select('id, name, family_id, status, contracted_hours, pending_requester_id, today_entry, today_exit, today_entry_at, today_exit_at')
      .eq('school_id', user.school_id);
    if (error || !data) return;

    setStudents((prev) => {
      const prevById = new Map(prev.map((s) => [s.id, s]));
      return data.map((row) => {
        maybeAlert(row, prevById.get(row.id)?.status);
        return formatStudent(row);
      });
    });
  }, [setStudents, maybeAlert]);

  const setupChannel = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const user = currentUserRef.current;
    if (!user || user.role === 'developer') return;

    setConnectionStatus('connecting');
    const channelName = `monitor-realtime-${user.id}-${channelSuffixRef.current}`;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        const user2 = currentUserRef.current;

        if (eventType === 'UPDATE') {
          setStudents((prev) => {
            if (!prev.some((s) => s.id === newRow.id)) return prev; // não é desta sessão
            return prev.map((s) => {
              if (s.id !== newRow.id) return s;
              const formatted = formatStudent(newRow);
              return { ...s, ...formatted, todayRecord: { ...s.todayRecord, ...formatted.todayRecord } };
            });
          });
          maybeAlert(newRow, oldRow?.status);
        } else if (eventType === 'INSERT') {
          if (user2?.role === 'family') {
            if (newRow?.family_id && newRow.family_id !== user2.id) return;
          } else if (newRow?.school_id && newRow.school_id !== user2?.school_id) {
            return;
          }
          setStudents((prev) => (prev.some((s) => s.id === newRow.id) ? prev : [...prev, formatStudent(newRow)]));
        } else if (eventType === 'DELETE') {
          setStudents((prev) => prev.filter((s) => s.id !== oldRow.id));
        }
      })
      .subscribe((status) => {
        if (channelRef.current !== channel) return; // callback tardio de um canal já substituído

        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          reconcile(); // cobre qualquer evento perdido entre a desconexão e esta reconexão
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('degraded');
          reconnectTimerRef.current = setTimeout(() => {
            if (currentUserRef.current && currentUserRef.current.role !== 'developer' && channelRef.current === channel) {
              setupChannel();
            }
          }, 5000);
        }
      });

    channelRef.current = channel;
  }, [setStudents, maybeAlert, reconcile]);

  // Ciclo de vida do canal — recria ao trocar de usuário/logout.
  useEffect(() => {
    if (!currentUser || currentUser.role === 'developer') {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setConnectionStatus('connecting');
      return;
    }
    setupChannel();
    reconcile();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Reconciliação lenta (20s) mesmo com o canal "conectado" — é justamente o
  // caso do incidente real onde o status mostrava SUBSCRIBED e mesmo assim
  // não entregava o evento.
  useEffect(() => {
    const interval = setInterval(() => reconcile(), 20000);
    return () => clearInterval(interval);
  }, [reconcile]);

  // Reconciliação rápida (4s) só enquanto o canal não estiver certificado
  // como conectado — deixa o Monitor "quase instantâneo" mesmo num período
  // de instabilidade, sem sobrecarregar o banco o tempo todo.
  useEffect(() => {
    if (connectionStatus === 'connected') return;
    fastPollTimerRef.current = setInterval(() => reconcile(), 4000);
    return () => clearInterval(fastPollTimerRef.current);
  }, [connectionStatus, reconcile]);

  // Reautentica o Realtime explicitamente a cada renovação de token —
  // achado real: um erro passageiro de refresh_token já coincidiu com o
  // canal caindo; isso é uma garantia extra além do comportamento
  // automático da biblioteca.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return { pendingAlert, dismissAlert, connectionStatus };
}
