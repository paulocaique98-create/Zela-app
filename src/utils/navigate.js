/**
 * navigate.js — Navegação interna sem reload de página.
 *
 * Usa History API (pushState) em vez de window.location.href para
 * trocar de rota sem destruir o estado do React, preservando:
 *   - Dados de formulários em andamento (useState local)
 *   - Conexões Realtime (supabase.channel)
 *   - Dados já carregados do banco (students, authorized, etc.)
 *
 * Dispara um evento 'popstate' manualmente para que o App.jsx
 * (que escuta popstate via useEffect) atualize o currentPath.
 *
 * ATENÇÃO: NÃO use esta função para:
 *   - Logout (use window.location.reload ou handleLogout com reload)
 *   - URLs externas (use window.location.href normalmente)
 *   - Sair do Totem (reload intencional para limpar estado biométrico)
 */
export function navigateTo(path) {
  // Se já está na rota solicitada, não faz nada (evita re-render desnecessário)
  if (window.location.pathname === path) return;

  // Atualiza a URL sem recarregar a página
  window.history.pushState({}, '', path);

  // Dispara popstate manualmente para notificar o App.jsx
  // (pushState nativo NÃO dispara popstate automaticamente)
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}
