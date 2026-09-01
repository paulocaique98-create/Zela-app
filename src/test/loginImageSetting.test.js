import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient } from './supabaseTestHelpers.js';

// Imagem customizável da tela de login (Login.jsx) — vista por usuário
// NÃO autenticado, então precisa de leitura pública em system_settings,
// mas restrita só à chave 'login_image_url' (nunca a tabela toda).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('system_settings.login_image_url — leitura pública restrita', () => {
  it('anon (sem login) lê login_image_url', async () => {
    await adminClient.from('system_settings').upsert({ key: 'login_image_url', value: 'https://vitest.example/img.png' }, { onConflict: 'key' });
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    try {
      const { data, error } = await anon.from('system_settings').select('value').eq('key', 'login_image_url').maybeSingle();
      expect(error).toBeNull();
      expect(data.value).toBe('https://vitest.example/img.png');
    } finally {
      await adminClient.from('system_settings').delete().eq('key', 'login_image_url');
    }
  });

  it('CRÍTICO — anon NÃO lê outras chaves de system_settings (só login_image_url é pública)', async () => {
    await adminClient.from('system_settings').upsert({ key: 'global_logo', value: 'segredo-de-outra-chave' }, { onConflict: 'key' });
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    try {
      const { data } = await anon.from('system_settings').select('value').eq('key', 'global_logo').maybeSingle();
      expect(data).toBeNull();
    } finally {
      await adminClient.from('system_settings').delete().eq('key', 'global_logo');
    }
  });

  it('anon não consegue escrever em login_image_url (só developer, via policy existente)', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anon.from('system_settings').upsert({ key: 'login_image_url', value: 'hackeado' }, { onConflict: 'key' }).select();
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
  });
});
