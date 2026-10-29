import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { sendFamilyNotification } from '../_shared/sendFamilyNotification.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';

// Biblioteca (item 4 do PLANO_EXPANSAO_GESTAO): cron diário avisa a família do
// aluno 1 dia antes do prazo e no atraso. Só escolas com o módulo `biblioteca`
// ligado (features_enabled.biblioteca === true) e só empréstimos de aluno.
// Cada empréstimo recebe um aviso de véspera e um de atraso (carimbos
// aviso_vespera_em e aviso_atraso_em), então reexecutar não duplica.
// Autenticação: mesma regra de send-financial-reminders (token service_role;
// o gateway já barra JWT mal assinado com verify_jwt ligado).
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

// Data de hoje no fuso de Brasília, para o aviso não virar no meio da tarde (UTC).
function hojeBrasilia(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

serve(async (req) => {
  if (!isServiceRoleToken(req.headers.get('Authorization'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const hoje = hojeBrasilia();
    const amanha = somarDias(hoje, 1);

    const { data: escolas, error: escolasErr } = await adminClient
      .from('schools').select('id, features_enabled');
    if (escolasErr) throw escolasErr;
    const ligadas = (escolas || [])
      .filter((s: { features_enabled?: Record<string, unknown> }) => s.features_enabled?.biblioteca === true)
      .map((s: { id: string }) => s.id);
    if (ligadas.length === 0) {
      return new Response(JSON.stringify({ success: true, vespera: 0, atraso: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    const base = () => adminClient
      .from('library_loans')
      .select('id, school_id, student_id, devolver_ate, library_copies(library_items(titulo)), students(name, family_id)')
      .in('school_id', ligadas)
      .eq('borrower_type', 'aluno')
      .is('devolvido_em', null);

    const { data: vespera, error: vErr } = await base().eq('devolver_ate', amanha).is('aviso_vespera_em', null).limit(1000);
    if (vErr) throw vErr;
    const { data: atrasados, error: aErr } = await base().lt('devolver_ate', hoje).is('aviso_atraso_em', null).limit(1000);
    if (aErr) throw aErr;

    let enviadosVespera = 0;
    let enviadosAtraso = 0;

    // deno-lint-ignore no-explicit-any
    const avisar = async (e: any, atraso: boolean) => {
      const familyId = e.students?.family_id;
      if (!familyId) return false;
      const titulo = e.library_copies?.library_items?.titulo || 'o livro';
      const aluno = e.students?.name || 'seu filho(a)';
      try {
        await sendFamilyNotification(adminClient, {
          schoolId: e.school_id,
          familyId,
          studentId: e.student_id,
          type: 'biblioteca',
          message: atraso
            ? `O livro "${titulo}" com ${aluno} está atrasado. A devolução era em ${dataBR(e.devolver_ate)}.`
            : `O livro "${titulo}" com ${aluno} deve ser devolvido amanhã (${dataBR(e.devolver_ate)}).`,
          pushTitle: atraso ? 'Livro da biblioteca atrasado' : 'Devolução de livro amanhã',
          pushBody: atraso ? `${aluno} está com "${titulo}" além do prazo.` : `${aluno} deve devolver "${titulo}" amanhã.`,
          pushTag: atraso ? 'biblioteca-atraso' : 'biblioteca-vespera',
        });
        await adminClient.from('library_loans')
          .update(atraso ? { aviso_atraso_em: hoje } : { aviso_vespera_em: hoje })
          .eq('id', e.id).eq('school_id', e.school_id);
        return true;
      } catch (err) {
        console.error(`[notify-biblioteca-prazos] Erro no empréstimo ${e.id}:`, err);
        return false;
      }
    };

    for (const e of vespera || []) if (await avisar(e, false)) enviadosVespera++;
    for (const e of atrasados || []) if (await avisar(e, true)) enviadosAtraso++;

    try {
      await adminClient.rpc('log_cron_job_run', {
        p_job_name: 'notify-biblioteca-prazos-job',
        p_status_code: 200,
        p_detail: `vespera:${enviadosVespera},atraso:${enviadosAtraso}`,
      });
    } catch (_) { /* observabilidade não derruba o job */ }

    return new Response(JSON.stringify({ success: true, vespera: enviadosVespera, atraso: enviadosAtraso }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    try {
      await logEdgeError(adminClient, 'notify-biblioteca-prazos', err.message || String(err));
      await adminClient.rpc('log_cron_job_run', {
        p_job_name: 'notify-biblioteca-prazos-job',
        p_status_code: 500,
        p_detail: String(err.message || err).slice(0, 500),
      });
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
