import { supabase } from './supabase';
import { setSentryUserContext, captureToSentry } from './sentry';

// Contexto do usuário atual pra anexar aos logs de erro — atualizado pelo
// App.jsx a cada troca de sessão (login/logout). Módulo-singleton simples,
// sem precisar passar currentUser por prop até o ErrorBoundary/handlers
// globais (que ficam fora da árvore do React, em main.jsx). Mesmo contexto
// também alimenta o Sentry (ver sentry.js), pra nunca um sistema saber quem
// era o usuário e o outro não.
let currentContext = { user_id: null, role: null, school_id: null, screen: null };

export function setErrorLogContext(user) {
  currentContext = user
    ? { ...currentContext, user_id: user.id || null, role: user.role || null, school_id: user.school_id || null }
    : { ...currentContext, user_id: null, role: null, school_id: null };
  setSentryUserContext(user);
}

// Fase D do PLANO_TELA_DE_ORIGEM_NOS_LOGS.md — qual aba/tela está ativa
// agora (ex: 'kiosk' = Autoatendimento, 'monitor' = Monitor). Atualizado
// pelo App.jsx a cada troca de aba do Admin/Family/Teacher, e pelo
// DeveloperLayout.jsx (que tem seu próprio estado de aba, isolado). Mesmo
// raciocínio de setErrorLogContext: um singleton de módulo é o único jeito
// dos handlers globais (window.onerror/unhandledrejection, fora da árvore
// React) saberem essa informação.
export function setCurrentScreen(screen) {
  currentContext = { ...currentContext, screen: screen || null };
}

export function getCurrentScreen() {
  return currentContext.screen;
}

// Registra um erro de cliente em error_logs (source='client') E no Sentry —
// nunca lança: se a própria gravação falhar (rede caiu, RLS mudou etc.), só
// loga no console local em vez de mascarar o erro original com um novo erro
// do logger. Migração completa pra error_logs (não grava mais em
// client_error_logs, tabela legada mantida só para leitura histórica via
// SQL Editor) -- Fase F do PLANO_LOGGING_ERROS_PORTAL_DEV.md, feita cedo a
// pedido, pra a aba "Legado" do Portal do Dev poder ser removida sem perder
// visibilidade de crash de tela/promise rejeitada.
export async function logClientError(error, extra = {}) {
  captureToSentry(error, extra);
  try {
    const message = (error?.message || String(error) || 'Erro desconhecido').slice(0, 2000);
    const stack = (error?.stack || '').slice(0, 8000);
    const componentStack = extra.componentStack ? String(extra.componentStack).slice(0, 8000) : null;
    await supabase.rpc('log_error', {
      p_source: 'client',
      p_category: componentStack ? 'react_render_crash' : 'unhandled_error',
      p_message: message,
      p_severity: 'error',
      p_stack: stack || null,
      p_context: componentStack ? { component_stack: componentStack } : null,
      p_school_id: currentContext.school_id,
      p_user_id: currentContext.user_id,
      p_role: currentContext.role,
      p_url: typeof window !== 'undefined' ? window.location.href : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      p_screen: currentContext.screen,
    });
  } catch (loggingError) {
    console.error('[errorLogger] Falha ao registrar erro (não propagada):', loggingError);
  }
}

// Fase B3 do PLANO_LOGGING_ERROS_PORTAL_DEV.md — destino fácil pros catch
// que hoje só fazem console.error (a grande maioria do app). Ao lado de
// logClientError (que continua intacta, cobrindo crash de render e erro
// global), não força refactor de tudo de uma vez: cada catch que vale a
// pena logar chama isso, um de cada vez, sem virar um projeto à parte.
// Grava em error_logs (Fase A) com source='business', nunca em
// client_error_logs (essa continua só pra erro de render/global).
export async function logAppError(category, error, context = {}) {
  try {
    const message = (error?.message || String(error) || 'Erro desconhecido').slice(0, 2000);
    const stack = (error?.stack || '').slice(0, 8000);
    await supabase.rpc('log_error', {
      p_source: 'business',
      p_category: category,
      p_message: message,
      p_severity: context.severity || 'error',
      p_stack: stack || null,
      p_context: context,
      p_school_id: currentContext.school_id,
      p_user_id: currentContext.user_id,
      p_role: currentContext.role,
      p_url: typeof window !== 'undefined' ? window.location.href : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      p_screen: currentContext.screen,
    });
  } catch (loggingError) {
    console.error('[errorLogger] Falha ao registrar erro de negócio (não propagada):', loggingError);
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
