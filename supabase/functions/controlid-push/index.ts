import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { sendPush } from '../_shared/push.ts';
import { MAX_BODY_BYTES, eventoPedeCheckin, extrairDeviceId, montarComandoPush, parseEventos, parseResultado, parseRota } from './parser.ts';
import type { EventoParseado } from './parser.ts';

// Fase 6: rosto reconhecido -> mesma solicitação do totem (status pending_*), via função SQL.
// A Recepção confirma no Monitor; aqui nada é confirmado nem vai para attendance_logs.
// Falha aqui nunca derruba a resposta ao equipamento (o evento já está gravado).
// deno-lint-ignore no-explicit-any
async function solicitarCheckin(adminClient: any, disp: { id: string; school_id: string }, e: EventoParseado) {
  try {
    const { data, error } = await adminClient.rpc('solicitar_checkin_dispositivo', {
      p_device_ref: disp.id,
      p_external_user_id: e.external_user_id,
      p_device_time: e.device_time,
    });
    if (error) throw error;
    if (data?.resultado !== 'solicitado') return;

    const entrada = data.status === 'pending_entry';
    const tipo = entrada ? 'checkin_requested' : 'checkout_requested';
    const mensagem = entrada
      ? `${data.student_name} chegou e aguarda confirmação da recepção.`
      : `${data.student_name} está saindo e aguarda confirmação da recepção.`;

    const { data: aluno } = await adminClient.from('students').select('family_id, school_id').eq('id', data.student_id).eq('school_id', disp.school_id).single();
    const { data: vinculos } = await adminClient.from('student_guardians').select('guardian_id').eq('student_id', data.student_id);
    const familias = new Set<string>((vinculos || []).map((g: { guardian_id: string }) => g.guardian_id));
    if (aluno?.family_id) familias.add(aluno.family_id);
    if (familias.size === 0) return;
    const lista = Array.from(familias);

    await adminClient.from('notifications').insert(lista.map((family_id) => ({
      school_id: disp.school_id, family_id, student_id: data.student_id, type: tipo, message: mensagem,
    })));
    await sendPush(adminClient, lista, { title: entrada ? 'Chegada detectada' : 'Saída detectada', body: mensagem, url: '/', tag: tipo });
  } catch (err) {
    await logEdgeError(adminClient, 'controlid-push', `solicitar checkin: ${err instanceof Error ? err.message : String(err)}`, { rota: 'checkin' }, disp.school_id);
  }
}

// Endpoint público do equipamento Control iD (iDFace). verify_jwt = false
// (config.toml): não há login Supabase; a autenticidade vem do TOKEN no path,
// /controlid-push/<token>/<rota>, conferido por hash no banco
// (autenticar_dispositivo_acesso). O school_id vem do dispositivo, nunca do
// corpo. Sem CORS: chamada equipamento -> servidor.
//
// Fase 5: /push entrega o próximo comando da fila (device_commands, um em voo por
// dispositivo) e /result conclui o comando em voo.
// Dispositivo 'pending' (ainda não ativado pela Gestão): só heartbeat; /push vazio;
// access_log/door/result são descartados até virar 'active'.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const resp = (status: number, corpo: unknown = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: JSON_HEADERS });

serve(async (req) => {
  const url = new URL(req.url);
  const r = parseRota(url.pathname);
  // Resposta única para rota/token inválidos: não revela o que falhou.
  if (!r) return resp(404, { error: 'not found' });

  const metodoOk = r.rota === 'push' ? req.method === 'GET' || req.method === 'POST' : req.method === 'POST';
  if (!metodoOk) return resp(405, { error: 'method not allowed' });

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // Limite de tamanho (cabeçalho e leitura real).
    const declarado = Number(req.headers.get('content-length') ?? 0);
    if (declarado > MAX_BODY_BYTES) return resp(413, { error: 'payload too large' });

    let corpo: unknown = null;
    if (req.method === 'POST') {
      const texto = await req.text();
      if (texto.length > MAX_BODY_BYTES) return resp(413, { error: 'payload too large' });
      if (texto) {
        try { corpo = JSON.parse(texto); } catch { return resp(400, { error: 'invalid json' }); }
      }
    }

    const deviceId = extrairDeviceId(url.searchParams, corpo);
    const { data: auth, error: authErr } = await adminClient.rpc('autenticar_dispositivo_acesso', {
      p_token: r.token,
      p_device_id: deviceId,
    });
    if (authErr) {
      await logEdgeError(adminClient, 'controlid-push', `auth rpc: ${authErr.message}`, { rota: r.rota });
      return resp(500, { error: 'internal error' });
    }
    const disp = Array.isArray(auth) ? auth[0] : auth;
    if (!disp) return resp(404, { error: 'not found' });

    const ativo = disp.status === 'active';

    if (r.rota === 'push') {
      if (!ativo) return resp(200, {}); // pending/disabled: nenhum comando é entregue
      const { data: prox, error: proxErr } = await adminClient.rpc('proximo_comando_dispositivo', { p_device_ref: disp.id });
      if (proxErr) {
        await logEdgeError(adminClient, 'controlid-push', `proximo comando: ${proxErr.message}`, { rota: r.rota }, disp.school_id);
        return resp(500, { error: 'internal error' });
      }
      const cmd = Array.isArray(prox) ? prox[0] : prox;
      if (!cmd) return resp(200, {});

      let foto: string | undefined;
      if (cmd.command === 'set_photo') {
        // A foto sai do Storage privado só agora e não é gravada nem logada.
        const { data: blob, error: dlErr } = await adminClient.storage.from('person-photos').download(cmd.photo_storage_path);
        if (dlErr || !blob) {
          await adminClient.rpc('concluir_comando_dispositivo', { p_device_ref: disp.id, p_ok: false, p_error: 'Foto indisponível no Storage.', p_command_id: cmd.id });
          return resp(200, {});
        }
        foto = base64Encode(new Uint8Array(await blob.arrayBuffer()));
      }
      const push = montarComandoPush(cmd.command, Number(cmd.external_user_id), cmd.user_name, foto);
      if (!push) {
        await adminClient.rpc('concluir_comando_dispositivo', { p_device_ref: disp.id, p_ok: false, p_error: 'Comando não pôde ser montado.', p_command_id: cmd.id });
        return resp(200, {});
      }
      return resp(200, push);
    }

    if (r.rota === 'result' && ativo) {
      const res = parseResultado(corpo);
      const { error: concErr } = await adminClient.rpc('concluir_comando_dispositivo', {
        p_device_ref: disp.id, p_ok: res.ok, p_error: res.erro, p_command_id: null,
      });
      if (concErr) {
        await logEdgeError(adminClient, 'controlid-push', `concluir comando: ${concErr.message}`, { rota: r.rota }, disp.school_id);
      }
    }

    const eventos = parseEventos(r.rota, corpo).filter((e) => ativo || e.event_type === 'alive');

    for (const e of eventos) {
      const { data: novo, error } = await adminClient.rpc('registrar_evento_dispositivo', {
        p_device_ref: disp.id,
        p_event_type: e.event_type,
        p_dedupe_key: e.dedupe_key,
        p_device_time: e.device_time,
        p_external_user_id: e.external_user_id,
        p_payload: e.payload,
      });
      if (error) {
        await logEdgeError(adminClient, 'controlid-push', `registrar evento: ${error.message}`, { rota: r.rota, tipo: e.event_type }, disp.school_id);
        continue;
      }
      // Fase 6: só evento NOVO (a deduplicação devolve false no reenvio) e de dispositivo ativo.
      if (ativo && novo === true && eventoPedeCheckin(e)) {
        await solicitarCheckin(adminClient, disp, e);
      }
    }
    return resp(200, {});
  } catch (e) {
    await logEdgeError(adminClient, 'controlid-push', e instanceof Error ? e.message : String(e), { rota: r.rota });
    return resp(500, { error: 'internal error' });
  }
});
