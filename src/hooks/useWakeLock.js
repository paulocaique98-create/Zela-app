import { useEffect, useRef } from 'react';

// Mantém a tela do dispositivo sempre ligada enquanto `active` for true —
// usado no Autoatendimento/Totem, cuja tela apagava sozinha (economia de
// energia do sistema/navegador) no meio do reconhecimento facial.
//
// A Wake Lock API é liberada automaticamente pelo navegador sempre que a
// aba fica oculta (troca de aba, minimizar) — por isso reconquista o lock
// no "visibilitychange" de volta pra 'visible', enquanto `active` continuar
// true. Sem suporte no navegador (Safari < 16.4, navegadores antigos), a
// função falha silenciosamente — não deve travar o reconhecimento facial
// por causa disso, só deixa de ter o benefício.
export function useWakeLock(active) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const requestWakeLock = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          // O componente já desmontou (ou active virou false) enquanto a
          // promise resolvia — libera imediatamente em vez de manter preso.
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
      } catch (err) {
        // Comum e esperado: permissão negada, aba não visível no momento do
        // pedido, ou navegador sem suporte real apesar de expor a API.
        console.warn('[Zela] Não foi possível manter a tela ativa:', err?.message || err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [active]);
}
