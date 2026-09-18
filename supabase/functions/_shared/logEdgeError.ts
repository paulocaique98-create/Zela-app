// P1.5 (Prompt Mestre de Evolução) — Observabilidade backend básica.
// Fase B2 do PLANO_LOGGING_ERROS_PORTAL_DEV.md.
//
// Loga erros de Edge Functions via RPC autenticado (PostgREST) — o único
// caminho comprovadamente confiável pra escrita neste projeto (mesmo padrão
// de log_cron_job_run, P0.1). Best-effort: uma falha ao logar NUNCA deve
// mascarar ou substituir o erro original que está sendo logado.
//
// Passou a gravar em error_logs (tabela unificada, Fase A) em vez de
// edge_function_logs -- mesma assinatura de sempre, nenhuma das 4 chamadas
// existentes (create-avulsa-charge, create-financial-contract,
// payment-webhook, send-financial-reminders) precisou mudar. A tabela
// antiga (edge_function_logs) continua existindo pra leitura histórica via
// SQL Editor, só para de receber linha nova a partir de agora.
//
// deno-lint-ignore no-explicit-any
export async function logEdgeError(
  adminClient: any,
  functionName: string,
  message: string,
  context: Record<string, unknown> = {},
  schoolId: string | null = null,
  level: 'error' | 'warn' = 'error'
): Promise<void> {
  try {
    await adminClient.rpc('log_error', {
      p_source: 'edge_function',
      p_category: functionName,
      p_message: String(message).slice(0, 2000),
      p_severity: level,
      p_context: context,
      p_school_id: schoolId,
    });
  } catch (_) {
    // Best-effort — observabilidade não pode derrubar nem mascarar o
    // fluxo real da function que chamou isso.
  }
}
