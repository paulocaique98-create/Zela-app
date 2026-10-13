import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { toast } from './toast';

// Push do app (Android e iOS, ambos via FCM; no iOS o AppDelegate troca o token
// APNs pelo token FCM antes de entregar ao plugin). No navegador nada disso roda: o plugin só é
// baixado (import dinâmico) quando o app é nativo.
const CHAVE_TOKEN = 'zela_push_token';

export const ehAppNativo = () => Capacitor.isNativePlatform();

function lerToken() {
  try { return localStorage.getItem(CHAVE_TOKEN); } catch { return null; }
}

function guardarToken(token) {
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN, token);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch { /* sem storage: segue sem lembrar o token */ }
}

async function gravarToken(token) {
  // Um token (aparelho) pertence a uma conta por vez. A função no banco passa o
  // token para a conta logada (usuário e escola vêm da sessão, não daqui).
  const { error } = await supabase.rpc('registrar_token_push_app', {
    p_token: token,
    p_platform: Capacitor.getPlatform(),
    p_device_info: navigator.userAgent,
  });
  if (error) throw error;
  guardarToken(token);
}

export async function statusPushNativo() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const { receive } = await PushNotifications.checkPermissions();
  return receive;
}

// Com o app aberto o FCM entrega o push ao plugin e o Android não desenha
// notificação: mostramos o aviso na tela. Idempotente (troca o listener anterior).
let ouvinteRecebido = null;
export async function ouvirPushRecebido() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  try { await ouvinteRecebido?.remove(); } catch { /* já removido */ }
  ouvinteRecebido = await PushNotifications.addListener('pushNotificationReceived', (n) => {
    const titulo = n?.title?.trim();
    const corpo = n?.body?.trim();
    const msg = [titulo, corpo].filter(Boolean).join(': ');
    if (msg) toast.info(msg);
  });
}

// Pede permissão, registra no FCM e grava o token. Devolve true se ativou.
export async function ativarPushNativo() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let { receive } = await PushNotifications.checkPermissions();
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== 'granted') return false;

  await PushNotifications.removeAllListeners();
  ouvinteRecebido = null;
  await ouvirPushRecebido();
  const token = await new Promise((resolve, reject) => {
    PushNotifications.addListener('registration', (t) => resolve(t.value));
    PushNotifications.addListener('registrationError', (e) => reject(new Error(e?.error || 'registrationError')));
    PushNotifications.register().catch(reject);
  });
  await gravarToken(token);
  return true;
}

// Chamado no logout, ainda com a sessão ativa: remove só o token deste aparelho.
export async function desativarPushNativo() {
  const token = lerToken();
  if (!token) return;
  try {
    await supabase.from('push_subscriptions').delete().eq('token', token);
  } catch { /* melhor esforço */ }
  guardarToken(null);
}

export function tokenNativo() {
  return lerToken();
}

export function temTokenNativo() {
  return !!lerToken();
}
