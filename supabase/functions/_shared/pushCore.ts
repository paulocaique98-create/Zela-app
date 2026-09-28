// Regras puras do envio de notificações (sem rede, sem Deno.env, sem npm:),
// para poderem ser testadas no Vitest. O envio em si fica em push.ts.
// PLANO_APPS_MOBILE.md, Fase 3: o mesmo aviso sai por Web Push (navegador)
// ou por FCM (app Android e iOS), conforme a inscrição do aparelho.

export type PushPayload = {
  title: string;
  body: string;
  url?: string | null;
  tag?: string | null;
};

// Canais de notificação do Android (a pessoa escolhe o que silenciar nos
// ajustes do celular). Os ids precisam ser criados com os mesmos nomes no
// app (Fase 3 do plano).
export const ANDROID_CHANNELS = {
  chat: 'Chat',
  financeiro: 'Financeiro',
  entrada_saida: 'Entrada e saída',
  comunicados: 'Comunicados e agenda',
  avisos: 'Avisos da escola',
} as const;

export type AndroidChannel = keyof typeof ANDROID_CHANNELS;

const COMUNICADOS_TAGS = ['comunicado', 'calendario', 'cardapio', 'mural_fotos', 'diario', 'contrato', 'relatorio', 'matricula', 'geral'];

export function channelForTag(tag?: string | null): AndroidChannel {
  const t = (tag || '').toLowerCase();
  if (t === 'chat') return 'chat';
  if (t.startsWith('financeiro')) return 'financeiro';
  if (t.startsWith('atraso') || t.includes('checkin') || t.includes('checkout') || t.startsWith('ausencia') || t === 'falta') return 'entrada_saida';
  if (COMUNICADOS_TAGS.includes(t)) return 'comunicados';
  return 'avisos';
}

// Formato lido pelo service worker (public/sw.js) no navegador.
export function buildWebPayload(p: PushPayload): string {
  return JSON.stringify({ title: p.title, body: p.body, url: p.url || '/', tag: p.tag || 'zela' });
}

// Mensagem da API HTTP v1 do FCM. `data.url` leva à tela certa ao tocar
// (mesma convenção /?tab=... das notificações do Zela).
export function buildFcmMessage(token: string, p: PushPayload) {
  const tag = p.tag || 'zela';
  return {
    message: {
      token,
      notification: { title: p.title, body: p.body },
      data: { url: p.url || '/', tag },
      android: { priority: 'high', notification: { tag, channel_id: channelForTag(tag) } },
      apns: { payload: { aps: { sound: 'default', 'thread-id': tag } } },
    },
  };
}

// Inscrição que não existe mais no serviço de push: apagar do banco.
export function isGoneWebPush(statusCode?: number | null): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function isGoneFcm(status: number, body: unknown): boolean {
  if (status === 404) return true;
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(text);
}

// Identificador legível da inscrição para o registro de tentativas
// (push_delivery_attempts.endpoint), sem guardar o token inteiro.
export function attemptEndpoint(sub: { platform?: string | null; endpoint?: string | null; token?: string | null }): string {
  if ((sub.platform || 'web') === 'web') return sub.endpoint || 'web:?';
  return `${sub.platform}:${(sub.token || '').slice(0, 16)}`;
}
