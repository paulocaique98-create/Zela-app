import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Tour guiado: abre sozinho só no primeiro acesso do perfil. Ao concluir ou
// pular, grava o "já viu" em tour_visto e nunca mais abre sozinho. O botão
// "Refazer o tour" da Central de Ajuda reabre sob demanda. Se a leitura
// falhar, o tour não abre (melhor não incomodar do que repetir).
export function useTourGuiado(userId, schoolId, perfil) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!userId || !perfil) return undefined;
    let cancelado = false;
    supabase
      .from('tour_visto')
      .select('tour_id')
      .eq('user_id', userId)
      .eq('tour_id', perfil)
      .limit(1)
      .then(({ data, error }) => {
        if (!cancelado && !error && Array.isArray(data) && data.length === 0) setAberto(true);
      });
    return () => { cancelado = true; };
  }, [userId, perfil]);

  const fechar = useCallback(async () => {
    setAberto(false);
    if (!userId || !perfil) return;
    await supabase
      .from('tour_visto')
      .upsert(
        { user_id: userId, school_id: schoolId || null, tour_id: perfil, visto_em: new Date().toISOString() },
        { onConflict: 'user_id,tour_id' },
      );
  }, [userId, schoolId, perfil]);

  const refazer = useCallback(() => setAberto(true), []);

  return { aberto, fechar, refazer };
}
