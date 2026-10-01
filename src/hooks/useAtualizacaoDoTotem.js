import { useEffect, useRef } from 'react';
import { marcarAtividadeDoTotem, tentarAtualizarTotem } from '../lib/atualizacaoDoTotem';

// Atualização automática do Autoatendimento (ver lib/atualizacaoDoTotem.js):
// enquanto o totem está na tela e existe versão nova, confere de tempos em
// tempos se ninguém está usando e recarrega. antesDeRecarregar guarda o que
// precisa voltar aberto depois da recarga (o leitor de rosto ou de QR).

const CONFERIR_A_CADA_MS = 20 * 1000;
const EVENTOS_DE_USO = ['pointerdown', 'touchstart', 'keydown'];

export function useAtualizacaoDoTotem({ ativo, versaoNova, antesDeRecarregar }) {
  const antesRef = useRef(antesDeRecarregar);
  useEffect(() => { antesRef.current = antesDeRecarregar; });

  // Toque ou tecla na tela conta como uso; entrar no Autoatendimento também.
  useEffect(() => {
    if (!ativo) return undefined;
    const marcar = () => marcarAtividadeDoTotem();
    marcar();
    for (const evento of EVENTOS_DE_USO) window.addEventListener(evento, marcar, { passive: true });
    return () => {
      for (const evento of EVENTOS_DE_USO) window.removeEventListener(evento, marcar);
    };
  }, [ativo]);

  useEffect(() => {
    if (!ativo || !versaoNova) return undefined;
    let parado = false;
    let conferindo = false;
    const conferir = async () => {
      if (parado || conferindo) return;
      conferindo = true;
      try {
        await tentarAtualizarTotem({
          continuar: () => !parado,
          antesDeRecarregar: () => antesRef.current?.(),
        });
      } finally {
        conferindo = false;
      }
    };
    conferir();
    const timer = setInterval(conferir, CONFERIR_A_CADA_MS);
    return () => {
      parado = true;
      clearInterval(timer);
    };
  }, [ativo, versaoNova]);
}
