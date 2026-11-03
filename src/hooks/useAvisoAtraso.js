import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const INTERVALO_MS = 5 * 60 * 1000;

// Aviso de atraso antes do bloqueio. Lido do servidor (meu_aviso_atraso), que decide
// por perfil e escola o que devolver. Nulo quando não há atraso: o aviso some sozinho
// na próxima consulta depois que o webhook confirma o pagamento.
export default function useAvisoAtraso(ativo) {
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (!ativo) { setAviso(null); return undefined; }
    let vivo = true;
    const carregar = async () => {
      const { data, error } = await supabase.rpc('meu_aviso_atraso');
      if (vivo && !error) setAviso(data || null);
    };
    carregar();
    const timer = setInterval(carregar, INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { vivo = false; clearInterval(timer); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [ativo]);

  return aviso;
}
