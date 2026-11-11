import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { MAX_BODY_BYTES, extrairDeviceId, parseEventos, parseRota } from './parser.ts';

// Endpoint público do equipamento Control iD (iDFace). verify_jwt = false
// (config.toml): não há login Supabase; a autenticidade vem do TOKEN no path,
// /controlid-push/<token>/<rota>, conferido por hash no banco
// (autenticar_dispositivo_acesso). O school_id vem do dispositivo, nunca do
// corpo. Sem CORS: chamada equipamento -> servidor.
//
// Fase 3: sem fila de comandos ainda (fase 5), então /push responde vazio.
// Dispositivo 'pending' (ainda não ativado pela Gestão): só heartbeat e push;
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

    if (r.rota === 'push') return resp(200, {}); // sem comandos até a fase 5

    const ativo = disp.status === 'active';
    const eventos = parseEventos(r.rota, corpo).filter((e) => ativo || e.event_type === 'alive');

    for (const e of eventos) {
      const { error } = await adminClient.rpc('registrar_evento_dispositivo', {
        p_device_ref: disp.id,
        p_event_type: e.event_type,
        p_dedupe_key: e.dedupe_key,
        p_device_time: e.device_time,
        p_external_user_id: e.external_user_id,
        p_payload: e.payload,
      });
      if (error) {
        await logEdgeError(adminClient, 'controlid-push', `registrar evento: ${error.message}`, { rota: r.rota, tipo: e.event_type }, disp.school_id);
      }
    }
    return resp(200, {});
  } catch (e) {
    await logEdgeError(adminClient, 'controlid-push', e instanceof Error ? e.message : String(e), { rota: r.rota });
    return resp(500, { error: 'internal error' });
  }
});
