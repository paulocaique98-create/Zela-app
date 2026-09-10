import { useEffect, useRef } from 'react';

// Mantém a tela do dispositivo sempre ligada enquanto `active` for true —
// usado no Autoatendimento/Totem, cuja tela apagava sozinha (economia de
// energia do sistema/navegador) no meio do reconhecimento facial.
//
// O navegador libera a Wake Lock sozinho em vários casos além da troca de
// aba: quando a aba fica oculta, quando o SO força economia de energia, ou
// simplesmente por decisão interna do próprio navegador. Antes o hook só
// reconquistava o lock no "visibilitychange" — num totem, cuja aba nunca
// fica oculta, isso nunca disparava e a tela apagava mesmo assim. Agora:
//  1. escuta o evento "release" do próprio lock e o reconquista na hora;
//  2. revalida a cada 20s (rede de segurança pra quando o "release" não
//     chega, o que acontece em alguns navegadores Android);
//  3. continua reconquistando no "visibilitychange" de volta pra visível.
// Sem suporte no navegador a função falha silenciosamente — não trava o
// reconhecimento facial por causa disso, só deixa de ter o benefício.
export function useWakeLock(active) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const requestWakeLock = async () => {
      if (cancelled || wakeLockRef.current || document.visibilityState !== 'visible') return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        // Quando o navegador/SO libera o lock por conta própria, limpa a
        // referência e tenta reconquistar imediatamente (enquanto visível).
        lock.addEventListener('release', () => {
          wakeLockRef.current = null;
          if (!cancelled && document.visibilityState === 'visible') {
            requestWakeLock();
          }
        });
      } catch (err) {
        // Comum e esperado: permissão negada, aba não visível no momento do
        // pedido, ou navegador sem suporte real apesar de expor a API.
        console.warn('[Zela] Não foi possível manter a tela ativa:', err?.message || err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Rede de segurança: alguns navegadores não emitem "release" de forma
    // confiável, então revalida periodicamente.
    const revalidateId = setInterval(requestWakeLock, 20000);

    return () => {
      cancelled = true;
      clearInterval(revalidateId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [active]);
}
