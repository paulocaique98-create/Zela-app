import { supabase } from './supabase';

// Contexto do usuário atual pra anexar aos logs de erro — atualizado pelo
// App.jsx a cada troca de sessão (login/logout). Módulo-singleton simples,
// sem precisar passar currentUser por prop até o ErrorBoundary/handlers
// globais (que ficam fora da árvore do React, em main.jsx).
let currentContext = { user_id: null, role: null, school_id: null };

export function setErrorLogContext(user) {
  currentContext = user
    ? { user_id: user.id || null, role: user.role || null, school_id: user.school_id || null }
    : { user_id: null, role: null, school_id: null };
}

// Registra um erro de cliente no Supabase — nunca lança: se a própria
// gravação falhar (rede caiu, RLS mudou etc.), só loga no console local em
// vez de mascarar o erro original com um novo erro do logger.
export async function logClientError(error, extra = {}) {
  try {
    const message = (error?.message || String(error) || 'Erro desconhecido').slice(0, 2000);
    const stack = (error?.stack || '').slice(0, 8000);
    await supabase.from('client_error_logs').insert({
      message,
      stack: stack || null,
      component_stack: extra.componentStack ? String(extra.componentStack).slice(0, 8000) : null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      ...currentContext,
    });
  } catch (loggingError) {
    console.error('[errorLogger] Falha ao registrar erro (não propagada):', loggingError);
  }
}

// Handlers globais — pega erros que acontecem FORA da árvore do React (o
// ErrorBoundary só cobre erros de render/lifecycle de componentes) e
// promises rejeitadas sem .catch.
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    logClientError(event.error || new Error(event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    logClientError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  });
}
