import React, { useState, useEffect, useRef } from 'react';
import { CalendarDays, Search, X, FileText, LogIn, LogOut, Pencil, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { agruparEventosPorDia, calcularHorasExtras, getBrasiliaDateStr } from '../utils/attendanceUtils';
import { printHistoricoReport } from '../lib/printHistorico';
import { quemRegistrouDoLog } from '../lib/quemRegistrou';
import AttendanceEditTodayModal from './AttendanceEditTodayModal';

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
  const [correctionTarget, setCorrectionTarget] = useState(null); // { student, entryLog, exitLog, dateStr }
  // Período fica escondido atrás desse painel -- mesmo modelo "foco na
  // lista" validado no Relatório de Horas Extras (17/09).
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(null);

  useEffect(() => {
    if (!showFilters) return;
    const handleClickOutside = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) setShowFilters(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

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
        endDate   = `${customDate}T23:59:59-03:00`;
      } else {
        const days = period === '7days' ? 7 : 30;
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        startDate = `${getBrasiliaDateStr(start)}T00:00:00-03:00`;
        endDate   = `${todayISO}T23:59:59-03:00`;
      }

      const { data: rawLogs, error } = await supabase
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
        // Sem paginação de verdade aqui de propósito: agruparEventosPorDia
        // precisa do par entrada/saída completo de cada aluno no período pra
        // combinar certo — uma página "no meio" cortaria um evento da sua
        // dupla. Já é limitado pelo período (hoje/7/30 dias); esse teto é só
        // uma rede de segurança pra uma escola muito grande em 30 dias não
        // travar o navegador com um payload gigante.
        .limit(20000);

      if (error) throw error;

      // Utiliza a função extraída para agrupar 1 registro (primeiro entry, último exit) por dia por aluno
      const groupedLogs = agruparEventosPorDia(rawLogs);

      const result = groupedLogs.map(group => {
        const entryTime = group.entryLog ? new Date(group.entryLog.event_time) : null;
        const exitTime = group.exitLog ? new Date(group.exitLog.event_time) : null;

        // Excedente calculado sobre o HORÁRIO FIXO contratado de saída (não
        // compensa entrada atrasada) — mesma regra e mesma função usadas no
        // Relatório de Horas Extras, pra não ter duas verdades diferentes.
        const calculo = calcularHorasExtras(group.exitLog?.event_time || null, group.studentData?.contracted_exit_time, null, null, group.studentData?.isento_hora_extra);

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

  useEffect(() => { fetchHistory(); }, [currentSchool, period, customDate]);

  const filtered = logs.filter(log => {
    const term = searchTerm.toLowerCase().trim();
    return !term || log.studentName.toLowerCase().includes(term) || log.family.toLowerCase().includes(term);
  });

  const PERIOD_LABELS = { today: 'Hoje', '7days': 'Semana', '30days': 'Mês' };
  const periodLabel = period === 'custom' && customDate
    ? formatDate(`${customDate}T00:00:00`)
    : (PERIOD_LABELS[period] || 'Período selecionado');

  const overCount = filtered.filter(log => !!log.overtime).length;

  const handleExport = () => {
    printHistoricoReport({
      records: filtered,
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
        <div className="relative flex items-center gap-2 shrink-0 ml-auto" ref={filtersRef}>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center justify-center gap-2 text-sm font-bold px-3.5 py-2.5 rounded-xl transition shadow-sm border ${
              showFilters ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-outline-variant hover:bg-surface-container-low'
            }`}
            title="Período"
          >
            <SlidersHorizontal size={16} />
          </button>

          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center justify-center gap-2 text-sm font-bold text-white bg-primary hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed px-3.5 sm:px-4 py-2.5 rounded-xl transition shadow-sm shrink-0"
          >
            <FileText size={16} /> <span className="hidden sm:inline">Exportar Relatório</span>
          </button>

          {showFilters && (
            <div className="absolute right-0 top-full mt-2 w-[21rem] max-w-[calc(100vw-2.5rem)] bg-white border border-outline-variant rounded-2xl shadow-lg p-3 z-20">
              <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5 px-1">Período</p>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {[
                  { id: 'today', label: 'Hoje' },
                  { id: '7days', label: 'Semana' },
                  { id: '30days', label: 'Mês' },
                  { id: 'custom', label: 'Editar' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      period === p.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  className="mt-2 w-full px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-xl text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </div>
          )}
        </div>
      </div>

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
          <div className="space-y-2 pb-4">
            {filtered.map(log => {
              const initials = log.studentName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
              return (
                <div key={log.key} className="p-3 sm:p-4 rounded-2xl border border-outline-variant bg-white shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
                      {initials}
                    </div>
                    <p className="font-bold text-on-surface text-sm min-w-0 break-words">{log.studentName}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                    <p className="text-xs text-on-surface-variant/70 min-w-0 break-words">{log.date} · ciclo {log.contracted}</p>
                    {log.duration === null ? (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-sm uppercase bg-brass-50 text-warning border border-warning/40 shrink-0">Na Escola</span>
                    ) : log.overtime ? (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-sm uppercase tracking-wider whitespace-nowrap bg-error/15 text-error shrink-0">+{log.overtime}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-sm uppercase tracking-wider whitespace-nowrap bg-success/15 text-success shrink-0">
                        <CheckCircle2 size={11} /> No prazo
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-dashed border-outline-variant flex items-end justify-between gap-2">
                    <div className="space-y-2 min-w-0">
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 font-bold text-primary text-sm flex-wrap">
                          <LogIn size={13} className="shrink-0" /> {log.entry || <span className="text-on-surface-variant/50">—</span>}
                          {log.entryCorrected && (
                            <span className="text-[9px] font-bold uppercase text-warning bg-brass-50 px-1 py-0.5 rounded">Ajustado</span>
                          )}
                        </span>
                        {log.entryQuem && <p className="text-[11px] text-on-surface-variant/70 mt-0.5 break-words">{log.entryQuem}</p>}
                      </div>

                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 font-bold text-error text-sm flex-wrap">
                          <LogOut size={13} className="shrink-0" /> {log.exit || <span className="text-on-surface-variant/50">—</span>}
                          {log.exitCorrected && (
                            <span className="text-[9px] font-bold uppercase text-warning bg-brass-50 px-1 py-0.5 rounded">Ajustado</span>
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


