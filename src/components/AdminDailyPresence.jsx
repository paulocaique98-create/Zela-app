import React, { useState, useEffect } from 'react';
import { LogOut, CheckCircle2, Users, RefreshCw, Pencil, Loader2, SlidersHorizontal } from 'lucide-react';
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
  // Aluno matriculado que hoje não está na escola, não saiu e não tem
  // nenhuma solicitação em aberto -- pro contexto de Presença Diária isso É
  // um ausente (mesmo sem a família ter marcado "Não irá hoje" no app),
  // então usa o mesmo rótulo/estilo de 'absent' em vez de "Pendente de
  // Check-in" (rótulo que só faz sentido pro responsável, na Família).
  idle:           { label: 'Ausente',          cls: 'bg-red-100 text-red-600',     icon: null },
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
  const [turmaMenuOpen, setTurmaMenuOpen] = useState(false);

  const fetchPresence = async () => {
    setIsLoading(true);
    try {
      // Busca TODOS os alunos matriculados na escola, inclusive quem ainda
      // não teve nenhuma movimentação hoje ('idle') -- esses contam como
      // Ausentes nesta tela (ver STATUS_CONFIG.idle), não somem da lista.
      const { data, error } = await supabase
        .from('students')
        .select('id, name, status, turma, contracted_hours, contracted_entry_time, contracted_exit_time, weekly_schedule, today_entry, today_exit, today_entry_at, today_exit_at, family_id')
        .eq('school_id', currentUser.school_id)
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

  // Contagens por status. Ausente = matriculado e hoje não está em nenhuma
  // das outras categorias (nem na escola, nem já saiu, nem com solicitação
  // em aberto) -- inclui tanto quem a família marcou "Não irá hoje"
  // (status='absent') quanto quem simplesmente ainda não teve nenhuma
  // movimentação hoje (status='idle', o padrão de todo aluno até a 1ª
  // interação do dia).
  const inSchool = allStudents.filter(s => s.status === 'in_school').length;
  const left     = allStudents.filter(s => s.status === 'left').length;
  const absent   = allStudents.filter(s => s.status === 'absent' || s.status === 'idle').length;
  const pending  = allStudents.filter(s => s.status === 'pending_entry' || s.status === 'pending_exit').length;

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header -- título "Presença Diária" e ícone removidos (o Header do
          app já mostra o nome da tela dinamicamente); só a data, direto. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          {lastUpdate && <span className="ml-2 text-slate-400">· Atualizado às {lastUpdate}</span>}
        </p>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <div className="relative">
            <button
              onClick={() => setTurmaMenuOpen(o => !o)}
              className="flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3.5 py-2 rounded-xl transition"
            >
              <SlidersHorizontal size={15} />
              <span className="hidden sm:inline">{selectedTurma}</span>
            </button>
            {turmaMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTurmaMenuOpen(false)} />
                <div className="absolute right-0 sm:left-0 top-full mt-2 w-56 max-w-[80vw] bg-white border border-slate-200 rounded-2xl shadow-lg z-20 p-1.5 max-h-72 overflow-y-auto">
                  {turmaOptions.map(turma => (
                    <button
                      key={turma}
                      onClick={() => { setSelectedTurma(turma); setTurmaMenuOpen(false); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-bold text-left transition ${
                        selectedTurma === turma ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{turma}</span>
                      {turma !== 'Todas as Turmas' && (
                        <span className="shrink-0 text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
                          {allStudents.filter(s => s.turma === turma).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={fetchPresence}
            disabled={isLoading}
            className="flex flex-1 sm:flex-none justify-center items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl transition disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''}/> <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* Resumo em frase única -- os 4 números continuam 100% derivados de
          allStudents.filter(status === X) (mesma fonte de verdade da lista
          abaixo), então a contagem nunca pode divergir do que aparece nos
          cards. "Já saíram"/"Ausentes" zerados hoje era bug de
          updateStudentStatus resetando o status pra idle 2s depois de
          confirmar a saída (ver App.jsx) -- corrigido lá, não aqui. */}
      <p className="text-sm text-slate-500 mb-5 shrink-0 leading-relaxed">
        <span className="font-black text-green-700">{inSchool}</span> na escola,{' '}
        <span className="font-black text-amber-700">{pending}</span> solicitaç{pending === 1 ? 'ão' : 'ões'},{' '}
        <span className="font-black text-slate-700">{left}</span> já sa{left === 1 ? 'iu' : 'íram'} e{' '}
        <span className="font-black text-red-600">{absent}</span> ausente{absent === 1 ? '' : 's'}.
      </p>

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-1">
            {displayed.map(student => {
              const cfg = STATUS_CONFIG[student.status] || STATUS_CONFIG.idle;
              return (
                <div key={student.id} className="flex flex-col gap-2.5 border border-slate-200 rounded-2xl bg-white shadow-sm p-3.5 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100">
                      <span className="text-indigo-600 font-bold text-xs">
                        {student.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-bold text-slate-800 text-sm min-w-0 break-words">{student.name}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-semibold min-w-0 truncate">
                      {student.turma || '—'}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-md shrink-0 ${cfg.cls}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>

                  <div className="flex gap-5 pt-2 border-t border-dashed border-slate-200 flex-wrap">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Entrada</span>
                      {student.today_entry ? (
                        <span className="flex items-center gap-1.5 font-mono font-bold text-indigo-700 text-sm">
                          {student.today_entry.substring(0, 5)}
                          {resolvingCorrectionFor === `${student.id}_entry` ? (
                            <Loader2 size={11} className="animate-spin text-slate-300" />
                          ) : (
                            <button onClick={() => openCorrection(student, 'entry')} className="text-slate-300 hover:text-indigo-600 transition" title="Corrigir horário de entrada">
                              <Pencil size={11} />
                            </button>
                          )}
                        </span>
                      ) : <span className="font-mono font-bold text-slate-300 text-sm">—</span>}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Saída</span>
                      {student.today_exit ? (
                        <span className="flex items-center gap-1.5 font-mono font-bold text-slate-500 text-sm">
                          {student.today_exit.substring(0, 5)}
                          {resolvingCorrectionFor === `${student.id}_exit` ? (
                            <Loader2 size={11} className="animate-spin text-slate-300" />
                          ) : (
                            <button onClick={() => openCorrection(student, 'exit')} className="text-slate-300 hover:text-indigo-600 transition" title="Corrigir horário de saída">
                              <Pencil size={11} />
                            </button>
                          )}
                        </span>
                      ) : <span className="font-mono font-bold text-slate-300 text-sm">—</span>}
                    </div>
                  </div>
                </div>
              );
            })}
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



 


