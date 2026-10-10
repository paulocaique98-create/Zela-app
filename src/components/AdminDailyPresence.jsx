import React, { useState, useEffect } from 'react';
import { situacaoDoAluno, contarSituacoes, MENSAGEM_VAZIA, GRUPOS_PRESENCA } from '../lib/presencaDiaria';

// Cor do botão ativo de cada grupo.
const COR_DO_GRUPO = {
  presentes: 'text-success',
  solicitacoes: 'text-warning',
  sairam: 'text-on-surface',
  ausentes: 'text-error',
};
import { LogOut, CheckCircle2, Users, RefreshCw, Pencil, Loader2, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import AttendanceEditTodayModal from './AttendanceEditTodayModal';

const STATUS_CONFIG = {
  in_school:      { label: 'Na escola',        cls: 'bg-success/15 text-success', icon: <CheckCircle2 size={12}/> },
  left:           { label: 'Já saiu',          cls: 'bg-ink text-on-surface-variant/50', icon: <LogOut size={12}/> },
  absent:         { label: 'Ausente',          cls: 'bg-error/15 text-error',     icon: null },
  pending_entry:  { label: 'Entrada solicitada', cls: 'bg-brass-50 text-warning', icon: null },
  pending_exit:   { label: 'Saída solicitada',   cls: 'bg-brass-50 text-warning', icon: null },
  // Aluno matriculado que hoje não está na escola, não saiu e não tem
  // nenhuma solicitação em aberto -- pro contexto de Presença Diária isso É
  // um ausente (mesmo sem a família ter marcado "Não irá hoje" no app),
  // então usa o mesmo rótulo/estilo de 'absent' em vez de "Pendente de
  // Check-in" (rótulo que só faz sentido pro responsável, na Família).
  idle:           { label: 'Ausente',          cls: 'bg-error/15 text-error',     icon: null },
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
  // Presentes (na escola ou com solicitação em aberto), Já saíram e
  // Ausentes: cada aluno em um grupo só (src/lib/presencaDiaria.js).
  const [statusFilter, setStatusFilter] = useState('presentes');
  const [allStudents, setAllStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [correctionTarget, setCorrectionTarget] = useState(null); // { student, entryLog, exitLog }
  const [resolvingCorrectionFor, setResolvingCorrectionFor] = useState(null); // studentId
  const [turmaMenuOpen, setTurmaMenuOpen] = useState(false);

  const fetchPresence = async () => {
    setIsLoading(true);
    try {
      // Busca TODOS os alunos matriculados na escola, inclusive quem ainda
      // não teve nenhuma movimentação hoje ('idle') -- esses contam como
      // Ausentes nesta tela (ver STATUS_CONFIG.idle), não somem da lista.
      const { data, error } = await supabase
        .from('students')
        .select('id, name, status, turma, contracted_hours, contracted_entry_time, contracted_exit_time, weekly_schedule, isento_hora_extra, today_entry, today_exit, today_entry_at, today_exit_at, family_id')
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
  // attendance_logs), então não tem o id dos logs à mão — busca os dois
  // (entrada e saída de hoje) sob demanda, só quando o admin clica em
  // "Editar horário". Um único botão agora cobre os dois lados (ver
  // AttendanceEditTodayModal) -- se um lado não tiver log nenhum, o modal já
  // trata como lançamento novo, não como correção.
  const openCorrection = async (student) => {
    setResolvingCorrectionFor(student.id);
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id, event_type, event_time, corrected')
        .eq('student_id', student.id)
        .gte('event_time', todayStart.toISOString())
        .lte('event_time', todayEnd.toISOString())
        .order('event_time', { ascending: true });
      if (error) throw error;
      const entryLog = (data || []).find(l => l.event_type === 'entry') || null;
      const exitLog = [...(data || [])].reverse().find(l => l.event_type === 'exit') || null;
      setCorrectionTarget({ student, entryLog, exitLog });
    } catch (err) {
      console.error('Erro ao localizar registros de hoje:', err);
    } finally {
      setResolvingCorrectionFor(null);
    }
  };

  // Filtra por turma selecionada + grupo (Presentes / Já saíram / Ausentes)
  const displayed = allStudents
    .filter(s => selectedTurma === 'Todas as Turmas' || s.turma === selectedTurma)
    .filter(s => situacaoDoAluno(s.status) === statusFilter);

  // Contagem de cada grupo (regras em src/lib/presencaDiaria.js).
  const contagem = contarSituacoes(allStudents);

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-2xl md:rounded-none shadow-none sm:shadow-sm md:shadow-none border-0 sm:border sm:border-outline-variant md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header -- título "Presença Diária" e ícone removidos (o Header do
          app já mostra o nome da tela dinamicamente); só a data, direto. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <p className="text-[13px] sm:text-sm text-on-surface-variant whitespace-nowrap overflow-x-auto w-full text-center sm:w-auto">
          {(() => {
            const weekday = new Date().toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0];
            return weekday.charAt(0).toUpperCase() + weekday.slice(1);
          })()} · {new Date().toLocaleDateString('pt-BR')}
          {lastUpdate && <span className="text-on-surface-variant/70"> · Atualizado em {lastUpdate}</span>}
        </p>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={fetchPresence}
            disabled={isLoading}
            className="flex flex-1 sm:flex-none justify-center items-center gap-2 text-sm font-bold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/40 px-4 py-2 rounded-xl transition disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''}/> <span className="hidden sm:inline">Atualizar</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setTurmaMenuOpen(o => !o)}
              className="flex items-center gap-2 text-sm font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high border border-outline-variant px-3.5 py-2 rounded-xl transition"
            >
              <SlidersHorizontal size={15} />
              <span className="hidden sm:inline">{selectedTurma}</span>
            </button>
            {turmaMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTurmaMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 max-w-[85vw] bg-white border border-outline-variant rounded-2xl shadow-lg z-20 p-1.5">
                  {turmaOptions.map(turma => (
                    <button
                      key={turma}
                      onClick={() => { setSelectedTurma(turma); setTurmaMenuOpen(false); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-bold text-left transition ${
                        selectedTurma === turma ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                      }`}
                    >
                      <span className="truncate">{turma}</span>
                      {turma !== 'Todas as Turmas' && (
                        <span className="shrink-0 text-[10px] bg-surface-container text-on-surface-variant rounded-sm px-1.5 py-0.5">
                          {allStudents.filter(s => s.turma === turma).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quatro botões no lugar da frase com os números (30/09/2026): cada um
          mostra a contagem e filtra a lista. No celular, número embaixo do
          nome, pra caber numa linha só. */}
      <div className="grid grid-cols-4 bg-surface-container rounded-xl p-1 gap-1 mb-5 shrink-0">
        {GRUPOS_PRESENCA.map(grupo => (
          <button
            key={grupo.id}
            onClick={() => setStatusFilter(grupo.id)}
            className={`min-w-0 px-1 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-sm font-bold transition flex flex-col sm:flex-row items-center justify-center sm:gap-1 ${
              statusFilter === grupo.id ? `bg-white shadow-sm ${COR_DO_GRUPO[grupo.id]}` : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="truncate max-w-full">{grupo.rotulo}</span>
            <span className="text-xs opacity-70">({contagem[grupo.id]})</span>
          </button>
        ))}
      </div>

      {/* Lista de alunos - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-surface-container-low rounded-2xl border border-dashed border-outline-variant">
            <Users className="h-10 w-10 text-on-surface-variant/50 mb-3"/>
            <p className="text-on-surface-variant font-medium text-sm">
            {selectedTurma === 'Todas as Turmas' ? MENSAGEM_VAZIA[statusFilter] : `${selectedTurma}: ${MENSAGEM_VAZIA[statusFilter]}`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-1">
            {displayed.map(student => {
              const cfg = STATUS_CONFIG[student.status] || STATUS_CONFIG.idle;
              return (
                <div key={student.id} className="flex flex-col gap-2.5 border border-outline-variant rounded-2xl bg-white shadow-sm p-3.5 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 border border-primary/30">
                      <span className="text-primary font-bold text-xs">
                        {student.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-bold text-on-surface text-sm min-w-0 break-words">{student.name}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold min-w-0 truncate">
                      {student.turma || '—'}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md shrink-0 ${cfg.cls}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>

                  <div className="flex items-end justify-between gap-2 pt-2 border-t border-dashed border-outline-variant">
                    <div className="flex gap-5 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-bold text-on-surface-variant/70">Entrada</span>
                        <span className="font-mono font-bold text-primary text-sm">
                          {student.today_entry ? student.today_entry.substring(0, 5) : <span className="text-on-surface-variant/50">—</span>}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-bold text-on-surface-variant/70">Saída</span>
                        <span className="font-mono font-bold text-on-surface-variant text-sm">
                          {student.today_exit ? student.today_exit.substring(0, 5) : <span className="text-on-surface-variant/50">—</span>}
                        </span>
                      </div>
                    </div>
                    {/* Botão único -- substitui os dois lápis separados de
                        Entrada/Saída. Abre um modal só, com os dois horários
                        juntos (ver AttendanceEditTodayModal). */}
                    {resolvingCorrectionFor === student.id ? (
                      <Loader2 size={13} className="animate-spin text-on-surface-variant/50 shrink-0" />
                    ) : (
                      <button
                        onClick={() => openCorrection(student)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/40 px-2.5 py-1.5 rounded-lg transition shrink-0"
                        title="Editar horário de entrada e/ou saída de hoje"
                      >
                        <Pencil size={12} /> Editar horário
                      </button>
                    )}
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
          currentUser={currentUser}
          billingConfig={currentSchool?.billing_config}
          onClose={() => setCorrectionTarget(null)}
          onSaved={() => { setCorrectionTarget(null); fetchPresence(); }}
        />
      )}
    </div>
  );
}



 


