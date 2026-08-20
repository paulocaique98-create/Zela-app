import React, { useEffect, useState } from 'react';
import { UtensilsCrossed, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', weekday: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function FamilyCardapio({ currentUser, currentSchool }) {
  const [activeCardapio, setActiveCardapio] = useState(null);
  const [itens, setItens] = useState([]);
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
        const { data: cardapios, error: fetchError } = await supabase
          .from('cardapios')
          .select('*')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false });
        if (fetchError) throw fetchError;

        // Cardápio "ativo agora": dentro do período de ativação/desativação (ou sem
        // restrição). Entre vários que se encaixem, usa o mais recente.
        const active = (cardapios || []).find(c =>
          (!c.ativacao_date || c.ativacao_date <= todayStr) &&
          (!c.desativacao_date || c.desativacao_date >= todayStr)
        );

        setActiveCardapio(active || null);

        if (active) {
          const { data: itensData, error: itensError } = await supabase
            .from('cardapio_itens')
            .select('*')
            .eq('cardapio_id', active.id)
            .order('event_date', { ascending: true });
          if (itensError) throw itensError;
          setItens(itensData || []);
        } else {
          setItens([]);
        }
      } catch (err) {
        console.error('[FamilyCardapio] Erro ao buscar:', err);
        setError('Não foi possível carregar o cardápio.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolId]);

  // Agrupa por data
  const groups = [];
  let currentDate = null;
  itens.forEach(item => {
    if (item.event_date !== currentDate) {
      groups.push({ date: item.event_date, items: [] });
      currentDate = item.event_date;
    }
    groups[groups.length - 1].items.push(item);
  });

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <UtensilsCrossed size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Cardápio</h2>
          <p className="text-slate-500 text-sm hidden sm:block">
            {activeCardapio ? activeCardapio.titulo : 'Cardápio da escola.'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : !activeCardapio || groups.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <UtensilsCrossed className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhum cardápio ativo no momento.</p>
          </div>
        ) : (
          groups.map(group => {
            const isToday = group.date === todayStr;
            return (
              <div key={group.date} className={`rounded-2xl border p-4 ${isToday ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200'}`}>
                <h3 className={`text-sm font-bold mb-2.5 ${isToday ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {formatDateLabel(group.date)}
                  {isToday && <span className="text-[9px] uppercase font-extrabold bg-indigo-600 text-white px-1.5 py-0.5 rounded-md ml-2 align-middle">Hoje</span>}
                </h3>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.id} className="text-xs">
                      <span className="font-bold text-slate-500">{item.refeicao}: </span>
                      <span className="text-slate-600">{item.descricao}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
