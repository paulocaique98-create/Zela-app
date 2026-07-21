import React, { useState, useEffect } from 'react';
import { CalendarDays, Search, X, History, FileText, LogIn, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export default function AdminHistory({ currentSchool }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState('today');
  const [customDate, setCustomDate] = useState('');

  const fetchHistory = async () => {
    if (!currentSchool) return;
    setIsLoading(true);
    try {
      const schoolId = currentSchool.school_id || currentSchool.id;
      const todayISO = new Date().toISOString().split('T')[0];

      // Calcula intervalo de datas
      let startDate, endDate;
      if (period === 'today') {
        startDate = `${todayISO}T00:00:00`;
        endDate   = `${todayISO}T23:59:59`;
      } else if (period === 'custom' && customDate) {
        startDate = `${customDate}T00:00:00`;
        endDate   = `${customDate}T23:59:59`;
      } else {
        const days = period === '7days' ? 7 : 30;
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
          students:student_id (name, turma, contracted_hours, users:family_id(name))
        `)
        .eq('school_id', schoolId)
        .gte('event_time', startDate)
        .lte('event_time', endDate)
        .order('student_id')
        .order('event_time');

      if (error) throw error;

      // Agrupa por aluno e emparelha entrada+saída
      const byStudent = {};
      (rawLogs || []).forEach(log => {
        if (!byStudent[log.student_id]) byStudent[log.student_id] = [];
        byStudent[log.student_id].push(log);
      });

      const result = [];
      Object.values(byStudent).forEach(events => {
        // Itera emparelhando entradas com sua próxima saída
        let i = 0;
        while (i < events.length) {
          const ev = events[i];
          if (ev.event_type === 'entry') {
            const entryTime = new Date(ev.event_time);
            const nextExit = events.find((e, idx) => idx > i && e.event_type === 'exit');
            const exitTime = nextExit ? new Date(nextExit.event_time) : null;
            const stayMins = exitTime ? Math.round((exitTime - entryTime) / 60000) : null;
            const contractedMins = (ev.students?.contracted_hours || 0) * 60;
            const overtimeMins = stayMins !== null ? Math.max(0, stayMins - (contractedMins + 15)) : null;

            result.push({
              key: ev.id,
              studentName: ev.students?.name || '—',
              family: ev.students?.users?.name || '—',
              date: formatDate(ev.event_time),
              entry: formatTime(ev.event_time),
              exit: exitTime ? formatTime(nextExit.event_time) : null,
              contracted: `${ev.students?.contracted_hours || 0}h`,
              duration: stayMins !== null ? formatMinutes(stayMins) : null,
              overtime: overtimeMins !== null && overtimeMins > 0 ? formatMinutes(overtimeMins) : null,
              rawTime: entryTime.getTime(),
            });

            // Pula o evento de saída que foi emparelhado
            if (nextExit) {
              i = events.indexOf(nextExit) + 1;
            } else {
              i++;
            }
          } else {
            i++; // Saída sem entrada correspondente, ignora
          }
        }
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

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <History size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Histórico de Check-in/out</h2>
            <p className="text-sm text-slate-500">Todos os registros individuais de entrada e saída</p>
          </div>
        </div>
        <button
          onClick={() => alert('Exportação de PDF será implementada na próxima versão.')}
          className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl transition shadow-sm shrink-0"
        >
          <FileText size={16} /> Exportar Relatório
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3 mb-6 shrink-0">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar por aluno ou responsável..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-2xl shrink-0 max-w-full">
          {[
            { id: 'today', label: 'Hoje' },
            { id: '7days', label: 'Últimos 7 dias' },
            { id: '30days', label: 'Últimos 30 dias' },
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
          {period === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              className="ml-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
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
            <CalendarDays className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium text-sm">Nenhum registro encontrado para este período.</p>
            <p className="text-slate-400 text-xs mt-1">Os registros aparecem após o check-in ser confirmado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Responsável</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Entrada</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Saída</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Ciclo</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Excedente pós tolerância (15 min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(log => (
                  <tr key={log.key} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 pr-4 font-medium text-slate-600">{log.date}</td>
                    <td className="py-3 pr-4 font-semibold text-slate-800">{log.studentName}</td>
                    <td className="py-3 pr-4 text-slate-500 text-xs hidden sm:table-cell">{log.family}</td>
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-1 font-medium text-indigo-600">
                        <LogIn size={13} /> {log.entry}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {log.exit ? (
                        <span className="flex items-center gap-1 font-medium text-rose-500">
                          <LogOut size={13} /> {log.exit}
                        </span>
                      ) : (
                        <span className="text-amber-500 italic font-medium text-xs">Em andamento</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-600">{log.contracted}</td>
                    <td className="py-3 text-right">
                      {log.duration === null ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase bg-amber-50 text-amber-600">—</span>
                      ) : log.overtime ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider whitespace-nowrap bg-red-100 text-red-700">
                          +{log.overtime}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider whitespace-nowrap bg-green-100 text-green-700">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


