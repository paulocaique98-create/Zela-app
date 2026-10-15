import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listSaidasPendentes } from '../lib/saidasPendentes';

// Quantos alunos de ontem ficaram sem saída (badge do menu). Recalcula quando
// uma correção da escola muda (lançar saída gera linha em attendance_corrections)
// e a cada 5 minutos. Falha em silêncio: o badge some, a tela segue funcionando.
export function useSaidasPendentesCount(schoolId, enabled = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!schoolId || !enabled) { setCount(0); return undefined; }
    let cancelled = false;

    const refresh = async () => {
      try {
        const rows = await listSaidasPendentes(null);
        if (!cancelled) setCount(rows.filter(r => !r.awaiting_approval).length);
      } catch {
        if (!cancelled) setCount(0);
      }
    };
    refresh();

    const timer = setInterval(refresh, 5 * 60 * 1000);
    const channel = supabase
      .channel(`saidas-pendentes-badge-${schoolId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_corrections', filter: `school_id=eq.${schoolId}` }, refresh)
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [schoolId, enabled]);

  return count;
}
