import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';
import { montarDadosEscola } from '../lib/escolaForm.js';

// "Editar Escola" do Portal do Dev sem os campos de Turmas e de Módulos
// (28/09/2026): salvar a escola não pode apagar as turmas nem mexer nos
// módulos que já estavam configurados.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Editar Escola (Portal do Dev)', () => {
  it('salvar pelo formulário mantém as turmas e os módulos da escola', async () => {
    const schoolId = await createTestSchool();
    const dev = await createTestUser({ role: 'developer' });
    const turmas = ['Nido', 'Kids I - Matutino', 'Kids II Frutos- Vespertino'];
    const features = { cadastros: true, checkin: true, financeiro: true, diario: true, liveness_detection: true, qr_checkin: false };
    try {
      await adminClient.from('schools').update({ turmas, features_enabled: features }).eq('id', schoolId);

      const dados = montarDadosEscola({
        formData: { name: 'Vitest Escola Editada', cnpj: '', email: 'x@y.com', phone: '', address: '', plan: 'basic', is_active: true, notes: 'nota' },
        limits: { autorizados_por_responsavel: 3, autorizados_transporte: 1 },
        pedagogicalMethod: 'montessori',
        customClassLabel: '',
        isNew: false,
      });
      const { error } = await dev.client.from('schools').update(dados).eq('id', schoolId);
      expect(error).toBeNull();

      const { data } = await adminClient.from('schools').select('name, notes, limits, pedagogical_method, turmas, features_enabled').eq('id', schoolId).single();
      expect(data).toMatchObject({ name: 'Vitest Escola Editada', notes: 'nota', pedagogical_method: 'montessori' });
      expect(data.limits.autorizados_por_responsavel).toBe(3);
      expect(data.turmas).toEqual(turmas);
      expect(data.features_enabled).toEqual(features);
    } finally {
      await deleteTestUser(dev.id);
      await deleteTestSchool(schoolId);
    }
  });
});
