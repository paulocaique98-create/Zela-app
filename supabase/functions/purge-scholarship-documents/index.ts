import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';

// LGPD (item 13, decisão D11): apaga do Storage os documentos de renda dos pedidos de bolsa
// cuja bolsa terminou há mais de 12 meses (ou cuja decisão tem mais de 12 meses, se negada ou
// cancelada) e zera a renda declarada. A lista vem de bolsas_documentos_para_apagar() e a
// limpeza das linhas de bolsas_expurgar_pedidos(). Roda pelo cron; só aceita token service_role.
// Só remove a linha depois que o arquivo saiu do bucket, então reexecutar não perde nada.
function isServiceRoleToken(authHeader: string | null): boolean {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (!isServiceRoleToken(req.headers.get('Authorization'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data: docs, error } = await adminClient.rpc('bolsas_documentos_para_apagar');
    if (error) throw error;
    const lista = (docs || []) as Array<{ document_id: string; application_id: string; path: string }>;
    if (lista.length === 0) {
      return new Response(JSON.stringify({ apagados: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    const { error: removeError } = await adminClient.storage.from('scholarships').remove(lista.map((d) => d.path));
    if (removeError) throw removeError;

    // Um pedido só é expurgado quando todos os documentos dele saíram do bucket (lote único acima).
    const pedidos = [...new Set(lista.map((d) => d.application_id))];
    const { error: expurgoError } = await adminClient.rpc('bolsas_expurgar_pedidos', { p_applications: pedidos });
    if (expurgoError) throw expurgoError;

    return new Response(JSON.stringify({ apagados: lista.length, pedidos: pedidos.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    await logEdgeError(adminClient, 'purge-scholarship-documents', (err as Error).message || String(err), {}, null, 'error');
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
