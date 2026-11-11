import { describe, it, expect } from 'vitest';
import { parseRota, parseEventos, sanitizar, extrairDeviceId, paraIso, montarComandoPush, parseResultado } from '../../supabase/functions/controlid-push/parser.ts';

const T = 'a'.repeat(64);

describe('controlid parser', () => {
  it('aceita só token de 64 hex e rota conhecida', () => {
    expect(parseRota(`/controlid-push/${T}/push`)).toEqual({ token: T, rota: 'push' });
    expect(parseRota(`/functions/v1/controlid-push/${T}/dao`)?.rota).toBe('dao');
    expect(parseRota('/controlid-push/curto/push')).toBeNull();
    expect(parseRota(`/controlid-push/${T}/outra`)).toBeNull();
    expect(parseRota(`/controlid-push/${T}/push/extra`)).toBeNull();
  });
  it('deviceId vem da query ou do corpo', () => {
    expect(extrairDeviceId(new URLSearchParams('deviceId=77'), null)).toBe(77);
    expect(extrairDeviceId(new URLSearchParams(), { device_id: '12' })).toBe(12);
    expect(extrairDeviceId(new URLSearchParams('deviceId=abc'), null)).toBeNull();
  });
  it('dao: extrai access_logs e ignora outros objetos', () => {
    const t = Math.floor(Date.now() / 1000) - 5;
    const ev = parseEventos('dao', { object_changes: [
      { object: 'access_logs', type: 'inserted', values: { id: '9', time: String(t), event: '7', user_id: '3', portal_id: '1' } },
      { object: 'users', type: 'inserted', values: { id: '1' } },
    ] });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_type: 'access_log', dedupe_key: 'log:9', external_user_id: 3 });
    expect(ev[0].device_time).toBe(new Date(t * 1000).toISOString());
  });
  it('user_id 0 (não identificado) vira null', () => {
    const ev = parseEventos('dao', { object_changes: [{ object: 'access_logs', values: { id: '1', user_id: '0' } }] });
    expect(ev[0].external_user_id).toBeNull();
  });
  it('sanitizar remove biometria/segredos e corta textos', () => {
    const s = sanitizar({ ok: 1, image: 'xxx', face_template: 'y', token: 't', nested: { foto_base64: 'z', a: 'b' }, longo: 'a'.repeat(500) });
    expect(s).not.toHaveProperty('image');
    expect(s).not.toHaveProperty('face_template');
    expect(s).not.toHaveProperty('token');
    expect(s.nested).toEqual({ a: 'b' });
    expect(s.longo).toHaveLength(300);
  });
  it('result guarda só resumo, nunca o corpo', () => {
    const ev = parseEventos('result', { response_id: 'c1', users: [{ image: 'big' }] });
    expect(ev[0].payload).toEqual({ command_id: 'c1', error: null });
  });
  it('access_photo é ignorado; data absurda vira null', () => {
    expect(parseEventos('access_photo', { photo: 'x' })).toEqual([]);
    expect(paraIso(0)).toBeNull();
    expect(paraIso('2999-01-01')).toBeNull();
  });
});

describe('controlid parser · comandos (fase 5)', () => {
  it('monta create/update/delete com o id do equipamento', () => {
    expect(montarComandoPush('create_user', 7, 'Maria')?.body).toEqual({ object: 'users', values: [{ id: 7, name: 'Maria' }] });
    expect(montarComandoPush('update_user', 7, 'Ana')?.endpoint).toBe('modify_objects');
    expect(montarComandoPush('delete_user', 7, null)?.body.where).toEqual({ users: { id: 7 } });
  });
  it('recusa id inválido e set_photo sem foto; limpa nome', () => {
    expect(montarComandoPush('create_user', 0, 'x')).toBeNull();
    expect(montarComandoPush('set_photo', 7, 'x')).toBeNull();
    expect(montarComandoPush('set_photo', 7, 'x', 'QUJD')?.body.user_images[0].image).toBe('QUJD');
    expect(montarComandoPush('create_user', 7, 'A\nB')?.body.values[0].name).toBe('A B');
  });
  it('parseResultado: sem erro é ok; erro é cortado', () => {
    expect(parseResultado({ response: {} })).toEqual({ ok: true, erro: null });
    expect(parseResultado({ error: 'falhou' })).toEqual({ ok: false, erro: 'falhou' });
    expect(parseResultado({ response: { error: 'x'.repeat(500) } }).erro).toHaveLength(200);
  });
});
