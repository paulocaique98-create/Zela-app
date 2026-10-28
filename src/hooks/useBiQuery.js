import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// Chama uma RPC bi_* e guarda o resultado em memória por 5 minutos.
// A chave inclui usuário e escola: o cache nunca atravessa uma troca de login.
// Uma resposta antiga (filtro mudou no meio) é descartada e a requisição é cancelada.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export function limparCacheBi() {
  cache.clear();
}

export function useBiQuery(funcao, params, { chave, habilitado = true } = {}) {
  const [estado, setEstado] = useState({ dados: null, carregando: habilitado, erro: null, atualizadoEm: null });
  const [tentativa, setTentativa] = useState(0);
  const forcar = useRef(false);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    if (!habilitado) {
      setEstado({ dados: null, carregando: false, erro: null, atualizadoEm: null });
      return undefined;
    }
    const chaveCompleta = `${chave}|${funcao}|${paramsKey}`;
    const emCache = cache.get(chaveCompleta);
    if (!forcar.current && emCache && Date.now() - emCache.t < TTL_MS) {
      setEstado({ dados: emCache.dados, carregando: false, erro: null, atualizadoEm: emCache.t });
      return undefined;
    }
    forcar.current = false;

    const controle = new AbortController();
    setEstado(e => ({ ...e, carregando: true, erro: null }));
    supabase.rpc(funcao, JSON.parse(paramsKey)).abortSignal(controle.signal).then(({ data, error }) => {
      if (controle.signal.aborted) return;
      if (error) {
        setEstado({ dados: null, carregando: false, erro: error.message || 'Não foi possível carregar.', atualizadoEm: null });
        return;
      }
      const t = Date.now();
      cache.set(chaveCompleta, { dados: data, t });
      setEstado({ dados: data, carregando: false, erro: null, atualizadoEm: t });
    });
    return () => controle.abort();
  }, [funcao, paramsKey, chave, habilitado, tentativa]);

  const recarregar = useCallback(() => {
    forcar.current = true;
    setTentativa(n => n + 1);
  }, []);

  return { ...estado, recarregar };
}
