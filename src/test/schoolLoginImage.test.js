import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Imagem de login por escola: schools.login_image_url (permissão: mesmo
// grupo de update_school_turmas, admin principal ou developer) +
// get_school_login_image(school_code), RPC pública pra tela de login.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Imagem de login por escola (login_image_url + get_school_login_image)', () => {
  it('admin principal grava a imagem; admin comum e professor não conseguem (0 linhas afetadas, sem erro -- RLS de schools nem tem policy de UPDATE pra essas roles)', async () => {
    const school = await createTestSchool();
    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });
    const teacher = await createTestUser({ role: 'teacher', schoolId: school });

    try {
      let r = await regularAdmin.client.from('schools').update({ login_image_url: 'data:image/png;base64,AAA' }).eq('id', school).select();
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('imagem de login');

      r = await teacher.client.from('schools').update({ login_image_url: 'data:image/png;base64,AAA' }).eq('id', school).select();
      expect(r.data ?? []).toHaveLength(0); // RLS bloqueia silenciosamente -- confirma que nada foi escrito

      const { data: unchanged } = await adminClient.from('schools').select('login_image_url').eq('id', school).single();
      expect(unchanged.login_image_url).toBeNull();

      r = await primaryAdmin.client.from('schools').update({ login_image_url: 'data:image/png;base64,IMGDAESCOLA' }).eq('id', school).select();
      expect(r.error).toBeNull();

      const { data: saved } = await adminClient.from('schools').select('login_image_url').eq('id', school).single();
      expect(saved.login_image_url).toBe('data:image/png;base64,IMGDAESCOLA');
    } finally {
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(regularAdmin.id);
      await deleteTestUser(teacher.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('get_school_login_image devolve a imagem certa por código (anon), null pra código inexistente, e isola por escola', async () => {
    const school = await createTestSchool();
    const { data: schoolRow } = await adminClient.from('schools').select('school_code').eq('id', school).single();
    await adminClient.from('schools').update({ login_image_url: 'data:image/png;base64,IMGESCOLA1' }).eq('id', school);

    const schoolSemImagem = await createTestSchool();
    const { data: schoolSemImagemRow } = await adminClient.from('schools').select('school_code').eq('id', schoolSemImagem).single();

    const anon = createClient(SUPABASE_URL, ANON_KEY);

    try {
      const { data: img1, error: err1 } = await anon.rpc('get_school_login_image', { p_school_code: schoolRow.school_code });
      expect(err1).toBeNull();
      expect(img1).toBe('data:image/png;base64,IMGESCOLA1');

      // Normaliza minúsculo/espaço, mesmo padrão de get_turmas_by_school_code.
      const { data: img1b } = await anon.rpc('get_school_login_image', { p_school_code: `  ${schoolRow.school_code.toLowerCase()}  ` });
      expect(img1b).toBe('data:image/png;base64,IMGESCOLA1');

      const { data: img2 } = await anon.rpc('get_school_login_image', { p_school_code: schoolSemImagemRow.school_code });
      expect(img2).toBeNull(); // escola existe mas sem imagem própria -- null, não erro

      const { data: img3, error: err3 } = await anon.rpc('get_school_login_image', { p_school_code: 'ZZ999' });
      expect(err3).toBeNull();
      expect(img3).toBeNull(); // código inexistente -- null, não erro
    } finally {
      await deleteTestSchool(school);
      await deleteTestSchool(schoolSemImagem);
    }
  }, 20000);
});
