// Bloqueio por inadimplência no servidor. As Edge Functions leem o chamador com service_role,
// que ignora RLS, então a checagem precisa ser explícita. Developer é isento (school_id nulo ou papel).
// Falha fechada: se a consulta der erro, a chamada é recusada.
export async function exigirEscolaLiberada(
  // deno-lint-ignore no-explicit-any
  client: { rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }> },
  chamador: { role?: string | null; school_id?: string | null } | null | undefined,
): Promise<void> {
  if (!chamador || chamador.role === 'developer' || !chamador.school_id) return;
  const { data, error } = await client.rpc('escola_liberada', { p_school_id: chamador.school_id });
  if (error) throw new Error('Não foi possível confirmar o acesso da escola.');
  if (data === false) throw new Error('Acesso suspenso por pendência financeira.');
}
