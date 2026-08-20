import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useMenuClicks(userId, schoolId) {
  const [clickCounts, setClickCounts] = useState({});
  // Espelha clickCounts de forma síncrona para evitar "lost update" quando
  // registerClick é chamado duas vezes antes do React re-renderizar (ex: duplo clique
  // rápido) — closures presas ao clickCounts do state calculariam o mesmo valor base.
  const clickCountsRef = useRef({});

  // Carregar contagens ao montar
  useEffect(() => {
    if (!userId) return;
    
    supabase
      .from('user_menu_clicks')
      .select('menu_key, click_count')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao buscar cliques:', error);
          return;
        }
        if (data) {
          const counts = {};
          data.forEach(row => {
            counts[row.menu_key] = row.click_count;
          });
          clickCountsRef.current = counts;
          setClickCounts(counts);
        }
      });
  }, [userId]);

  // Registrar clique e atualizar estado local imediatamente
  const registerClick = useCallback(async (menuKey) => {
    if (!userId || !schoolId) return;

    // Atualizar estado local (e o ref espelho, de forma síncrona) imediatamente
    const newCount = (clickCountsRef.current[menuKey] || 0) + 1;
    clickCountsRef.current = { ...clickCountsRef.current, [menuKey]: newCount };
    setClickCounts(clickCountsRef.current);

    try {
      // Persistir no banco (upsert: incrementar se existir, inserir se não existir)
      const { error } = await supabase
        .from('user_menu_clicks')
        .upsert(
          {
            user_id: userId,
            school_id: schoolId,
            menu_key: menuKey,
            click_count: newCount,
            last_clicked_at: new Date().toISOString()
          },
          { onConflict: 'user_id,menu_key' }
        );

      if (error) {
        console.error('Erro ao registrar clique:', error);
      }
    } catch (err) {
      console.error('Exceção ao registrar clique:', err);
    }
  }, [userId, schoolId]);

  return { clickCounts, registerClick };
}
