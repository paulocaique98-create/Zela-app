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

export default function FamilyHistory({ currentUser, familyStudents }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState('today');
  const [customDate, setCustomDate] = useState('');

  const fetchHistory = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const todayISO = new Date().toISOString().split('T')[0];

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

      // Busca apenas os logs desta família (1º e 2º responsáveis via student_guardians)
      let query = supabase
        .from('attendance_logs')
        .select(`
          id,
          event_type,
          event_time,
          student_id,
          students:student_id (name, contracted_hours, users:family_id(name))
        `);

      if (familyStudents && familyStudents.length > 0) {
        query = query.in('student_id', familyStudents.map(s => s.id));
      } else {
        query = query.eq('family_id', currentUser.id);
      }

      const { data: rawLogs, error } = await query
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

            if (nextExit) {
              i = events.indexOf(nextExit) + 1;
            } else {
              i++;
            }
          } else {
            i++;
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

  useEffect(() => { fetchHistory(); }, [currentUser, period, customDate]);

  const filtered = logs.filter(log => {
    const term = searchTerm.toLowerCase().trim();
    return !term || log.studentName.toLowerCase().includes(term);
  });

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <History size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Histórico de Horários</h2>
            <p className="text-small text-on-surface-variant">Registros de entrada e saída dos seus filhos</p>
          </div>
        </div>
        <button
          onClick={() => alert('Exportação de PDF será implementada na próxima versão.')}
          className="flex w-full sm:w-auto justify-center items-center gap-2 text-sm font-bold text-white bg-primary hover:bg-primary-container px-4 py-2.5 rounded-zela-md transition shadow-sm shrink-0"
        >
          <FileText size={16} /> Exportar Relatório
        </button>
      </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 shrink-0">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-on-surface-variant/70" />
            </div>
            <input
              type="text"
              placeholder="Buscar por aluno..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary outline-none text-sm"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant/70 hover:text-on-surface-variant">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 p-1 bg-surface-container rounded-zela-lg shrink-0">
            {[
              { id: 'today', label: 'Hoje' },
              { id: '7days', label: 'Últimos 7 dias' },
              { id: '30days', label: 'Últimos 30 dias' },
              { id: 'custom', label: 'Personalizado' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-zela-md text-xs font-bold transition-all ${
                  period === p.id ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
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
                className="ml-1 px-2 py-1 bg-white border border-outline-variant rounded-lg text-xs font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-on-surface-variant font-medium text-sm">Nenhum registro para este período.</p>
            <p className="text-on-surface-variant/70 text-xs mt-1">Os registros aparecem após o check-in ser realizado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left border-b border-outline-variant">
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Data</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider hidden sm:table-cell">Responsável</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Entrada</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Saída</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider">Ciclo</th>
                  <th className="pb-3 text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider text-right">Excedente pós tolerância (15 min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filtered.map(log => (
                  <tr key={log.key} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3 pr-4 font-medium text-on-surface-variant">{log.date}</td>
                    <td className="py-3 pr-4 font-semibold text-on-surface">{log.studentName}</td>
                    <td className="py-3 pr-4 text-on-surface-variant text-xs hidden sm:table-cell">{log.family}</td>
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-1 font-medium text-primary">
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
                    <td className="py-3 pr-4 font-medium text-on-surface-variant">{log.contracted}</td>
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
