import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Parcelas que o Zela cobra da escola (minhas_parcelas_zela). Só leitura.
// undefined = carregando, null = falha, lista = ok. Recarrega ao voltar o foco,
// para a parcela aparecer como paga logo depois que o webhook confirma.
export default function useAssinaturaZela() {
  const [parcelas, setParcelas] = useState(undefined);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('minhas_parcelas_zela');
    setParcelas(error ? null : (Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    carregar();
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [carregar]);

  return { parcelas, recarregar: carregar };
}
