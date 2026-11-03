// Bloqueio por inadimplência no servidor. As Edge Functions leem o chamador com service_role,
// que ignora RLS, então a checagem precisa ser explícita. Developer é isento (school_id nulo ou papel).
// Falha fechada: se a consulta der erro, a chamada é recusada.
export async function exigirEscolaLiberada(
  client: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  chamador: { role?: string | null; school_id?: string | null } | null | undefined,
): Promise<void> {
  if (!chamador || chamador.role === 'developer' || !chamador.school_id) return;
  const { data, error } = await client.rpc('escola_liberada', { p_school_id: chamador.school_id });
  if (error) throw new Error('Não foi possível confirmar o acesso da escola.');
  if (data === false) throw new Error('Acesso suspenso por pendência financeira.');
}
