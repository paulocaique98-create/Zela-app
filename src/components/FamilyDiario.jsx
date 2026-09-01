import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Loader2, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRefeicaoTexto, formatSonoTexto, formatEvacuacaoTexto } from '../lib/diarioUtils';

const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

function formatDateCard(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase()).replace('-feira', ''),
    day: d.toLocaleDateString('pt-BR', { day: '2-digit' }),
    month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase()),
  };
}

// Dias úteis do mês (YYYY-MM) — a escola não funciona fim de semana, então
// não faz sentido lançar/exibir diário nesses dias. Sem incluir dias
// futuros — não faz sentido mostrar/selecionar um dia que ainda não aconteceu.
function buildMonthDays(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const today = todayStr();
  const days = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    if (dateStr > today) break;
    const dow = new Date(year, month - 1, d).getDay(); // 0=domingo, 6=sábado
    if (dow === 0 || dow === 6) continue;
    days.push(dateStr);
  }
  return days;
}

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function FamilyDiario({ currentUser, currentSchool, familyStudents }) {
  const students = familyStudents || [];
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [feriados, setFeriados] = useState(new Map()); // event_date -> title
  const [selectedMonth, setSelectedMonth] = useState(todayStr().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedStudentId && students.length > 0) setSelectedStudentId(students[0].id);
  }, [students]);

  const monthDays = useMemo(() => buildMonthDays(selectedMonth), [selectedMonth]);
  const isCurrentMonth = selectedMonth === todayStr().slice(0, 7);

  const changeMonth = (delta) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    const newMonth = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    if (newMonth > todayStr().slice(0, 7)) return; // sem meses futuros
    setSelectedMonth(newMonth);
  };

  useEffect(() => {
    const load = async () => {
      if (!selectedStudentId || !selectedMonth) return;
      setIsLoading(true);
      setError('');
      try {
        const [year, month] = selectedMonth.split('-').map(Number);
        const monthStart = `${year}-${pad2(month)}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
        const [entriesRes, feriadosRes] = await Promise.all([
          supabase
            .from('diario_entries')
            .select('*')
            .eq('student_id', selectedStudentId)
            .gte('entry_date', monthStart)
            .lte('entry_date', monthEnd)
            .order('entry_date', { ascending: true }),
          schoolId
            ? supabase
                .from('eventos_calendario')
                .select('event_date, title')
                .eq('school_id', schoolId)
                .eq('event_type', 'feriado')
                .gte('event_date', monthStart)
                .lte('event_date', monthEnd)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (entriesRes.error) throw entriesRes.error;
        if (feriadosRes.error) throw feriadosRes.error;
        setEntries(entriesRes.data || []);
        setFeriados(new Map((feriadosRes.data || []).map(ev => [ev.event_date, ev.title])));
        const days = buildMonthDays(selectedMonth);
        setSelectedDate(prev => (days.includes(prev) ? prev : days[days.length - 1] || null));
      } catch (err) {
        console.error('[FamilyDiario] Erro ao carregar:', err);
        setError('Não foi possível carregar o diário.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedStudentId, selectedMonth, schoolId]);

  const selectedEntry = useMemo(() => entries.find(e => e.entry_date === selectedDate) || null, [entries, selectedDate]);
  const hasAnyDataThisEntry = selectedEntry && (
    (selectedEntry.refeicoes || []).length > 0 ||
    selectedEntry.sono_inicio ||
    selectedEntry.evacuou !== null ||
    selectedEntry.observacoes
  );

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <BookOpen size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Diário</h2>
            <p className="text-on-surface-variant text-small hidden sm:block">Acompanhe o dia a dia do seu filho(a) na escola.</p>
          </div>
        </div>
        {students.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => changeMonth(-1)} className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg transition" title="Mês anterior">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-on-surface w-32 text-center">{formatMonthLabel(selectedMonth)}</span>
            <button onClick={() => changeMonth(1)} disabled={isCurrentMonth} className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition" title="Próximo mês">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {students.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-on-surface-variant/70">
          <BookOpen className="mx-auto h-12 w-12 text-outline-variant mb-3" />
          <p className="text-sm font-semibold text-on-surface-variant">Nenhum aluno vinculado a esta conta ainda.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {students.length > 1 && (
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><User size={12} /> Aluno</label>
              <select
                value={selectedStudentId || ''}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-bold text-on-surface text-sm"
              >
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {[...monthDays].reverse().map(dateStr => {
                  const { weekday, day, month } = formatDateCard(dateStr);
                  const isSelected = dateStr === selectedDate;
                  const temLancamento = entries.some(e => e.entry_date === dateStr);
                  const feriadoTitulo = feriados.get(dateStr);
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      title={feriadoTitulo || undefined}
                      className={`shrink-0 w-16 h-20 rounded-zela-lg flex flex-col items-center justify-center gap-0.5 transition-all relative ${isSelected ? 'bg-primary text-white shadow-lg shadow-primary/25' : feriadoTitulo ? 'bg-red-50 border border-red-200 text-red-600 hover:border-red-300' : temLancamento ? 'bg-white border border-outline-variant text-primary/40 hover:border-indigo-300' : 'bg-surface-container-low border border-dashed border-outline-variant text-on-surface-variant/40 hover:border-indigo-300'}`}
                    >
                      <span className="text-[11px] font-semibold">{weekday}</span>
                      <span className="text-xl font-bold">{day}</span>
                      <span className="text-[10px] font-medium">{month}</span>
                      {temLancamento && !isSelected && <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${feriadoTitulo ? 'bg-red-500' : 'bg-primary'}`} />}
                    </button>
                  );
                })}
              </div>

              {!selectedEntry || !hasAnyDataThisEntry ? (
                <div className="text-center py-16 text-on-surface-variant/70">
                  <BookOpen className="mx-auto h-12 w-12 text-outline-variant mb-3" />
                  {feriados.get(selectedDate) ? (
                    <>
                      <p className="text-sm font-bold text-red-600">Feriado · {feriados.get(selectedDate)}</p>
                      <p className="text-xs text-on-surface-variant/70 mt-1">Sem aula, sem lançamento nesse dia.</p>
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-on-surface-variant">Nenhum lançamento pra esse dia.</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col">
                  {(selectedEntry.refeicoes || []).map((r, idx) => (
                    <div key={r.refeicao} className="py-4 border-b border-surface-container-low">
                      <div className="text-[13px] text-on-surface-variant/70 mb-1.5">{idx + 1}ª Refeição</div>
                      <div className="text-[15px] font-bold text-on-surface mb-0.5">{r.refeicao}:</div>
                      <div className="text-[15px] text-on-surface-variant leading-relaxed whitespace-pre-line">{formatRefeicaoTexto(r)}</div>
                    </div>
                  ))}

                  {formatSonoTexto(selectedEntry.sono_inicio, selectedEntry.sono_fim) && (
                    <div className="py-4 border-b border-surface-container-low">
                      <div className="text-[13px] text-on-surface-variant/70 mb-1.5">Sono</div>
                      <div className="text-[15px] text-on-surface">{formatSonoTexto(selectedEntry.sono_inicio, selectedEntry.sono_fim)}</div>
                    </div>
                  )}

                  {formatEvacuacaoTexto(selectedEntry.evacuou, selectedEntry.aparencia_evacuacao) && (
                    <div className="py-4 border-b border-surface-container-low">
                      <div className="text-[13px] text-on-surface-variant/70 mb-1.5">Evacuação</div>
                      <div className="text-[15px] text-on-surface">{formatEvacuacaoTexto(selectedEntry.evacuou, selectedEntry.aparencia_evacuacao)}</div>
                    </div>
                  )}

                  {selectedEntry.observacoes && (
                    <div className="py-4">
                      <div className="text-[13px] text-on-surface-variant/70 mb-1.5">Observações</div>
                      <div className="text-[15px] text-on-surface-variant leading-relaxed">{selectedEntry.observacoes}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
