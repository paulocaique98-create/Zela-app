import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  createTestSchool,
  deleteTestSchool,
} from './supabaseTestHelpers.js';

// P1.2 (Prompt Mestre de Evolução) — chat e storage nunca tinham sido
// submetidos ao mesmo teste adversarial de isolamento multi-tenant já
// aplicado a students/authorized_persons/financeiro (Fase 17).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Isolamento multi-tenant — chat', () => {
  let schoolA, schoolB, familyA, familyB, adminA, threadA;

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest Chat A');
    schoolB = await createTestSchool('Vitest Chat B');
    familyA = await createTestUser({ role: 'family', schoolId: schoolA });
    familyB = await createTestUser({ role: 'family', schoolId: schoolB });
    adminA = await createTestUser({ role: 'admin', schoolId: schoolA, extra: { departamento: 'administrativo' } });

    const { data: thread, error } = await adminClient
      .from('chat_threads')
      .insert({ school_id: schoolA, family_id: familyA.id, setor: 'administrativo' })
      .select('id')
      .single();
    if (error) throw error;
    threadA = thread.id;

    await adminClient.from('chat_messages').insert({
      thread_id: threadA, sender_id: familyA.id, sender_role: 'family', body: 'Mensagem da família A',
    });
  });

  afterAll(async () => {
    await adminClient.from('chat_messages').delete().eq('thread_id', threadA);
    await adminClient.from('chat_threads').delete().eq('id', threadA);
    await deleteTestUser(familyA.id);
    await deleteTestUser(familyB.id);
    await deleteTestUser(adminA.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  it('família A lê a própria thread e mensagem (acesso legítimo preservado)', async () => {
    const { data: threads } = await familyA.client.from('chat_threads').select('id').eq('id', threadA);
    expect(threads).toHaveLength(1);
    const { data: msgs } = await familyA.client.from('chat_messages').select('id, body').eq('thread_id', threadA);
    expect(msgs).toHaveLength(1);
  });

  it('família B (outra escola) não lê a thread da família A', async () => {
    const { data } = await familyB.client.from('chat_threads').select('id').eq('id', threadA);
    expect(data).toEqual([]);
  });

  it('família B (outra escola) não lê as mensagens da thread da família A', async () => {
    const { data } = await familyB.client.from('chat_messages').select('id, body').eq('thread_id', threadA);
    expect(data).toEqual([]);
  });

  it('família B não consegue inserir mensagem na thread da família A', async () => {
    const { error } = await familyB.client.from('chat_messages').insert({
      thread_id: threadA, sender_id: familyB.id, sender_role: 'family', body: 'Mensagem invasora',
    });
    expect(error).not.toBeNull();
  });

  it('admin da escola A lê a thread do próprio setor (acesso legítimo preservado)', async () => {
    const { data } = await adminA.client.from('chat_threads').select('id').eq('id', threadA);
    expect(data).toHaveLength(1);
  });

  it('família B não consegue criar uma thread marcada como sendo da escola A', async () => {
    const { error } = await familyB.client.from('chat_threads').insert({
      school_id: schoolA, family_id: familyB.id, setor: 'administrativo',
    });
    expect(error).not.toBeNull();
  });
});

runIf('Isolamento multi-tenant — storage (person-photos)', () => {
  let schoolA, schoolB, familyA, familyB, apA, objectPath;
  // person-photos só aceita image/png,jpeg,webp — 1x1 PNG mínimo válido.
  const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0));
  const fileBody = new Blob([pngBytes], { type: 'image/png' });

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest Storage A');
    schoolB = await createTestSchool('Vitest Storage B');
    familyA = await createTestUser({ role: 'family', schoolId: schoolA });
    familyB = await createTestUser({ role: 'family', schoolId: schoolB });

    const { data: ap, error } = await adminClient
      .from('authorized_persons')
      .insert({ name: 'Autorizado Teste', relation: 'Tio', family_id: familyA.id, school_id: schoolA })
      .select('id')
      .single();
    if (error) throw error;
    apA = ap.id;
    objectPath = `${schoolA}/${apA}.png`;

    const { error: upErr } = await familyA.client.storage.from('person-photos').upload(objectPath, fileBody, { upsert: true });
    if (upErr) throw upErr;
  });

  afterAll(async () => {
    await adminClient.storage.from('person-photos').remove([objectPath]);
    await adminClient.from('authorized_persons').delete().eq('id', apA);
    await deleteTestUser(familyA.id);
    await deleteTestUser(familyB.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  it('os 4 buckets do projeto continuam privados (public=false) — guarda de regressão', async () => {
    const { data } = await adminClient.storage.listBuckets();
    const relevant = data.filter(b => ['comunicados-anexos', 'mural-fotos', 'matriculas-docs', 'person-photos'].includes(b.id));
    expect(relevant).toHaveLength(4);
    for (const b of relevant) expect(b.public).toBe(false);
  });

  it('família A baixa a própria foto (acesso legítimo preservado)', async () => {
    const { data, error } = await familyA.client.storage.from('person-photos').download(objectPath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('família B (outra escola) não consegue baixar a foto da família A', async () => {
    const { data, error } = await familyB.client.storage.from('person-photos').download(objectPath);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('família B não lista objetos dentro da pasta da escola A', async () => {
    const { data } = await familyB.client.storage.from('person-photos').list(schoolA);
    expect(data ?? []).toEqual([]);
  });

  it('família B não consegue subir um arquivo dentro da pasta da escola A', async () => {
    const { error } = await familyB.client.storage
      .from('person-photos')
      .upload(`${schoolA}/invasor.png`, fileBody);
    expect(error).not.toBeNull();
  });
});
