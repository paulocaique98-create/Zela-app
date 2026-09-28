import { describe, it, expect } from 'vitest';
import { channelForTag, buildWebPayload, buildFcmMessage, isGoneWebPush, isGoneFcm, attemptEndpoint } from '../../supabase/functions/_shared/pushCore.ts';

// Regras puras do envio único de notificações (_shared/push.ts), usadas
// tanto no Web Push de hoje quanto no FCM dos apps (PLANO_APPS_MOBILE Fase 3).
describe('pushCore · canais do Android por tipo de aviso', () => {
  it('agrupa os avisos existentes nos canais certos', () => {
    expect(channelForTag('chat')).toBe('chat');
    expect(channelForTag('financeiro-nova-cobranca')).toBe('financeiro');
    expect(channelForTag('financeiro-lembrete-vencimento')).toBe('financeiro');
    expect(channelForTag('atraso-checkout-cobranca')).toBe('entrada_saida');
    expect(channelForTag('ausencia-prolongada')).toBe('entrada_saida');
    expect(channelForTag('contrato')).toBe('comunicados');
    expect(channelForTag('mural_fotos')).toBe('comunicados');
    expect(channelForTag('pending-registration')).toBe('avisos');
    expect(channelForTag(undefined)).toBe('avisos');
  });
});

describe('pushCore · formato das mensagens', () => {
  it('web: mesmo formato que o service worker lê, com padrões', () => {
    expect(JSON.parse(buildWebPayload({ title: 'T', body: 'B' }))).toEqual({ title: 'T', body: 'B', url: '/', tag: 'zela' });
  });

  it('FCM: token, texto, link da tela e canal do Android', () => {
    const m = buildFcmMessage('tok123', { title: 'Contrato para assinar', body: 'Leia e assine', url: '/?tab=contratos', tag: 'contrato' });
    expect(m.message.token).toBe('tok123');
    expect(m.message.notification).toEqual({ title: 'Contrato para assinar', body: 'Leia e assine' });
    expect(m.message.data).toEqual({ url: '/?tab=contratos', tag: 'contrato' });
    expect(m.message.android.notification.channel_id).toBe('comunicados');
  });
});

describe('pushCore · inscrições que não existem mais', () => {
  it('web: 404 e 410 apagam; outros erros não', () => {
    expect(isGoneWebPush(410)).toBe(true);
    expect(isGoneWebPush(404)).toBe(true);
    expect(isGoneWebPush(500)).toBe(false);
    expect(isGoneWebPush(null)).toBe(false);
  });

  it('FCM: token não registrado apaga; erro temporário não', () => {
    expect(isGoneFcm(404, '')).toBe(true);
    expect(isGoneFcm(400, { error: { details: [{ errorCode: 'UNREGISTERED' }] } })).toBe(true);
    expect(isGoneFcm(503, 'Service Unavailable')).toBe(false);
  });

  it('registro de tentativa não guarda o token inteiro', () => {
    expect(attemptEndpoint({ platform: 'web', endpoint: 'https://push/abc' })).toBe('https://push/abc');
    expect(attemptEndpoint({ platform: 'android', token: 'x'.repeat(40) })).toBe(`android:${'x'.repeat(16)}`);
  });
});
