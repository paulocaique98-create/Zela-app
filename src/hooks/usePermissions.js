import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Permissões configuráveis (Gestão · Permissões). Pergunta ao servidor
// (has_permission) quais das permissões informadas o usuário logado tem.
// Só controla o que aparece na tela; quem barra de verdade é a RLS.
export const GESTAO_MODULE_PERMISSIONS = [
  'despesas.ver', 'despesas.gerenciar', 'fornecedores.gerenciar', 'financeiro.baixa_manual',
  'contratos.ver', 'contratos.gerenciar', 'relatorios.financeiro.ver',
];

export function usePermissions(currentUser, permissions = GESTAO_MODULE_PERMISSIONS) {
  const [granted, setGranted] = useState({});
  const key = permissions.join(',');

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    const list = key.split(',');
    Promise.all(list.map(p => supabase.rpc('has_permission', { p_permission: p })))
      .then(results => {
        if (!active) return;
        const map = {};
        list.forEach((p, i) => { map[p] = results[i].data === true; });
        setGranted(map);
      });
    return () => { active = false; };
  }, [currentUser?.id, key]);

  return granted;
}
