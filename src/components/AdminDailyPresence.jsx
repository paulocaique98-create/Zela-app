import React, { useState, useEffect } from 'react';
import { GraduationCap, LogOut, CheckCircle2, Users, RefreshCw, ChevronDown, Pencil, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import AttendanceCorrectionModal from './AttendanceCorrectionModal';
import AttendanceMarkingDeleteModal from './AttendanceMarkingDeleteModal';

const STATUS_CONFIG = {
  in_school:      { label: 'Na escola',        cls: 'bg-green-100 text-green-700', icon: <CheckCircle2 size={12}/> },
  left:           { label: 'Já saiu',          cls: 'bg-slate-700 text-slate-100', icon: <LogOut size={12}/> },
  absent:         { label: 'Ausente',          cls: 'bg-red-100 text-red-600',     icon: null },
  pending_entry:  { label: 'Entrada solicitada', cls: 'bg-amber-100 text-amber-700', icon: null },
  pending_exit:   { label: 'Saída solicitada',   cls: 'bg-amber-100 text-amber-700', icon: null },
  idle:           { label: 'Pendente de Check-in', cls: 'bg-slate-100 text-slate-500', icon: null },
};

export default function AdminDailyPresence({ currentUser, currentSchool }) {
  // Turmas cadastradas oficialmente em Gestão de Turmas (schools.turmas) --
  // a MESMA lista usada no cadastro de aluno (Novo Usuário > Alunos
  // vinculados > Turma), pra não duplicar opção quando o texto gravado num
  // aluno antigo não bate mais com o texto oficial atual (ex: "Kids I" e
  // "Kids I - Matutino" apareceriam como duas turmas diferentes).
  const { turmas: schoolTurmas } = useSchoolConfig(currentUser?.school_id);
  const turmaOptions = ['Todas as Turmas', ...schoolTurmas];

  const [selectedTurma, setSelectedTurma] = useState('Todas as Turmas');
  const [allStudents, setAllStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [correctionTarget, setCorrectionTarget] = useState(null); // { log, student }
  const [deleteTarget, setDeleteTarget] = useState(null); // { student, eventType, staleTime }
  const [resolvingCorrectionFor, setResolvingCorrectionFor] = useState(null); // `${studentId}_${eventType}`

  const fetchPresence = async () => {
    setIsLoading(true);
    try {
      // Busca todos os alunos da escola que tiveram alguma movimentação hoje
      const { data, error } = await supabase
        .from('students')
        .select('id, name, status, turma, contracted_hours, contracted_entry_time, contracted_exit_time, weekly_schedule, today_entry, today_exit, today_entry_at, today_exit_at, family_id')
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

  // Essa tela lê o horário direto de students.today_entry/today_exit (não de
  // attendance_logs), então não tem o id do log à mão — busca sob demanda,
  // só quando o admin clica no lápis. entry: primeiro do dia; exit: último
  // do dia (mesma regra de agruparEventosPorDia em attendanceUtils.js).
  const openCorrection = async (student, eventType) => {
    const key = `${student.id}_${eventType}`;
    setResolvingCorrectionFor(key);
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id, event_type, event_time, corrected')
        .eq('student_id', student.id)
        .eq('event_type', eventType)
        .gte('event_time', todayStart.toISOString())
        .lte('event_time', todayEnd.toISOString())
        .order('event_time', { ascending: eventType === 'entry' })
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) {
        // Sem log nenhum por trás desse horário: é uma marcação fantasma
        // (sobra de solicitação cancelada, ver App.jsx > rejectStudentStatus)
        // — não dá pra "corrigir" um registro que não existe, só remover.
        const staleTime = eventType === 'entry' ? student.today_entry_at : student.today_exit_at;
        setDeleteTarget({ student, eventType, staleTime });
        return;
      }
      setCorrectionTarget({ log: data[0], student });
    } catch (err) {
      console.error('Erro ao localizar registro para correção:', err);
    } finally {
      setResolvingCorrectionFor(null);
    }
  };

  // Filtra por turma selecionada
  const displayed = selectedTurma === 'Todas as Turmas'
    ? allStudents
    : allStudents.filter(s => s.turma === selectedTurma);

  // Contagens por status
  const inSchool = allStudents.filter(s => s.status === 'in_school').length;
  const left     = allStudents.filter(s => s.status === 'left').length;
  const absent   = allStudents.filter(s => s.status === 'absent').length;
  const pending  = allStudents.filter(s => s.status === 'pending_entry' || s.status === 'pending_exit').length;

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
          className="flex w-full sm:w-auto justify-center items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''}/> Atualizar
        </button>
      </div>

      {/* Cards de resumo + Sub-menu de Turmas (tudo como cabeçalho estático) */}
      <div className="space-y-4 mb-6 shrink-0">
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Na escola',    count: inSchool, color: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Solicitações', count: pending,  color: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Já saíram',    count: left,     color: 'bg-slate-100 border-slate-200 text-slate-600' },
            { label: 'Ausentes',     count: absent,   color: 'bg-red-50 border-red-200 text-red-600' },
          ].map(({ label, count, color }) => (
            <div key={label} className={`${color} border rounded-2xl p-3 text-center`}>
              <p className="text-xl font-black">{count}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Seletor de turma no mobile -- substitui o scroll horizontal de
            abas (ruim de usar no celular) por um menu nativo de escolha,
            mesma largura do botão Atualizar (w-full nesse tamanho de tela). */}
        <div className="relative sm:hidden">
          <select
            value={selectedTurma}
            onChange={e => setSelectedTurma(e.target.value)}
            className="w-full appearance-none bg-slate-100 border border-slate-200 rounded-2xl pl-4 pr-10 py-2.5 text-sm font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {turmaOptions.map(turma => (
              <option key={turma} value={turma}>
                {turma}
                {turma !== 'Todas as Turmas'
                  ? ` (${allStudents.filter(s => s.turma === turma && s.status !== 'idle').length})`
                  : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        </div>

        {/* Sub-menu de Turmas (telas maiores) -- mesma largura da linha de
            cards acima, com as abas se distribuindo por igual nesse espaço
            (antes era w-fit, só do tamanho do conteúdo, ficando bem mais
            estreito e desalinhado do resto da tela). */}
        <div className="hidden sm:flex gap-2 p-1 bg-slate-100 rounded-2xl w-full overflow-x-auto">
          {turmaOptions.map(turma => (
            <button
              key={turma}
              onClick={() => setSelectedTurma(turma)}
              className={`flex-1 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${
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
          // Todas as colunas ficam visíveis em qualquer tela; no celular a
          // tabela rola na horizontal dentro deste container em vez de
          // esconder Turma/Saída.
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px] whitespace-nowrap">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Aluno</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Turma</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Entrada</th>
                  <th className="pb-3 pr-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Saída</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map(student => {
                  const cfg = STATUS_CONFIG[student.status] || STATUS_CONFIG.idle;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center shrink-0 border border-indigo-100">
                            <span className="text-indigo-600 font-bold text-xs">
                              {student.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-semibold text-slate-800">{student.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-1 rounded-md inline-block">
                          {student.turma || '—'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono font-bold text-slate-700">
                        {student.today_entry ? (
                          <span className="flex items-center gap-1.5">
                            {student.today_entry.substring(0, 5)}
                            {resolvingCorrectionFor === `${student.id}_entry` ? (
                              <Loader2 size={11} className="animate-spin text-slate-300" />
                            ) : (
                              <button onClick={() => openCorrection(student, 'entry')} className="text-slate-300 hover:text-indigo-600 transition" title="Corrigir horário de entrada">
                                <Pencil size={11} />
                              </button>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-slate-500">
                        {student.today_exit ? (
                          <span className="flex items-center gap-1.5">
                            {student.today_exit.substring(0, 5)}
                            {resolvingCorrectionFor === `${student.id}_exit` ? (
                              <Loader2 size={11} className="animate-spin text-slate-300" />
                            ) : (
                              <button onClick={() => openCorrection(student, 'exit')} className="text-slate-300 hover:text-indigo-600 transition" title="Corrigir horário de saída">
                                <Pencil size={11} />
                              </button>
                            )}
                          </span>
                        ) : '—'}
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

      {correctionTarget && (
        <AttendanceCorrectionModal
          log={correctionTarget.log}
          student={correctionTarget.student}
          currentUser={currentUser}
          billingConfig={currentSchool?.billing_config}
          onClose={() => setCorrectionTarget(null)}
          onSaved={() => { setCorrectionTarget(null); fetchPresence(); }}
        />
      )}

      {deleteTarget && (
        <AttendanceMarkingDeleteModal
          student={deleteTarget.student}
          eventType={deleteTarget.eventType}
          staleTime={deleteTarget.staleTime}
          currentUser={currentUser}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); fetchPresence(); }}
        />
      )}
    </div>
  );
}



 


