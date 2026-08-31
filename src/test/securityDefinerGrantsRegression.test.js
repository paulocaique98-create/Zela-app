import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient } from './supabaseTestHelpers.js';

// Guarda de regressão pro bug que se repetiu 3x nesta mesma sessão de
// auditoria (P0.1, P0.2, P1.5 — ver RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md
// seção 44): Postgres concede EXECUTE a PUBLIC por padrão na criação de
// qualquer função — um `GRANT EXECUTE ... TO service_role` sozinho NÃO
// revoga isso. Toda função SECURITY DEFINER que existe só pra uso
// interno (chamada apenas por outra função, ou por uma Edge Function via
// service_role) precisa ter EXECUTE revogado de PUBLIC/anon/authenticated
// explicitamente — senão fica exposta a qualquer usuário autenticado (ou
// até anônimo) sem ninguém perceber, até alguém tropeçar nisso meses
// depois.
//
// Roda no CI (usa adminClient/service_role, não precisa de usuário de
// teste) e falha imediatamente se qualquer função desta lista ganhar
// grant pra anon/authenticated por engano. Ao criar uma função nova que
// deveria ser interna-only, adicione o nome dela aqui.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const INTERNAL_ONLY_FUNCTIONS = [
  'get_cron_secret',
  'set_cron_secret',
  'get_school_gateway_secret',
  'set_school_gateway_secret',
  'kiosk_request_access',
  'log_cron_job_run',
  'log_edge_function_error',
  'check_rate_limit',
  'find_school_by_webhook_token',
  'list_security_definer_grantees',
];

runIf('Regressão de segurança — grants de EXECUTE em funções internas SECURITY DEFINER', () => {
  it.each(INTERNAL_ONLY_FUNCTIONS)('%s não tem EXECUTE liberado pra anon nem authenticated', async (functionName) => {
    const { data: grantees, error } = await adminClient.rpc('list_security_definer_grantees', { p_function_name: functionName });
    expect(error).toBeNull();
    expect(grantees, `função "${functionName}" não encontrada em public — nome mudou ou foi removida?`).not.toBeNull();
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('authenticated');
    // Sempre deve continuar chamável por quem precisa de verdade.
    expect(grantees).toContain('service_role');
  });
});
