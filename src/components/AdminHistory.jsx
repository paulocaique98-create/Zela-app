import React, { useState, useEffect, useRef } from 'react';
import { CalendarDays, Search, X, FileText, LogIn, LogOut, Pencil, SlidersHorizontal, CheckCircle2, RefreshCw } from 'lucide-react';
import { useSchoolConfig } from '../lib/schoolConfig';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { agruparEventosPorDia, calcularHorasExtras, calcularCobrancaDoDia, getBrasiliaDateStr } from '../utils/attendanceUtils';
import { printHistoricoReport } from '../lib/printHistorico';
import { quemRegistrouDoLog } from '../lib/quemRegistrou';
import AttendanceEditTodayModal from './AttendanceEditTodayModal';
import AdminDailyPresence from './AdminDailyPresence';

function formatMinutes(mins) {
  if (mins === null || mins === undefined || mins < 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) {
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${m}min`;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('pt-BR');
}

export default function AdminHistory({ currentSchool, currentUser }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState(null); // { student, entryLog, exitLog, dateStr }
  // Filtro de turma e Atualizar da visão "Hoje" (a presença em si fica em
  // AdminDailyPresence; aqui só o estado, pra os botões ficarem na linha dos filtros).
  const { turmas: schoolTurmas } = useSchoolConfig(currentUser?.school_id);
  const [selectedTurma, setSelectedTurma] = useState('Todas as Turmas');
  const [turmaMenuOpen, setTurmaMenuOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [presenceLoading, setPresenceLoading] = useState(false);

  // Datas exibidas nos campos De/Até: as do atalho escolhido (Hoje/Semana/Mês)
  // ou as digitadas. Editar qualquer campo passa o período para "custom".
  const todayStr = getBrasiliaDateStr();
  const shownFrom = period === 'custom' ? customDate : period === 'today' ? todayStr
    : getBrasiliaDateStr(new Date(Date.now() - ((period === '7days' ? 7 : 30) - 1) * 86400000));
  const shownTo = period === 'custom' ? customEnd : todayStr;
  const pickDate = (which, value) => {
    const from = which === 'from' ? value : (shownFrom || value);
    const to = which === 'to' ? value : (shownTo || value);
    setCustomDate(from);
    setCustomEnd(to < from ? from : to);
    setPeriod(from === todayStr && to === todayStr ? 'today' : 'custom');
  };

  const fetchHistory = async () => {
    if (!currentSchool) return;
    setIsLoading(true);
    try {
      const schoolId = currentSchool.school_id || currentSchool.id;
      const todayISO = getBrasiliaDateStr();

      // Calcula intervalo de datas. Offset explícito (-03:00): sem ele, o
      // Postgres interpreta a string como UTC (fuso da sessão), então "00:00"
      // viraria 21h da noite anterior em Brasília — o intervalo do dia
      // ficaria deslocado (era por isso que "Hoje" aparecia vazio à noite).
      let startDate, endDate;
      if (period === 'today') {
        startDate = `${todayISO}T00:00:00-03:00`;
        endDate   = `${todayISO}T23:59:59-03:00`;
      } else if (period === 'custom' && customDate) {
        startDate = `${customDate}T00:00:00-03:00`;
        endDate   = `${customEnd && customEnd >= customDate ? customEnd : customDate}T23:59:59-03:00`;
      } else {
        const days = period === '7days' ? 7 : 30;
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        startDate = `${getBrasiliaDateStr(start)}T00:00:00-03:00`;
        endDate   = `${todayISO}T23:59:59-03:00`;
      }

      // buscarTodos junta as páginas de 1000 (teto do servidor): o par
      // entrada/saída de cada aluno vem completo, sem alunos cortados no fim.
      const rawLogs = await buscarTodos(() => supabase
        .from('attendance_logs')
        .select(`
          id,
          event_type,
          event_time,
          corrected,
          performed_by_name,
          student_id,
          students:student_id (name, turma, contracted_hours, contracted_entry_time, contracted_exit_time, weekly_schedule, isento_hora_extra, users:family_id(name))
        `)
        .eq('school_id', schoolId)
        .gte('event_time', startDate)
        .lte('event_time', endDate)
        .order('student_id')
        .order('event_time')
        .order('id'));

      // Utiliza a função extraída para agrupar 1 registro (primeiro entry, último exit) por dia por aluno
      const groupedLogs = agruparEventosPorDia(rawLogs);

      const result = groupedLogs.map(group => {
        const entryTime = group.entryLog ? new Date(group.entryLog.event_time) : null;
        const exitTime = group.exitLog ? new Date(group.exitLog.event_time) : null;

        // Excedente calculado sobre o HORÁRIO FIXO contratado de saída (não
        // compensa entrada atrasada) — mesma regra e mesma função usadas no
        // Relatório de Horas Extras, pra não ter duas verdades diferentes.
        // Modo geral da escola (billing_mode): entrada antecipada + saída tardia
        // somadas, com a tolerância geral. Individual segue como sempre foi.
        const calculo = currentSchool?.billing_config?.billing_mode === 'general'
          ? calcularCobrancaDoDia({
              entryIso: group.entryLog?.event_time || null,
              exitIso: group.exitLog?.event_time || null,
              contractedEntryTime: group.studentData?.contracted_entry_time,
              contractedExitTime: group.studentData?.contracted_exit_time,
              weeklySchedule: group.studentData?.weekly_schedule,
              billingConfig: currentSchool.billing_config,
              isentoHoraExtra: group.studentData?.isento_hora_extra,
            })
          : calcularHorasExtras(group.exitLog?.event_time || null, group.studentData?.contracted_exit_time, null, null, group.studentData?.isento_hora_extra);

        return {
          key: `${group.student_id}_${group.date}`,
          studentId: group.student_id,
          studentName: group.studentData?.name || '—',
          turma: group.studentData?.turma || '',
          family: group.studentData?.users?.name || '—',
          date: formatDate(group.entryLog?.event_time || group.exitLog?.event_time),
          dateStr: group.date, // "YYYY-MM-DD" (Brasília) -- ver AttendanceEditTodayModal
          entry: entryTime ? formatTime(entryTime.toISOString()) : null,
          exit: exitTime ? formatTime(exitTime.toISOString()) : null,
          entryCorrected: !!group.entryLog?.corrected,
          exitCorrected: !!group.exitLog?.corrected,
          // Quem de fato reconheceu (facial ou PIN) -- só existe pra
          // registros feitos a partir da captura desse dado (ver App.jsx >
          // updateStudentStatus); registros antigos ficam null, e a tela
          // simplesmente não mostra essa linha em vez de inventar algo.
          entryBy: group.entryLog?.performed_by_name || null,
          exitBy: group.exitLog?.performed_by_name || null,
          // Texto pronto (tela e PDF): nome, "Lançado pela escola" ou nada.
          entryQuem: quemRegistrouDoLog(group.entryLog),
          exitQuem: quemRegistrouDoLog(group.exitLog),
          contracted: `${group.studentData?.contracted_hours || 0}h`,
          duration: calculo.sem_saida ? null : 'saiu', // só usado como flag "já saiu?" na tela/PDF (=== null)
          overtime: !calculo.sem_saida && !calculo.dentro_tolerancia ? formatMinutes(calculo.minutos_excedentes) : null,
          rawTime: entryTime ? entryTime.getTime() : (exitTime ? exitTime.getTime() : 0),
          entryLogRaw: group.entryLog,
          exitLogRaw: group.exitLog,
          studentRaw: group.studentData,
        };
      });

      result.sort((a, b) => b.rawTime - a.rawTime || a.studentName.localeCompare(b.studentName));
      setLogs(result);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [currentSchool, period, customDate, customEnd]);

  const filtered = logs.filter(log => {
    const term = searchTerm.toLowerCase().trim();
    return !term || log.studentName.toLowerCase().includes(term) || log.family.toLowerCase().includes(term);
  });

  const PERIOD_LABELS = { today: 'Hoje', '7days': 'Semana', '30days': 'Mês' };
  const periodLabel = period === 'custom' && customDate
    ? (customEnd && customEnd > customDate
      ? `${formatDate(`${customDate}T00:00:00`)} a ${formatDate(`${customEnd}T00:00:00`)}`
      : formatDate(`${customDate}T00:00:00`))
    : (PERIOD_LABELS[period] || 'Período selecionado');

  // Coordenação e Direção não veem excedente de horário (dado de cobrança).
  const hideExcedente = currentUser?.role === 'gestao_pedagogica';
  const overCount = hideExcedente ? 0 : filtered.filter(log => !!log.overtime).length;

  const handleExport = () => {
    printHistoricoReport({
      records: hideExcedente ? filtered.map(r => ({ ...r, overtime: null })) : filtered,
      periodLabel,
      school: currentSchool,
    });
  };

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-2xl md:rounded-none shadow-none sm:shadow-sm md:shadow-none border-0 sm:border sm:border-outline-variant md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header -- título e ícone removidos (o Header do app já mostra o
          nome da tela dinamicamente); botões sempre na mesma linha (mesmo
          padrão do Relatório de Horas Extras, 17/09). */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 mb-3 shrink-0">
        <p className="hidden sm:block text-sm text-on-surface-variant min-w-0">Todos os registros individuais de entrada e saída</p>

        {/* ml-auto -- no mobile o <p> acima some (display:none), e sem isso
            justify-between com um filho só jogaria estes botões pra
            esquerda em vez de manter à direita. */}
        <div className="relative flex items-center gap-2 flex-wrap justify-end shrink-0 ml-auto">
          {period === 'today' && (<>
            <button
              onClick={() => setRefreshSignal(n => n + 1)}
              disabled={presenceLoading}
              className="flex items-center justify-center gap-2 text-sm font-bold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/40 px-3.5 py-2.5 rounded-xl transition disabled:opacity-50 shrink-0"
              title="Atualizar"
            >
              <RefreshCw size={15} className={presenceLoading ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Atualizar</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setTurmaMenuOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high border border-outline-variant px-3.5 py-2.5 rounded-xl transition"
              >
                <SlidersHorizontal size={15} />
                <span className="hidden sm:inline">{selectedTurma}</span>
              </button>
              {turmaMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setTurmaMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 max-w-[85vw] bg-white border border-outline-variant rounded-2xl shadow-lg z-20 p-1.5">
                    {['Todas as Turmas', ...schoolTurmas].map(t => (
                      <button
                        key={t}
                        onClick={() => { setSelectedTurma(t); setTurmaMenuOpen(false); }}
                        className={`w-full px-3 py-2 rounded-xl text-sm font-bold text-left truncate transition ${
                          selectedTurma === t ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>)}
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant/70">
            De:
            <input
              type="date"
              value={shownFrom || ''}
              max={shownTo || todayStr}
              onChange={e => e.target.value && pickDate('from', e.target.value)}
              className="px-2 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant/70">
            Até:
            <input
              type="date"
              value={shownTo || ''}
              min={shownFrom || undefined}
              max={todayStr}
              onChange={e => e.target.value && pickDate('to', e.target.value)}
              className="px-2 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center justify-center gap-2 text-sm font-bold text-white bg-primary hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed px-3.5 sm:px-4 py-2.5 rounded-xl transition shadow-sm shrink-0"
          >
            <FileText size={16} /> <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Período "Hoje" = a antiga Presença do Dia (todos os alunos, grupos
          Presentes/Já saíram/Ausentes, filtro de turma e editar horário).
          Outros períodos seguem com a lista de registros abaixo. */}
      {period === 'today' && (
        <AdminDailyPresence embedded currentUser={currentUser} currentSchool={currentSchool} turma={selectedTurma} refreshSignal={refreshSignal} onLoadingChange={setPresenceLoading} />
      )}

      {period !== 'today' && (<>
      {/* Resumo -- vira uma frase, não mais uma linha de filtros grande
          (mesmo modelo "foco na lista" do Relatório de Horas Extras). */}
      <p className="text-sm text-on-surface-variant mb-4 shrink-0">
        {periodLabel}: <span className="font-bold text-on-surface">{filtered.length}</span> registro{filtered.length === 1 ? '' : 's'}
        {overCount > 0 && <> · <span className="font-bold text-error">{overCount}</span> com excedente</>}.
      </p>

      {/* Busca */}
      <div className="relative mb-4 sm:mb-6 shrink-0">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-on-surface-variant/70" />
        </div>
        <input
          type="text"
          placeholder="Buscar por aluno ou responsável..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-8 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant/70 hover:text-on-surface-variant">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Resultado por aluno -- cards ao invés de tabela, cada evento
          (entrada/saída) mostrando quem de fato fez o reconhecimento no
          totem, não um "responsável" fixo (modelo validado com o usuário,
          proposta com 3 layouts, 17/09). */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-surface-container-low rounded-2xl border border-dashed border-outline-variant">
            <CalendarDays className="h-10 w-10 text-on-surface-variant/50 mb-3" />
            <p className="text-on-surface-variant font-medium text-sm">Nenhum registro encontrado para este período.</p>
            <p className="text-on-surface-variant/70 text-xs mt-1">Os registros aparecem após o check-in ser confirmado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4 items-start">
            {filtered.map(log => {
              const initials = log.studentName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
              return (
                <div key={log.key} className="px-3 py-2.5 rounded-xl border border-outline-variant bg-white shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
                      {initials}
                    </div>
                    <p className="font-bold text-on-surface text-sm min-w-0 break-words">{log.studentName}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                    <p className="text-xs text-on-surface-variant/70 min-w-0 break-words">{log.date} · ciclo {log.contracted}</p>
                    {log.duration === null ? (
                      <span className="text-[11px] font-bold px-2 py-1 rounded-sm bg-brass-50 text-warning border border-warning/40 shrink-0">Na Escola</span>
                    ) : hideExcedente ? null : log.overtime ? (
                      <span className="text-[11px] font-bold px-2 py-1 rounded-sm whitespace-nowrap bg-error/15 text-error shrink-0">+{log.overtime}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-sm whitespace-nowrap bg-success/15 text-success shrink-0">
                        <CheckCircle2 size={11} /> No prazo
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-dashed border-outline-variant flex items-end justify-between gap-2">
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-2 min-w-0">
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 font-bold text-primary text-sm flex-wrap">
                          <LogIn size={13} className="shrink-0" /> {log.entry || <span className="text-on-surface-variant/50">—</span>}
                          {log.entryCorrected && (
                            <span className="text-[11px] font-bold text-warning bg-brass-50 px-1 py-0.5 rounded">Ajustado</span>
                          )}
                        </span>
                        {log.entryQuem && <p className="text-[11px] text-on-surface-variant/70 mt-0.5 break-words">{log.entryQuem}</p>}
                      </div>

                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 font-bold text-error text-sm flex-wrap">
                          <LogOut size={13} className="shrink-0" /> {log.exit || <span className="text-on-surface-variant/50">—</span>}
                          {log.exitCorrected && (
                            <span className="text-[11px] font-bold text-warning bg-brass-50 px-1 py-0.5 rounded">Ajustado</span>
                          )}
                        </span>
                        {log.exitQuem && <p className="text-[11px] text-on-surface-variant/70 mt-0.5 break-words">{log.exitQuem}</p>}
                      </div>
                    </div>

                    {/* Botão único -- substitui os dois lápis separados de
                        Entrada/Saída (mesmo padrão da Presença Diária). Abre
                        um modal só, com os dois horários DAQUELE DIA juntos
                        (ver AttendanceEditTodayModal > targetDateStr). */}
                    <button
                      onClick={() => setCorrectionTarget({ student: log.studentRaw, entryLog: log.entryLogRaw, exitLog: log.exitLogRaw, dateStr: log.dateStr })}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/40 px-2.5 py-1.5 rounded-lg transition shrink-0"
                      title="Editar horário de entrada e/ou saída deste dia"
                    >
                      <Pencil size={12} /> Editar horário
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}

      {correctionTarget && (
        <AttendanceEditTodayModal
          student={correctionTarget.student}
          entryLog={correctionTarget.entryLog}
          exitLog={correctionTarget.exitLog}
          targetDateStr={correctionTarget.dateStr}
          currentUser={currentUser}
          billingConfig={currentSchool?.billing_config}
          onClose={() => setCorrectionTarget(null)}
          onSaved={() => { setCorrectionTarget(null); fetchHistory(); }}
        />
      )}
    </div>
  );
}


