import { useState, useEffect } from 'react';

// Preferência de menu lateral expandido/recolhido -- compartilhada entre os
// 4 portais (mesma chave, já que é uma preferência de exibição, não algo
// específico de cada portal). Trocado de hover automático pra clique
// explícito a pedido do usuário: hover causava o ícone "pular" de posição
// (centralizado quando recolhido, alinhado à esquerda quando expandido) de
// forma imprevisível só por passar o mouse -- ver correção em
// SidebarNav.jsx, que elimina esse pulo de vez.
const STORAGE_KEY = 'zela:sidebarExpanded';

export function useSidebarExpanded() {
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isExpanded));
    } catch {
      // localStorage indisponível (aba anônima, etc.) -- só não persiste, não quebra nada.
    }
  }, [isExpanded]);

  const toggle = () => setIsExpanded(prev => !prev);

  return [isExpanded, toggle];
}
