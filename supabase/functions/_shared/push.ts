import webpush from 'npm:web-push@3.6.7';
import { type PushPayload, buildWebPayload, buildFcmMessage, isGoneWebPush, isGoneFcm, attemptEndpoint, destinatariosComVinculos, tituloViaVinculo, chaveDoAparelho } from './pushCore.ts';

// Envio único de notificações do Zela (PLANO_APPS_MOBILE.md, Fase 3).
// Antes, o mesmo código de Web Push estava copiado em 8 lugares; agora
// todos chamam sendPush(). Cada inscrição sai pelo canal certo:
//   · web (navegador): Web Push com VAPID, como sempre foi;
//   · android / ios (apps): FCM HTTP v1, quando FCM_SERVICE_ACCOUNT estiver
//     configurado (até os apps existirem, não há inscrições desse tipo).
// Inscrições que não existem mais são apagadas; toda tentativa fica em
// push_delivery_attempts.

export type { PushPayload };

type Subscription = {
  id: string;
  user_id: string;
  platform: string | null;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  token: string | null;
};

export type SendPushResult = { sent: number; failed: number; errors: string[] };

let vapidReady: boolean | null = null;
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  vapidReady = Boolean(pub && priv && subject);
  if (vapidReady) webpush.setVapidDetails(subject!, pub!, priv!);
  return vapidReady;
}

// ─── FCM (apps) ────────────────────────────────────────────────────────────
type ServiceAccount = { client_email: string; private_key: string; project_id: string };
let fcmAccount: ServiceAccount | null | undefined;
let fcmToken: { value: string; expiresAt: number } | null = null;

function getFcmAccount(): ServiceAccount | null {
  if (fcmAccount !== undefined) return fcmAccount;
  try {
    const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    fcmAccount = raw ? JSON.parse(raw) : null;
  } catch {
    fcmAccount = null;
  }
  return fcmAccount;
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getFcmAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmToken && fcmToken.expiresAt - 60 > now) return fcmToken.value;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`FCM: não foi possível autenticar (${res.status})`);
  fcmToken = { value: json.access_token, expiresAt: now + (json.expires_in || 3600) };
  return fcmToken.value;
}

// ─── Envio ─────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export async function sendPush(adminClient: any, userIds: string[], payload: PushPayload, options: {
  onlyEndpoint?: string;
  logAttempts?: boolean;
} = {}): Promise<SendPushResult> {
  const result: SendPushResult = { sent: 0, failed: 0, errors: [] };
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (ids.length === 0) return result;

  // Contas vinculadas: o aviso chega também nos aparelhos das outras contas
  // da mesma pessoa (não vale para o envio de teste de um aparelho só).
  let viaVinculo: Record<string, string> = {};
  const rolePorId: Record<string, string> = {};
  if (!options.onlyEndpoint) {
    try {
      const { data: meus } = await adminClient.from('contas_vinculadas').select('user_id, grupo').in('user_id', ids);
      const grupos = Array.from(new Set((meus || []).map((v: { grupo: string }) => v.grupo)));
      if (grupos.length) {
        const { data: vinculos } = await adminClient.from('contas_vinculadas').select('user_id, grupo').in('grupo', grupos);
        viaVinculo = destinatariosComVinculos(ids, vinculos || []).viaVinculo;
        const originais = Array.from(new Set(Object.values(viaVinculo)));
        if (originais.length) {
          const { data: perfis } = await adminClient.from('users').select('id, role').in('id', originais);
          for (const p of perfis || []) rolePorId[p.id] = p.role;
        }
      }
    } catch (_) {
      viaVinculo = {}; // melhor esforço: sem vínculo, segue o envio normal
    }
  }
  const todos = [...ids, ...Object.keys(viaVinculo)];

  let query = adminClient
    .from('push_subscriptions')
    .select('id, user_id, platform, endpoint, p256dh, auth, token')
    .in('user_id', todos);
  if (options.onlyEndpoint) query = query.eq('endpoint', options.onlyEndpoint);
  const { data: subscriptions, error } = await query;
  // Push é sempre melhor esforço: nunca derruba o aviso dentro do app.
  if (error) {
    result.errors.push(error.message);
    return result;
  }
  if (!subscriptions?.length) return result;

  const logAttempts = options.logAttempts !== false;
  const fcm = getFcmAccount();

  // Destinatários originais primeiro; aparelho já avisado não recebe de novo.
  const ordenadas = [...(subscriptions as Subscription[])].sort((a, b) => Number(Boolean(viaVinculo[a.user_id])) - Number(Boolean(viaVinculo[b.user_id])));
  const aparelhosAvisados = new Set<string>();

  for (const sub of ordenadas) {
    const chave = chaveDoAparelho(sub);
    if (aparelhosAvisados.has(chave)) continue;
    aparelhosAvisados.add(chave);
    const original = viaVinculo[sub.user_id];
    const payloadDaConta = original ? { ...payload, title: tituloViaVinculo(payload.title, rolePorId[original]) } : payload;
    const webBody = buildWebPayload(payloadDaConta);
    const platform = sub.platform || 'web';
    let ok = false;
    let statusCode: number | null = null;
    let message: string | null = null;
    let gone = false;

    try {
      if (platform === 'web') {
        if (!ensureVapid() || !sub.endpoint || !sub.p256dh || !sub.auth) continue;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, webBody);
          ok = true;
        } catch (err) {
          // deno-lint-ignore no-explicit-any
          const e = err as any;
          statusCode = e?.statusCode ?? null;
          message = String(e?.message ?? e);
          gone = isGoneWebPush(statusCode);
        }
      } else {
        if (!fcm || !sub.token) continue;
        const accessToken = await getFcmAccessToken(fcm);
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fcm.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildFcmMessage(sub.token, payloadDaConta)),
        });
        statusCode = res.status;
        if (res.ok) {
          ok = true;
        } else {
          const body = await res.text();
          message = body.slice(0, 500);
          gone = isGoneFcm(res.status, body);
        }
      }
    } catch (err) {
      message = String((err as Error)?.message ?? err);
    }

    if (ok) result.sent++;
    else {
      result.failed++;
      if (message) result.errors.push(message);
    }

    if (logAttempts) {
      await adminClient.from('push_delivery_attempts').insert({
        family_id: sub.user_id,
        endpoint: attemptEndpoint(sub),
        success: ok,
        status_code: ok ? null : statusCode,
        error_message: ok ? null : message,
      });
    }
    if (gone) {
      await adminClient.from('push_subscriptions').delete().eq('id', sub.id);
    }
  }

  return result;
}
