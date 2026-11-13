import { useCallback, useEffect, useRef, useState } from 'react';
import { lerConfig, deveEntrarEmRepouso } from '../lib/energiaDoTotem';

// Repouso (tela preta) do menu do Autoatendimento. O leitor de rosto já tem o
// seu próprio repouso (AdminFaceScanner), mas depois de um check-in/out o totem
// volta a este menu, onde a câmera já está desligada — sem isto a tela ficava
// acesa o tempo todo. Usa o mesmo tempo configurado no aparelho
// (energiaDoTotem). Acorda por toque/tecla; sem câmera, sem custo de calor.
//
// ativo: menu visível e nenhum leitor/modal aberto. Ao voltar a ficar ativo
// (ex.: fim de um check-in) a contagem recomeça do zero.
const CONFERIR_A_CADA_MS = 5000;

export function useRepousoDoMenu(ativo) {
  const [repouso, setRepouso] = useState(false);
  const ultimaAtividadeRef = useRef(Date.now());

  useEffect(() => {
    ultimaAtividadeRef.current = Date.now();
    setRepouso(false);
    if (!ativo) return undefined;
    const marcar = () => { ultimaAtividadeRef.current = Date.now(); };
    document.addEventListener('pointerdown', marcar, true);
    document.addEventListener('keydown', marcar, true);
    const id = setInterval(() => {
      if (deveEntrarEmRepouso({
        agora: Date.now(),
        ultimaAtividadeEm: ultimaAtividadeRef.current,
        config: lerConfig(),
      })) setRepouso(true);
    }, CONFERIR_A_CADA_MS);
    return () => {
      document.removeEventListener('pointerdown', marcar, true);
      document.removeEventListener('keydown', marcar, true);
      clearInterval(id);
    };
  }, [ativo]);

  const acordar = useCallback(() => {
    ultimaAtividadeRef.current = Date.now();
    setRepouso(false);
  }, []);

  return { repouso: ativo && repouso, acordar };
}
