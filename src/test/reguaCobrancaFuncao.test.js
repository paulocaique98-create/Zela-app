import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials, SUPABASE_URL, SERVICE_ROLE_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// run-billing-rules (item 14): precisa de `npx supabase functions serve` rodando. Resend não é
// configurado no ambiente local, então o e-mail registra "falhou"; o que se confere aqui é a regra:
// só cobrança em aberto no dia do passo, nunca duas vezes, opt out respeitado, fora do horário nada.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const roda = () => fetch(`${SUPABASE_URL}/functions/v1/run-billing-rules`, {
  method: 'POST', headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
}).then(r => r.json());

const hojeBrasilia = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

runIf('Régua de cobrança · run-billing-rules', () => {
  it('envia no dia certo, não repete, respeita opt out e ignora paga', async () => {
    const school = await createTestSchool();
    const familia = await createTestUser({ role: 'family', schoolId: school });
    const familiaSaiu = await createTestUser({ role: 'family', schoolId: school });
    const criados = [];
    try {
      await adminClient.from('schools').update({ features_enabled: { regua_cobranca: true } }).eq('id', school);
      await adminClient.from('billing_rules').insert({
        school_id: school, ativa: true, hora_inicio: 0, hora_fim: 24, passos: [{ dias: -3, canais: ['push', 'email'] }],
      });
      await adminClient.from('billing_channel_prefs').insert({ user_id: familiaSaiu.id, school_id: school, canal: 'push', optou_sair: true });
      const venc = somaDias(hojeBrasilia(), 3);
      const cobranca = async (fam, nome, status = 'PENDING', due = venc) => {
        const { data: aluno } = await adminClient.from('students').insert({ school_id: school, name: nome, family_id: fam.id }).select('id').single();
        const { data, error } = await adminClient.from('financial_charges')
          .insert({ school_id: school, student_id: aluno.id, family_id: fam.id, due_date: due, available_from: somaDias(due, -10), amount_cents: 85000, status })
          .select('id').single();
        expect(error).toBeNull();
        criados.push({ aluno: aluno.id, cobranca: data.id });
        return data.id;
      };
      const aberta = await cobranca(familia, 'Vitest Aberta');
      const optOut = await cobranca(familiaSaiu, 'Vitest OptOut');
      const paga = await cobranca(familia, 'Vitest Paga', 'PAID');
      const outroDia = await cobranca(familia, 'Vitest Outro Dia', 'PENDING', somaDias(venc, 1));

      const r1 = await roda();
      expect(r1.success).toBe(true);
      const { data: envios } = await adminClient.from('billing_dispatches').select('charge_id, canal, status').eq('school_id', school);
      const porCobranca = (id) => (envios || []).filter(e => e.charge_id === id);
      expect(porCobranca(aberta).map(e => e.canal).sort()).toEqual(['email', 'push']);
      expect(porCobranca(optOut).find(e => e.canal === 'push')?.status).toBe('ignorado');
      expect(porCobranca(paga)).toHaveLength(0);
      expect(porCobranca(outroDia)).toHaveLength(0);

      const antes = (envios || []).length;
      await roda();
      const { data: depois } = await adminClient.from('billing_dispatches').select('id, tentativas, status').eq('school_id', school);
      expect(depois).toHaveLength(antes);
      // envio que já saiu como "enviado" ou "ignorado" não é tentado de novo
      expect(depois.filter(e => e.status !== 'falhou').every(e => e.tentativas === 1)).toBe(true);

      // fora do horário permitido não envia nada novo
      await adminClient.from('billing_dispatches').delete().eq('school_id', school);
      const hora = new Date(Date.now() - 3 * 3600 * 1000).getUTCHours();
      await adminClient.from('billing_rules').update(hora < 12 ? { hora_inicio: 13, hora_fim: 14 } : { hora_inicio: 1, hora_fim: 2 }).eq('school_id', school);
      await roda();
      const { data: fora } = await adminClient.from('billing_dispatches').select('id').eq('school_id', school);
      expect(fora || []).toHaveLength(0);
    } finally {
      await adminClient.from('billing_dispatches').delete().eq('school_id', school);
      await adminClient.from('billing_channel_prefs').delete().eq('school_id', school);
      await adminClient.from('billing_rules').delete().eq('school_id', school);
      for (const c of criados) {
        await adminClient.from('financial_charges').delete().eq('id', c.cobranca);
        await adminClient.from('students').delete().eq('id', c.aluno);
      }
      await adminClient.from('notifications').delete().eq('school_id', school);
      await deleteTestUser(familia.id);
      await deleteTestUser(familiaSaiu.id);
      await deleteTestSchool(school);
    }
  });

  it('recusa chamada sem service_role', async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/run-billing-rules`, { method: 'POST', headers: { Authorization: 'Bearer x.y.z' } });
    expect([401, 403]).toContain(r.status);
  });
});
