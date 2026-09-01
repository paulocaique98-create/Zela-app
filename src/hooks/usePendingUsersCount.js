import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Conta quantos responsáveis (autocadastro público) estão com
// status='pending' aguardando aprovação do admin — hoje só descoberto
// entrando manualmente em Usuários > Pendentes. Mesmo padrão de
// useChatUnreadCount.js: contagem inicial + realtime na tabela `users`
// filtrado por school_id.
export function usePendingUsersCount(currentUser) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (currentUser?.role !== 'admin' || !currentUser?.school_id) {
      setCount(0);
      return;
    }
    try {
      const { count: pendingCount, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', currentUser.school_id)
        .eq('role', 'family')
        .eq('status', 'pending');
      if (error) throw error;
      setCount(pendingCount || 0);
    } catch (err) {
      console.warn('[usePendingUsersCount] Erro ao contar pendentes:', err);
    }
  }, [currentUser?.role, currentUser?.school_id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (currentUser?.role !== 'admin' || !currentUser?.school_id) return;

    const channel = supabase
      .channel(`pending-users-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `school_id=eq.${currentUser.school_id}` }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.role, currentUser?.school_id, refresh]);

  return { count, refresh };
}
