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

// ─── Contas vinculadas (29/09/2026) ────────────────────────────────────────
// A mesma pessoa pode ter contas vinculadas (ex.: Coordenadora que também é
// mãe). Aviso para uma conta chega também nos aparelhos das contas do mesmo
// grupo, com o perfil no título ("Entrada registrada · Responsável"), e um
// aparelho inscrito nas duas contas recebe o aviso uma vez só.
export type Vinculo = { user_id: string; grupo: string };

export const ROTULO_PERFIL: Record<string, string> = {
  family: 'Responsável',
  teacher: 'Professora',
  admin: 'Recepção',
  gestao: 'Gestão',
  gestao_pedagogica: 'Coordenação',
};

// Quem recebe além dos destinatários originais: cada conta extra aponta
// para o destinatário original do mesmo grupo.
export function destinatariosComVinculos(ids: string[], vinculos: Vinculo[]): { todos: string[]; viaVinculo: Record<string, string> } {
  const alvos = new Set(ids);
  const grupoDe = new Map(vinculos.map(v => [v.user_id, v.grupo]));
  const alvoDoGrupo = new Map<string, string>();
  for (const id of ids) {
    const grupo = grupoDe.get(id);
    if (grupo && !alvoDoGrupo.has(grupo)) alvoDoGrupo.set(grupo, id);
  }
  const viaVinculo: Record<string, string> = {};
  for (const v of vinculos) {
    if (!alvos.has(v.user_id) && alvoDoGrupo.has(v.grupo)) viaVinculo[v.user_id] = alvoDoGrupo.get(v.grupo)!;
  }
  return { todos: [...ids, ...Object.keys(viaVinculo)], viaVinculo };
}

export function tituloViaVinculo(title: string, roleDoDestinatario?: string | null): string {
  const rotulo = roleDoDestinatario ? ROTULO_PERFIL[roleDoDestinatario] : null;
  return rotulo ? `${title} · ${rotulo}` : title;
}

// Identifica o aparelho (mesmo navegador/celular inscrito em duas contas).
export function chaveDoAparelho(sub: { platform?: string | null; endpoint?: string | null; token?: string | null }): string {
  const platform = sub.platform || 'web';
  return platform === 'web' ? `web:${sub.endpoint}` : `${platform}:${sub.token}`;
}
