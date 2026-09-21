import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Existe pelo menos 1 registro em system_updates que este usuário (admin ou
// developer) ainda não leu (sem linha correspondente em
// system_update_reads)? Vira o badge (um "•", nunca um número -- pedido
// explícito) no menu Sistema > Atualizações. Mesmo padrão de
// usePendingUsersCount.js: contagem inicial + realtime.
export function useUnreadSystemUpdates(currentUser) {
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentUser?.id || !['admin', 'developer'].includes(currentUser?.role)) {
      setHasUnread(false);
      return;
    }
    try {
      const [{ data: allUpdates, error: updatesError }, { data: myReads, error: readsError }] = await Promise.all([
        supabase.from('system_updates').select('id'),
        supabase.from('system_update_reads').select('update_id').eq('user_id', currentUser.id),
      ]);
      if (updatesError) throw updatesError;
      if (readsError) throw readsError;

      const readIds = new Set((myReads || []).map(r => r.update_id));
      setHasUnread((allUpdates || []).some(u => !readIds.has(u.id)));
    } catch (err) {
      console.warn('[useUnreadSystemUpdates] Erro ao checar atualizações:', err);
    }
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime só em system_updates (uma publicação nova) -- não precisa
  // escutar system_update_reads: quando o próprio usuário lê, a tela
  // AdminSystemUpdates já sai do ar (unmount) antes de importar de novo.
  useEffect(() => {
    if (!currentUser?.id || !['admin', 'developer'].includes(currentUser?.role)) return;

    const channel = supabase
      .channel(`system-updates-${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_updates' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.role, refresh]);

  return { hasUnread, refresh };
}
