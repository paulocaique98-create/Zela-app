// Detecção de plataforma centralizada — usada só pelo fluxo de Notificações
// Push (src/hooks/usePushNotifications.js) pra decidir quando é seguro pedir
// permissão/criar subscription. Isolada em vez de espalhar checks de
// userAgent pelos componentes, e testável isoladamente (ver
// platformDetection.test.js).

// iOS real (iPhone/iPod/iPad clássico) OU iPadOS 13+, que por padrão se
// identifica como "MacIntel" no userAgent — só distinguível de um Mac de
// verdade pelo suporte a touch (maxTouchPoints > 1).
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  const isClassicIOSDevice = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return isClassicIOSDevice || isIPadOS13Plus;
}

// App rodando "instalado" (adicionado à Tela de Início, aberto pelo ícone) —
// `display-mode: standalone` é o padrão web geral; `navigator.standalone` é
// a propriedade específica do Safari/iOS (não existe em outros browsers,
// por isso o `typeof` antes de checar o valor).
export function isStandalone() {
  const viaMediaQuery = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  const viaIOSFlag = typeof navigator !== 'undefined' && navigator.standalone === true;
  return !!(viaMediaQuery || viaIOSFlag);
}

// Safari "de verdade" (exclui Chrome/Firefox/Edge iOS, que usam o motor da
// Apple por baixo mas se identificam como "Safari" também no userAgent —
// por isso exclui explicitamente os tokens desses browsers).
export function isSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
}

// iOS + instalado na Tela de Início — único cenário em que o Safari permite
// Web Push (a partir do iOS 16.4). Fora disso, pedir permissão de
// notificação simplesmente não funciona nesse navegador/OS.
export function isIOSStandalone() {
  return isIOS() && isStandalone();
}
