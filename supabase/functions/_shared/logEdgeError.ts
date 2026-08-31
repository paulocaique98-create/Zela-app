// P1.5 (Prompt Mestre de Evolução) — Observabilidade backend básica.
//
// Loga erros de Edge Functions críticas (webhooks e fluxo financeiro) via
// RPC autenticado (PostgREST) — o único caminho comprovadamente confiável
// pra escrita neste projeto (mesmo padrão de log_cron_job_run, P0.1).
// Best-effort: uma falha ao logar NUNCA deve mascarar ou substituir o erro
// original que está sendo logado.
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
    await adminClient.rpc('log_edge_function_error', {
      p_function_name: functionName,
      p_level: level,
      p_message: String(message).slice(0, 2000),
      p_context: context,
      p_school_id: schoolId,
    });
  } catch (_) {
    // Best-effort — observabilidade não pode derrubar nem mascarar o
    // fluxo real da function que chamou isso.
  }
}
