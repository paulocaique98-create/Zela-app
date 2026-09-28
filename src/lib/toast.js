// Avisos rápidos do Zela (substituem o alert() do navegador, que no app
// nativo aparece com o título "localhost" e trava a tela). Funciona também
// fora de componentes React (ex.: src/lib/print*.js): quem mostra é o
// <Toaster/> montado uma vez no App.jsx.

const listeners = new Set();
let seq = 0;

function emit(type, message, durationMs) {
  const toast = { id: ++seq, type, message: String(message ?? ''), durationMs };
  if (listeners.size === 0) {
    // Sem Toaster montado (ex.: teste unitário): não perde a mensagem.
    console.warn(`[toast:${type}]`, toast.message);
    return toast.id;
  }
  listeners.forEach(fn => fn(toast));
  return toast.id;
}

export const toast = {
  success: (message, durationMs = 4000) => emit('success', message, durationMs),
  error: (message, durationMs = 7000) => emit('error', message, durationMs),
  info: (message, durationMs = 5000) => emit('info', message, durationMs),
};

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
