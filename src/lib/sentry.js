import * as Sentry from '@sentry/react';

// Integração do Sentry — roda em PARALELO ao error logger caseiro
// (src/lib/errorLogger.js -> client_error_logs), não substitui. Os dois são
// alimentados pelos mesmos pontos de captura (ErrorBoundary, window.onerror,
// unhandledrejection, e agora também logClientError chama o Sentry também),
// então nenhum erro que já era capturado deixa de ser — só ganha um segundo
// destino, com replay de sessão e alertas que o client_error_logs não tem.
//
// Sem VITE_SENTRY_DSN configurado (ex: ambiente local sem o valor no .env),
// tudo aqui vira no-op — nunca trava o app por falta da variável.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!dsn) {
    console.info('[Sentry] VITE_SENTRY_DSN não configurado — captura de erros pro Sentry desativada (client_error_logs continua funcionando normalmente).');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'development' | 'production'
    // Amostragem de performance/replay bem conservadora de propósito — o
    // objetivo aqui é capturar ERROS, não monitorar performance a fundo
    // (evita gastar a cota gratuita do Sentry rápido demais).
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [Sentry.replayIntegration()],
  });
}

// Mesmo contexto (usuário/papel/escola) que já é anexado aos logs do
// client_error_logs (ver setErrorLogContext em errorLogger.js) — chamado do
// mesmo lugar, pra nunca ficar um sistema com contexto e o outro sem.
export function setSentryUserContext(user) {
  if (!dsn) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id || undefined });
  Sentry.setTag('role', user.role || 'desconhecido');
  Sentry.setTag('school_id', user.school_id || 'nenhuma');
}

export function captureToSentry(error, extra = {}) {
  if (!dsn) return;
  Sentry.captureException(error, { extra });
}
