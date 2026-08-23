import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EVENTO_TIPOS } from '../lib/constants';

const TIPO_BY_VALUE = Object.fromEntries(EVENTO_TIPOS.map(t => [t.value, t]));

const COLOR_CLASSES = {
  slate: 'bg-surface-container text-on-surface-variant border-outline-variant',
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  indigo: 'bg-primary/10 text-primary border-primary/20',
  green: 'bg-green-50 text-green-700 border-green-200',
};

function formatDayMonth(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return { day: d.toLocaleDateString('pt-BR', { day: '2-digit' }), weekday: d.toLocaleDateString('pt-BR', { weekday: 'short' }) };
}

function formatMonthLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function FamilyCalendario({ currentUser, currentSchool }) {
  const [eventos, setEventos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const schoolId = currentSchool?.id || currentUser?.school_id;
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  useEffect(() => {
    const load = async () => {
      if (!schoolId) return;
      setIsLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('eventos_calendario')
          .select('*')
          .eq('school_id', schoolId)
          .gte('event_date', todayStr)
          .order('event_date', { ascending: true });

        if (fetchError) throw fetchError;
        setEventos(data || []);
      } catch (err) {
        console.error('[FamilyCalendario] Erro ao buscar:', err);
        setError('Não foi possível carregar os eventos.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolId]);

  // Agrupa por mês pra facilitar a leitura
  const groups = [];
  let currentMonthKey = null;
  eventos.forEach(ev => {
    const monthKey = ev.event_date.slice(0, 7);
    if (monthKey !== currentMonthKey) {
      groups.push({ monthKey, label: formatMonthLabel(ev.event_date), items: [] });
      currentMonthKey = monthKey;
    }
    groups[groups.length - 1].items.push(ev);
  });

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <CalendarDays size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Calendário Escolar</h2>
          <p className="text-on-surface-variant text-small hidden sm:block">Próximos eventos, feriados e reuniões da escola.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <CalendarDays className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum evento futuro cadastrado.</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.monthKey}>
              <h3 className="text-[11px] font-extrabold text-on-surface-variant/70 uppercase tracking-wider mb-3">{group.label}</h3>
              <div className="space-y-2">
                {group.items.map(ev => {
                  const tipo = TIPO_BY_VALUE[ev.event_type] || TIPO_BY_VALUE.geral;
                  const { day, weekday } = formatDayMonth(ev.event_date);
                  const isToday = ev.event_date === todayStr;
                  return (
                    <div key={ev.id} className={`flex gap-3 p-3 sm:p-4 rounded-zela-lg border ${isToday ? 'border-primary/40 bg-primary/5' : 'border-outline-variant'}`}>
                      <div className={`shrink-0 w-14 h-14 rounded-zela-md flex flex-col items-center justify-center ${isToday ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface'}`}>
                        <span className="text-lg font-black leading-none">{day}</span>
                        <span className="text-[9px] uppercase font-bold">{weekday}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-on-surface text-sm">{ev.title}</h4>
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${COLOR_CLASSES[tipo.color]}`}>
                            {tipo.label}
                          </span>
                        </div>
                        {ev.description && (
                          <p className="text-on-surface-variant text-xs mt-1 whitespace-pre-wrap">{ev.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
