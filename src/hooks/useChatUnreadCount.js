import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Conta quantas conversas do chat têm mensagem nova não lida pelo usuário
// atual. A RLS de chat_threads já resolve sozinha o que cada papel pode ver
// (família = só as próprias threads; admin = só o setor dele, ou tudo se tiver
// visibilidade total; developer = só suporte_zela) — aqui só comparamos
// updated_at contra o timestamp de "última leitura" de cada thread.
export function useChatUnreadCount(currentUser, enabled) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !currentUser?.id) {
      setCount(0);
      return;
    }
    try {
      const isFamily = currentUser.role === 'family';
      const readColumn = isFamily ? 'family_last_read_at' : 'staff_last_read_at';
      const filterColumn = isFamily ? 'family_id' : null;

      let query = supabase.from('chat_threads').select(`id, updated_at, ${readColumn}`);
      if (filterColumn) query = query.eq(filterColumn, currentUser.id);

      const { data, error } = await query;
      if (error) throw error;

      const unread = (data || []).filter(t => {
        const lastRead = t[readColumn];
        return !lastRead || new Date(t.updated_at) > new Date(lastRead);
      }).length;
      setCount(unread);
    } catch (err) {
      console.warn('[useChatUnreadCount] Erro ao contar não lidas:', err);
    }
  }, [enabled, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !currentUser?.id) return;
    const channel = supabase
      .channel(`chat-unread-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_threads' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, currentUser?.id, refresh]);

  return { count, refresh };
}
