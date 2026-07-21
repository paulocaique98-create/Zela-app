import React, { useState, useEffect } from 'react';
import { GraduationCap, LogOut, CheckCircle2, Users, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

import { TURMAS } from '../lib/constants';

const STATUS_CONFIG = {
  in_school: { label: 'Na escola',  cls: 'bg-green-100 text-green-700', icon: <CheckCircle2 size={12}/> },
  left:      { label: 'Já saiu',    cls: 'bg-slate-700 text-slate-100', icon: <LogOut size={12}/> },
  absent:    { label: 'Ausente',    cls: 'bg-red-100 text-red-600',     icon: null },
  idle:      { label: 'Pendente',   cls: 'bg-slate-100 text-slate-500', icon: null },
};

export default function AdminDailyPresence({ currentUser }) {
  const [selectedTurma, setSelectedTurma] = useState('Todas as Turmas');
  const [allStudents, setAllStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchPresence = async () => {
    setIsLoading(true);
    try {
      // Busca todos os alunos da escola que tiveram alguma movimentação hoje
      const { data, error } = await supabase
        .from('students')
        .select('id, name, status, turma, contracted_hours, today_entry, today_exit, family_id')
        .eq('school_id', currentUser.school_id)
        .neq('status', 'idle')   // exclui quem ainda não interagiu hoje
        .order('name', { ascending: true });

      if (error) throw error;
      setAllStudents(data || []);
      setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Erro ao buscar presença:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPresence();
  }, []);

  // Filtra por turma selecionada
  const displayed = selectedTurma === 'Todas as Turmas'
    ? allStudents
    : allStudents.filter(s => s.turma === selectedTurma);

  // Contagens por status
  const inSchool = allStudents.filter(s => s.status === 'in_school').length;
  const left     = allStudents.filter(s => s.status === 'left').length;
  const absent   = allStudents.filter(s => s.status === 'absent').length;

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <GraduationCap className="text-indigo-600" size={22}/> Presença Diária
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            {lastUpdate && <span className="ml-2 text-slate-400">· Atualizado às {lastUpdate}</span>}
          </p>
        </div>
        <button
          onClick={fetchPresence}
          disabled={isLoading}
          className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''}/> Atualizar
        </button>
      </div>

      {/* Cards de resumo + Sub-menu de Turmas (tudo como cabeçalho estático) */}
      <div className="space-y-4 mb-6 shrink-0">
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Na escola',   count: inSchool, color: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Já saíram',   count: left,     color: 'bg-slate-100 border-slate-200 text-slate-600' },
            { label: 'Ausentes',    count: absent,   color: 'bg-red-50 border-red-200 text-red-600' },
          ].map(({ label, count, color }) => (
            <div key={label} className={`${color} border rounded-2xl p-3 text-center`}>
              <p className="text-xl font-black">{count}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Sub-menu de Turmas */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit overflow-x-auto max-w-full">
          {TURMAS.map(turma => (
            <button
              key={turma}
              onClick={() => setSelectedTurma(turma)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                selectedTurma === turma
                  ? 'bg-white shadow-sm text-indigo-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {turma}
              {turma !== 'Todas as Turmas' && (
                <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5">
                  {allStudents.filter(s => s.turma === turma && s.status !== 'idle').length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de alunos - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Users className="h-10 w-10 text-slate-300 mb-3"/>
            <p className="text-slate-500 font-medium text-sm">
            {selectedTurma === 'Todas as Turmas'
                ? 'Nenhuma movimentação registrada hoje.'
                : `Nenhuma movimentação em ${selectedTurma} hoje.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Turma</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Entrada</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Saída</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map(student => {
                  const cfg = STATUS_CONFIG[student.status] || STATUS_CONFIG.idle;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center shrink-0 border border-indigo-100">
                            <span className="text-indigo-600 font-bold text-xs">
                              {student.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-semibold text-slate-800">{student.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 hidden sm:table-cell">
                        <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-1 rounded-md">
                          {student.turma || '—'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono font-bold text-slate-700">
                        {student.today_entry ? student.today_entry.substring(0, 5) : '—'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-slate-500 hidden md:table-cell">
                        {student.today_exit ? student.today_exit.substring(0, 5) : '—'}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-md ${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
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



 


