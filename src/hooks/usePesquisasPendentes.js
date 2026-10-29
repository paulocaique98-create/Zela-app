import { useCallback, useEffect, useState } from 'react';
import { pesquisasAbertas } from '../lib/pesquisas';

// Quantas pesquisas abertas o usuário ainda não respondeu (cartão da Início).
// Só consulta com o módulo ligado; falha vira zero, sem travar a tela.
export function usePesquisasPendentes(ativo) {
  const [pendentes, setPendentes] = useState(0);
  const recarregar = useCallback(() => {
    if (!ativo) { setPendentes(0); return; }
    pesquisasAbertas().then(l => setPendentes(l.filter(p => !p.respondida).length)).catch(() => setPendentes(0));
  }, [ativo]);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { pendentes, recarregar };
}
