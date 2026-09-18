import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, FileText, Download, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { agruparEventosPorDia, calcularHorasExtras, calcularEntradaAntecipada, mergeBillingConfig, getBrasiliaDateStr } from '../utils/attendanceUtils';
import { printHorasExtrasReport } from '../lib/printHorasExtras';

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('pt-BR');
}

export default function AdminRelatorioHorasExtras({ currentSchool }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'excess' | 'ok'
  // Período e status ficam escondidos atrás desse painel — modelo "foco na
  // lista" validado com o usuário (proposta com 3 layouts, 17/09): sem isso,
  // os filtros disputavam espaço/atenção com o resultado por aluno, que é a
  // informação que a recepção realmente precisa ver primeiro.
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

  const fetchExtras = async () => {
    if (!currentSchool) return;
    setIsLoading(true);
    try {
      const schoolId = currentSchool.school_id || currentSchool.id;
      const todayISO = getBrasiliaDateStr();

      // Offset explícito (-03:00): sem ele, o Postgres interpreta a string
      // como UTC (fuso da sessão), então "00:00" viraria 21h da noite
      // anterior em Brasília — o intervalo do dia ficaria deslocado.
      let startDate, endDate;
      if (period === 'today') {
        startDate = `${todayISO}T00:00:00-03:00`;
        endDate   = `${todayISO}T23:59:59-03:00`;
      } else if (period === 'custom' && customDate) {
        startDate = `${customDate}T00:00:00-03:00`;
        endDate   = `${customDate}T23:59:59-03:00`;
      } else {
        const days = period === '7days' ? 7 : (period === 'this_month' ? new Date().getDate() : 30);
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
          student_id,
          recorded_by,
          students:student_id (name, contracted_entry_time, contracted_exit_time, weekly_schedule, users:family_id(name)),
          users:recorded_by (name)
        `)
        .eq('school_id', schoolId)
        .gte('event_time', startDate)
        .lte('event_time', endDate)
        .order('student_id')
        .order('event_time');

      if (error) throw error;

      const groupedLogs = agruparEventosPorDia(rawLogs);
      const billingConfig = mergeBillingConfig(currentSchool?.billing_config);

      const result = groupedLogs.map(group => {
        const entryTimeIso = group.entryLog ? group.entryLog.event_time : null;
        const exitTimeIso = group.exitLog ? group.exitLog.event_time : null;
        const contractedEntryTime = group.studentData?.contracted_entry_time;
        const contractedExitTime = group.studentData?.contracted_exit_time;
        const weeklySchedule = group.studentData?.weekly_schedule;

        // Incluindo nome do funcionário que aprovou o checkout
        const approvedBy = group.exitLog?.users?.name || group.entryLog?.users?.name || '—';

        // Cobrança considera os dois lados: check-in ANTECIPADO (antes da
        // entrada contratada/efetiva do dia, com margem) e check-out
        // TARDIO (já existia) -- somados no total do dia.
        const calculoSaida = calcularHorasExtras(exitTimeIso, contractedExitTime, weeklySchedule, billingConfig);
        const calculoEntrada = calcularEntradaAntecipada(entryTimeIso, contractedEntryTime, weeklySchedule, billingConfig);

        const minutos_excedentes = calculoSaida.minutos_excedentes + calculoEntrada.minutos_antecipados;
        const valor = calculoSaida.valor + calculoEntrada.valor;
        const dentro_tolerancia = calculoSaida.dentro_tolerancia && calculoEntrada.dentro_tolerancia;

        return {
          key: `${group.student_id}_${group.date}`,
          studentId: group.student_id,
          studentName: group.studentData?.name || '—',
          family: group.studentData?.users?.name || '—',
          date: formatDate(entryTimeIso || exitTimeIso),
          entry: entryTimeIso ? formatTime(entryTimeIso) : null,
          exit: exitTimeIso ? formatTime(exitTimeIso) : null,
          contractedExit: contractedExitTime || '—',
          approvedBy: approvedBy,
          minutos_excedentes,
          valor,
          valorFormatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor),
          dentro_tolerancia,
          sem_saida: calculoSaida.sem_saida,
          excessoEntrada: !calculoEntrada.dentro_tolerancia,
          excessoSaida: !calculoSaida.dentro_tolerancia,
          rawTime: entryTimeIso ? new Date(entryTimeIso).getTime() : (exitTimeIso ? new Date(exitTimeIso).getTime() : 0),
        };
      });

      result.sort((a, b) => b.rawTime - a.rawTime || a.studentName.localeCompare(b.studentName));
      setLogs(result);
    } catch (err) {
      console.error('Erro ao buscar horas extras:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchExtras(); }, [currentSchool, period, customDate]);

  // Mesma regra usada pra pintar a linha de amarelo na tabela: excedeu a
  // tolerância de entrada antecipada, ou de saída tardia com o check-out já
  // registrado (enquanto o aluno ainda está na escola sem saída, não dá pra
  // dizer que "tem" hora extra — ainda pode sair dentro do prazo).
  const hasExcess = log => log.excessoEntrada || (log.excessoSaida && !log.sem_saida);

  const searchFiltered = logs.filter(log => {
    const term = searchTerm.toLowerCase().trim();
    return !term || log.studentName.toLowerCase().includes(term) || log.family.toLowerCase().includes(term);
  });

  const filtered = searchFiltered.filter(log => {
    if (statusFilter === 'excess') return hasExcess(log);
    if (statusFilter === 'ok') return log.dentro_tolerancia && !log.sem_saida;
    return true;
  });

  // Relatório exportado (PDF) sempre leva só quem de fato tem hora extra,
  // independente do filtro de status selecionado na tela — a tela serve pra
  // acompanhar todo mundo, o relatório é só o que realmente gerou excedente.
  const exportRecords = searchFiltered.filter(hasExcess);

  const totalMinutosExcedentes = filtered.reduce((acc, log) => acc + log.minutos_excedentes, 0);
  const totalValor = filtered.reduce((acc, log) => acc + log.valor, 0);
  const totalValorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValor);

  const PERIOD_LABELS = { today: 'Hoje', '7days': 'Semana', this_month: 'M\u00EAs' };
  const periodLabel = period === 'custom' && customDate
    ? formatDate(`${customDate}T00:00:00`)
    : (PERIOD_LABELS[period] || 'Per\u00EDodo selecionado');

  const handleExport = () => {
    printHorasExtrasReport({
      records: exportRecords,
      periodLabel,
      school: currentSchool,
    });
  };

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header -- título e botões sempre na mesma linha (os botões agora são
          compactos o bastante pra caber mesmo no celular); título encurta
          pra "Horas Extras" abaixo de sm pra sobrar espaço. */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 mb-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-amber-100 p-2 sm:p-2.5 rounded-xl text-amber-600 shrink-0">
            <Clock size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 truncate">
              <span className="sm:hidden">Horas Extras</span>
              <span className="hidden sm:inline">Relatório de Horas Extras</span>
            </h2>
            <p className="hidden sm:block text-sm text-slate-500">Cobrança por hora cheia, entrada antecipada e saída tardia (tolerância configurável em Configurações)</p>
          </div>
        </div>

        <div className="relative flex items-center gap-2 shrink-0" ref={filtersRef}>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center justify-center gap-2 text-sm font-bold px-3.5 py-2.5 rounded-xl transition shadow-sm border ${
              showFilters ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Período e status"
          >
            <SlidersHorizontal size={16} />
          </button>

          <button
            onClick={handleExport}
            disabled={exportRecords.length === 0}
            title={exportRecords.length === 0 ? 'Ninguém com hora extra neste período' : undefined}
            className="flex items-center justify-center gap-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 px-3.5 sm:px-4 py-2.5 rounded-xl transition shadow-sm shrink-0"
          >
            <Download size={16} /> <span className="hidden sm:inline">Exportar Relatório</span>
          </button>

          {/* Ancorado no grupo inteiro (não só no botão de filtro) e sempre
              pela direita -- evita o painel nascer fora da tela quando o
              botão de filtro não está colado na borda direita real. */}
          {showFilters && (
            <div className="absolute right-0 top-full mt-2 w-[21rem] max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 rounded-2xl shadow-lg p-3 z-20 space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">Período</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {[
                      { id: 'today', label: 'Hoje' },
                      { id: '7days', label: 'Semana' },
                      { id: 'this_month', label: 'Mês' },
                      { id: 'custom', label: 'Editar' }
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPeriod(p.id)}
                        className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          period === p.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
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
                      className="mt-2 w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">Status</p>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">Todos os status</option>
                    <option value="excess">Com excesso</option>
                    <option value="ok">Dentro do prazo</option>
                  </select>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Resumo -- vira uma frase, não mais cards: modelo "foco na lista"
          validado com o usuário (proposta com 3 layouts, 17/09). */}
      <p className="text-sm text-slate-500 mb-4 shrink-0">
        {periodLabel}: <span className="font-bold text-amber-600">{totalMinutosExcedentes} min</span> excedentes, <span className="font-bold text-rose-600">{totalValorFormatado}</span> a cobrar.
      </p>

      {/* Busca */}
      <div className="relative mb-4 sm:mb-6 shrink-0">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar por aluno ou responsável..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Resultado por aluno -- cards ao invés de tabela: o valor a cobrar
          fica em destaque tipográfico bem acima de qualquer outro número da
          tela, já que é a informação que decide se alguém precisa agir. */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <FileText className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium text-sm">Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {filtered.map(log => {
              const excess = hasExcess(log);
              const excessText = `${Math.floor(log.minutos_excedentes / 60)}h ${log.minutos_excedentes % 60}min`;
              const initials = log.studentName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

              return (
                <div key={log.key} className={`flex items-center gap-3 p-3 sm:p-4 rounded-2xl border shadow-sm ${excess ? 'bg-white border-amber-200' : 'bg-white border-slate-200'}`}>
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 ${excess ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-sm truncate">{log.studentName}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {log.date} · {log.family}
                      {log.exit ? ` · saída ${log.exit}` : (log.entry ? ' · saída pendente' : '')}
                      {log.contractedExit !== '—' ? ` (contratado ${log.contractedExit})` : ''}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    {excess ? (
                      <>
                        <p className="font-black text-rose-600 text-base sm:text-lg leading-none">{log.valorFormatado}</p>
                        <p className="text-[10px] sm:text-xs font-bold text-amber-600 mt-1">+{excessText}</p>
                      </>
                    ) : log.sem_saida ? (
                      <span className="text-amber-500 font-bold text-[10px] uppercase px-2 py-1 rounded-full bg-amber-100 border border-amber-200 whitespace-nowrap">
                        Pendente
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-[10px] sm:text-xs uppercase whitespace-nowrap">
                        <CheckCircle2 size={13} /> No prazo
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
