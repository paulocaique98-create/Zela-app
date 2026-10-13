import { describe, it, expect, vi, beforeEach } from 'vitest';

const nativo = { value: false, plataforma: 'android' };
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativo.value,
    getPlatform: () => nativo.plataforma,
  },
}));

const rpc = vi.fn();
const eq = vi.fn();
const del = vi.fn(() => ({ eq }));
vi.mock('../lib/supabase', () => ({
  supabase: { rpc, from: () => ({ delete: del }) },
}));

const setStyle = vi.fn();
const setBackgroundColor = vi.fn();
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle, setBackgroundColor },
  Style: { Dark: 'DARK' },
}));

const push = {
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  removeAllListeners: vi.fn(),
  addListener: vi.fn(),
  register: vi.fn(),
};
vi.mock('../lib/toast', () => ({ toast: { info: vi.fn() } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }));

const TOKEN = 'tok-0123456789abcdefghij';
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
  clear: () => memoria.clear(),
};
globalThis.navigator ??= { userAgent: 'teste' };

beforeEach(() => {
  vi.clearAllMocks();
  nativo.value = true;
  nativo.plataforma = 'android';
  localStorage.clear();
  rpc.mockResolvedValue({ error: null });
  eq.mockResolvedValue({ error: null });
  push.removeAllListeners.mockResolvedValue();
  push.register.mockResolvedValue();
  push.addListener.mockImplementation((ev, cb) => {
    if (ev === 'registration') setTimeout(() => cb({ value: TOKEN }), 0);
    return Promise.resolve({ remove: vi.fn() });
  });
});

describe('initNative', () => {
  it('na web não toca na status bar', async () => {
    nativo.value = false;
    const { initNative } = await import('../lib/nativeInit');
    await initNative();
    expect(setStyle).not.toHaveBeenCalled();
  });

  it('no Android aplica estilo e cor', async () => {
    const { initNative } = await import('../lib/nativeInit');
    await initNative();
    expect(setStyle).toHaveBeenCalled();
    expect(setBackgroundColor).toHaveBeenCalledWith({ color: '#1e5563' });
  });

  it('falha do plugin não propaga', async () => {
    setStyle.mockRejectedValueOnce(new Error('x'));
    const { initNative } = await import('../lib/nativeInit');
    await expect(initNative()).resolves.toBeUndefined();
  });
});

describe('pushNativo', () => {
  it('push recebido com o app aberto vira toast', async () => {
    const { ouvirPushRecebido } = await import('../lib/pushNativo');
    const { toast } = await import('../lib/toast');
    await ouvirPushRecebido();
    const cb = push.addListener.mock.calls.find((c) => c[0] === 'pushNotificationReceived')[1];
    cb({ title: 'Check-in', body: 'Ana chegou' });
    expect(toast.info).toHaveBeenCalledWith('Check-in: Ana chegou');
  });

  it('permissão negada não grava token', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'denied' });
    const { ativarPushNativo } = await import('../lib/pushNativo');
    expect(await ativarPushNativo()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('concedida: grava token pela função do banco', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'granted' });
    const { ativarPushNativo, tokenNativo } = await import('../lib/pushNativo');
    expect(await ativarPushNativo()).toBe(true);
    expect(rpc).toHaveBeenCalledWith('registrar_token_push_app', expect.objectContaining({ p_token: TOKEN, p_platform: 'android' }));
    expect(tokenNativo()).toBe(TOKEN);
  });

  it('erro do banco propaga e não lembra o token', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'granted' });
    rpc.mockResolvedValue({ error: new Error('rls') });
    const { ativarPushNativo, temTokenNativo } = await import('../lib/pushNativo');
    await expect(ativarPushNativo()).rejects.toThrow('rls');
    expect(temTokenNativo()).toBe(false);
  });

  it('logout apaga só o token deste aparelho', async () => {
    localStorage.setItem('zela_push_token', 'tok-9');
    const { desativarPushNativo, temTokenNativo } = await import('../lib/pushNativo');
    await desativarPushNativo();
    expect(eq).toHaveBeenCalledWith('token', 'tok-9');
    expect(temTokenNativo()).toBe(false);
  });

  it('logout sem token não consulta o banco', async () => {
    const { desativarPushNativo } = await import('../lib/pushNativo');
    await desativarPushNativo();
    expect(del).not.toHaveBeenCalled();
  });
});
