import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Inscrições de notificação para web e apps (PLANO_APPS_MOBILE Fase 3).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Inscrições de notificação · web e apps', () => {
  it('cada pessoa grava só a própria inscrição; web exige chaves, app exige token; token é único', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    const other = await createTestUser({ role: 'family', schoolId });
    const token = `vitest-token-${Date.now()}`;
    try {
      const { error: webOld } = await family.client.from('push_subscriptions').insert({
        user_id: family.id, school_id: schoolId, endpoint: `https://push.vitest/${Date.now()}`, p256dh: 'k', auth: 'a',
      });
      expect(webOld).toBeNull();
      const { data: webRow } = await adminClient.from('push_subscriptions').select('platform').eq('user_id', family.id).single();
      expect(webRow.platform).toBe('web');

      const { error: appOk } = await family.client.from('push_subscriptions').insert({ user_id: family.id, school_id: schoolId, platform: 'android', token });
      expect(appOk).toBeNull();

      const { error: appNoToken } = await family.client.from('push_subscriptions').insert({ user_id: family.id, school_id: schoolId, platform: 'ios' });
      expect(appNoToken).not.toBeNull();
      const { error: webNoKeys } = await family.client.from('push_subscriptions').insert({ user_id: family.id, school_id: schoolId, platform: 'web' });
      expect(webNoKeys).not.toBeNull();
      const { error: badPlatform } = await family.client.from('push_subscriptions').insert({ user_id: family.id, school_id: schoolId, platform: 'desktop', token: 'x' });
      expect(badPlatform).not.toBeNull();

      const { error: forged } = await other.client.from('push_subscriptions').insert({ user_id: family.id, school_id: schoolId, platform: 'ios', token: `${token}-2` });
      expect(forged).not.toBeNull();
      const { error: dupToken } = await adminClient.from('push_subscriptions').insert({ user_id: other.id, school_id: schoolId, platform: 'android', token });
      expect(dupToken).not.toBeNull();
    } finally {
      await adminClient.from('push_subscriptions').delete().in('user_id', [family.id, other.id]);
      await deleteTestUser(family.id);
      await deleteTestUser(other.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
