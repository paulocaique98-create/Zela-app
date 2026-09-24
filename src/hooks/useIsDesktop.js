import { useState, useEffect } from 'react';

// Breakpoint md do Tailwind (768px) -- usado pra saber se o menu lateral
// colapsável está realmente em modo "ícone só" (desktop) ou se é a versão
// mobile em tela cheia, onde o colapso não se aplica visualmente mesmo que
// a preferência salva seja "recolhido".
const QUERY = '(min-width: 768px)';

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    try {
      return window.matchMedia(QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mql;
    try {
      mql = window.matchMedia(QUERY);
    } catch {
      return undefined;
    }
    const onChange = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
