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

    // Só escuta chat_threads (UPDATE) — um trigger no banco já atualiza
    // updated_at da thread a cada mensagem nova (ver migration
    // 20260903_add_chat_setores.sql), então o listener de chat_messages era
    // redundante e, pior, não podia ser filtrado por escola (chat_messages
    // não tem coluna school_id, só thread_id) — qualquer mensagem de
    // QUALQUER escola do sistema disparava refresh() em todo mundo.
    //
    // Aqui dá pra filtrar de verdade: family_id pra família, school_id pra
    // admin (ambos são colunas reais de chat_threads). Developer fica sem
    // filtro de propósito — ele atende suporte de VÁRIAS escolas ao mesmo
    // tempo, então não tem um único school_id que sirva de filtro.
    const filter =
      currentUser.role === 'family' ? `family_id=eq.${currentUser.id}` :
      currentUser.role === 'admin' && currentUser.school_id ? `school_id=eq.${currentUser.school_id}` :
      undefined;

    const channel = supabase
      .channel(`chat-unread-${currentUser.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_threads', ...(filter ? { filter } : {}) }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, currentUser?.id, currentUser?.role, currentUser?.school_id, refresh]);

  return { count, refresh };
}
