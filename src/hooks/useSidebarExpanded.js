import { useState, useEffect } from 'react';

// Preferência de menu lateral expandido/recolhido -- compartilhada entre os
// 4 portais (mesma chave, já que é uma preferência de exibição, não algo
// específico de cada portal). Trocado de hover automático pra clique
// explícito a pedido do usuário: hover causava o ícone "pular" de posição
// (centralizado quando recolhido, alinhado à esquerda quando expandido) de
// forma imprevisível só por passar o mouse -- ver correção em
// SidebarNav.jsx, que elimina esse pulo de vez.
const STORAGE_KEY = 'zela:sidebarExpanded';
const SYNC_EVENT = 'zela:sidebar-expanded';

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
    // Avisa as outras instâncias do hook (ex.: o Header, que alinha a logo
    // do Zela com a coluna de ícones do menu recolhido).
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: isExpanded }));
  }, [isExpanded]);

  useEffect(() => {
    const onSync = (e) => setIsExpanded(prev => (prev === e.detail ? prev : e.detail));
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const toggle = () => setIsExpanded(prev => !prev);

  return [isExpanded, toggle];
}
