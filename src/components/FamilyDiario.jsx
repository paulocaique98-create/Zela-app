import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRefeicaoTexto, formatSonoTexto, formatEvacuacaoTexto } from '../lib/diarioUtils';

function formatDateCard(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase()).replace('-feira', ''),
    day: d.toLocaleDateString('pt-BR', { day: '2-digit' }),
    month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase()),
  };
}

export default function FamilyDiario({ familyStudents }) {
  const students = familyStudents || [];
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedStudentId && students.length > 0) setSelectedStudentId(students[0].id);
  }, [students]);

  useEffect(() => {
    const load = async () => {
      if (!selectedStudentId) return;
      setIsLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('diario_entries')
          .select('*')
          .eq('student_id', selectedStudentId)
          .order('entry_date', { ascending: false })
          .limit(30);
        if (fetchError) throw fetchError;
        setEntries(data || []);
        setSelectedDate(data?.[0]?.entry_date || null);
      } catch (err) {
        console.error('[FamilyDiario] Erro ao carregar:', err);
        setError('Não foi possível carregar o diário.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedStudentId]);

  const selectedEntry = useMemo(() => entries.find(e => e.entry_date === selectedDate) || null, [entries, selectedDate]);

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <BookOpen size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Diário</h2>
          <p className="text-on-surface-variant text-small hidden sm:block">Acompanhe o dia a dia do seu filho(a) na escola.</p>
        </div>
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
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant/70">
              <BookOpen className="mx-auto h-12 w-12 text-outline-variant mb-3" />
              <p className="text-sm font-semibold text-on-surface-variant">Nenhum registro de diário ainda.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
                {entries.map(entry => {
                  const { weekday, day, month } = formatDateCard(entry.entry_date);
                  const isSelected = entry.entry_date === selectedDate;
                  return (
                    <button
                      key={entry.entry_date}
                      onClick={() => setSelectedDate(entry.entry_date)}
                      className={`shrink-0 w-20 h-24 rounded-zela-lg flex flex-col items-center justify-center gap-0.5 transition-all ${isSelected ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-white border border-outline-variant text-primary/40 hover:border-indigo-300'}`}
                    >
                      <span className="text-xs font-semibold">{weekday}</span>
                      <span className="text-2xl font-bold">{day}</span>
                      <span className="text-[11px] font-medium">{month}</span>
                    </button>
                  );
                })}
              </div>

              {selectedEntry && (
                <div className="flex flex-col">
                  {(selectedEntry.refeicoes || []).map((r, idx) => (
                    <div key={r.refeicao} className="py-4 border-b border-surface-container-low">
                      <div className="text-[13px] text-on-surface-variant/70 mb-1.5">{idx + 1}ª Refeição</div>
                      <div className="text-[15px] font-bold text-on-surface mb-0.5">{r.refeicao}:</div>
                      <div className="text-[15px] text-on-surface-variant leading-relaxed">{formatRefeicaoTexto(r)}</div>
                    </div>
                  ))}

                  {formatSonoTexto(selectedEntry.sono_inicio, selectedEntry.sono_fim) && (
                    <div className="py-4 border-b border-surface-container-low">
                      <div className="text-[13px] text-on-surface-variant/70 mb-1.5">Sono</div>
                      <div className="text-[15px] text-on-surface">{formatSonoTexto(selectedEntry.sono_inicio, selectedEntry.sono_fim)}</div>
                    </div>
                  )}

                  {formatEvacuacaoTexto(selectedEntry.evacuou) && (
                    <div className="py-4 border-b border-surface-container-low">
                      <div className="text-[13px] text-on-surface-variant/70 mb-1.5">Evacuação</div>
                      <div className="text-[15px] text-on-surface">{formatEvacuacaoTexto(selectedEntry.evacuou)}</div>
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
