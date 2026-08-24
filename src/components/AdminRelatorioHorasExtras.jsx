import React, { useState, useEffect } from 'react';
import { CalendarDays, Search, X, Clock, FileText, LogIn, LogOut, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { agruparEventosPorDia, calcularHorasExtras } from '../utils/attendanceUtils';
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

  const fetchExtras = async () => {
    if (!currentSchool) return;
    setIsLoading(true);
    try {
      const schoolId = currentSchool.school_id || currentSchool.id;
      const todayISO = new Date().toISOString().split('T')[0];

      let startDate, endDate;
      if (period === 'today') {
        startDate = `${todayISO}T00:00:00`;
        endDate   = `${todayISO}T23:59:59`;
      } else if (period === 'custom' && customDate) {
        startDate = `${customDate}T00:00:00`;
        endDate   = `${customDate}T23:59:59`;
      } else {
        const days = period === '7days' ? 7 : (period === 'this_month' ? new Date().getDate() : 30);
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        startDate = `${start.toISOString().split('T')[0]}T00:00:00`;
        endDate   = `${todayISO}T23:59:59`;
      }

      const { data: rawLogs, error } = await supabase
        .from('attendance_logs')
        .select(`
          id,
          event_type,
          event_time,
          student_id,
          recorded_by,
          students:student_id (name, contracted_exit_time, users:family_id(name)),
          users:recorded_by (name)
        `)
        .eq('school_id', schoolId)
        .gte('event_time', startDate)
        .lte('event_time', endDate)
        .order('student_id')
        .order('event_time');

      if (error) throw error;

      const groupedLogs = agruparEventosPorDia(rawLogs);

      const result = groupedLogs.map(group => {
        const entryTimeIso = group.entryLog ? group.entryLog.event_time : null;
        const exitTimeIso = group.exitLog ? group.exitLog.event_time : null;
        const contractedExitTime = group.studentData?.contracted_exit_time;
        
        // Incluindo nome do funcionário que aprovou o checkout
        const approvedBy = group.exitLog?.users?.name || group.entryLog?.users?.name || '—';

        const calculo = calcularHorasExtras(exitTimeIso, contractedExitTime);

        return {
          key: `${group.student_id}_${group.date}`,
          studentName: group.studentData?.name || '—',
          family: group.studentData?.users?.name || '—',
          date: formatDate(entryTimeIso || exitTimeIso),
          entry: entryTimeIso ? formatTime(entryTimeIso) : null,
          exit: exitTimeIso ? formatTime(exitTimeIso) : null,
          contractedExit: contractedExitTime || '—',
          approvedBy: approvedBy,
          ...calculo,
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

  const filtered = logs.filter(log => {
    // Filtro de busca por nome
    const term = searchTerm.toLowerCase().trim();
    const matchName = !term || log.studentName.toLowerCase().includes(term) || log.family.toLowerCase().includes(term);
    
    // Filtro de status
    let matchStatus = true;
    if (statusFilter === 'excess') {
      matchStatus = !log.dentro_tolerancia && !log.sem_saida;
    } else if (statusFilter === 'ok') {
      matchStatus = log.dentro_tolerancia && !log.sem_saida;
    }
    
    return matchName && matchStatus;
  });

  const totalRegistros = filtered.length;
  const totalMinutosExcedentes = filtered.reduce((acc, log) => acc + log.minutos_excedentes, 0);
  const totalValor = filtered.reduce((acc, log) => acc + log.valor, 0);
  const totalValorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValor);

  const PERIOD_LABELS = { today: 'Hoje', '7days': '\u00DAltimos 7 dias', this_month: 'Este m\u00EAs' };
  const periodLabel = period === 'custom' && customDate
    ? formatDate(`${customDate}T00:00:00`)
    : (PERIOD_LABELS[period] || 'Per\u00EDodo selecionado');

  const handleExport = () => {
    printHorasExtrasReport({
      records: filtered,
      periodLabel,
      school: currentSchool,
      totals: { totalRegistros, totalMinutosExcedentes, totalValorFormatado },
    });
  };

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
            <Clock size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Relatório de Horas Extras</h2>
            <p className="text-sm text-slate-500">Cobrança por hora cheia após 15 min de tolerância</p>
          </div>
        </div>
        
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="flex items-center justify-center gap-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 px-4 py-2.5 rounded-xl transition shadow-sm shrink-0 w-full sm:w-auto"
        >
          <Download size={16} /> Exportar Relatório
        </button>
      </div>

      {/* Resumo Financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 shrink-0">
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col justify-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Registros</p>
          <p className="text-2xl font-black text-slate-700">{totalRegistros}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col justify-center">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Minutos Excedentes</p>
          <p className="text-2xl font-black text-amber-700">{totalMinutosExcedentes} min</p>
        </div>
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex flex-col justify-center">
          <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">Valor Total a Cobrar</p>
          <p className="text-2xl font-black text-rose-700">{totalValorFormatado}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col xl:flex-row gap-3 mb-6 shrink-0">
        <div className="relative flex-1">
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

        <div className="flex flex-wrap gap-2 shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-2xl overflow-x-auto">
            {[
              { id: 'today', label: 'Hoje' },
              { id: '7days', label: 'Últimos 7 dias' },
              { id: 'this_month', label: 'Este mês' },
              { id: 'custom', label: 'Personalizado' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  period === p.id ? 'bg-white shadow-sm text-indigo-900' : 'text-slate-500 hover:text-slate-700'
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
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          )}

          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer"
          >
            <option value="all">Todos os status</option>
            <option value="excess">Com excesso</option>
            <option value="ok">Dentro do prazo</option>
          </select>
        </div>
      </div>

      {/* Tabela - Scrollable Container */}
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
          <div className="overflow-x-auto pb-4">
            <table className="w-full text-sm whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Responsável</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Entrada</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Saída</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Hor. Contratado</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Excedente</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Valor</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Aprovado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(log => {
                  let rowClass = "hover:bg-slate-50 transition-colors";
                  let excessText = "—";
                  let excessClass = "text-slate-400";
                  let valorClass = "text-green-600";
                  
                  if (!log.dentro_tolerancia && !log.sem_saida) {
                    rowClass = "bg-amber-50/50 hover:bg-amber-50 transition-colors";
                    excessText = `${Math.floor(log.minutos_excedentes / 60)}h ${log.minutos_excedentes % 60}min`;
                    excessClass = "text-amber-600 font-bold";
                    valorClass = "text-rose-600 font-bold";
                  }

                  return (
                    <tr key={log.key} className={rowClass}>
                      <td className="py-3 pr-4 font-medium text-slate-600">{log.date}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{log.studentName}</td>
                      <td className="py-3 pr-4 text-slate-500 text-xs">{log.family}</td>
                      <td className="py-3 pr-4">
                        {log.entry ? (
                          <span className="flex items-center gap-1 font-medium text-indigo-600">
                            <LogIn size={13} /> {log.entry}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {log.exit ? (
                          <span className="flex items-center gap-1 font-medium text-slate-600">
                            <LogOut size={13} /> {log.exit}
                          </span>
                        ) : (
                          <span className="text-amber-500 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          {log.contractedExit}
                        </span>
                      </td>
                      <td className={`py-3 pr-4 text-right ${excessClass}`}>
                        {log.sem_saida ? '—' : excessText}
                      </td>
                      <td className={`py-3 pr-4 text-right ${valorClass}`}>
                        {log.sem_saida ? '—' : log.valorFormatado}
                      </td>
                      <td className="py-3 text-right">
                        <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">
                          {log.approvedBy}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
