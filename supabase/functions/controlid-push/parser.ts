// Parser puro (sem Deno, sem rede) das mensagens do equipamento Control iD.
// Formato baseado na doc oficial; será ajustado com amostras reais na fase 9.
// Regra de segurança: NADA de imagem/biometria sai daqui. Campos suspeitos
// são removidos e textos longos são cortados antes de qualquer gravação.

export const MAX_BODY_BYTES = 64 * 1024;

export type Rota = 'push' | 'result' | 'dao' | 'device_is_alive' | 'door' | 'access_photo';
const ROTAS: Rota[] = ['push', 'result', 'dao', 'device_is_alive', 'door', 'access_photo'];

export type TipoEvento = 'access_log' | 'alive' | 'identification' | 'door' | 'push_result' | 'other';

export interface EventoParseado {
  event_type: TipoEvento;
  dedupe_key: string;
  device_time: string | null; // ISO
  external_user_id: number | null;
  payload: Record<string, unknown>;
}

// /functions/v1/controlid-push/<token>/<rota>  (ou sem o prefixo, em testes)
export function parseRota(pathname: string): { token: string; rota: Rota } | null {
  const partes = pathname.split('/').filter(Boolean);
  const i = partes.indexOf('controlid-push');
  const resto = i >= 0 ? partes.slice(i + 1) : partes;
  if (resto.length !== 2) return null;
  const [token, rota] = resto;
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  if (!ROTAS.includes(rota as Rota)) return null;
  return { token, rota: rota as Rota };
}

function paraInteiro(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

// deviceId: query (?deviceId=) no push; corpo (device_id) no monitor.
export function extrairDeviceId(query: URLSearchParams, corpo: unknown): number | null {
  const q = paraInteiro(query.get('deviceId') ?? query.get('device_id'));
  if (q !== null) return q;
  if (corpo && typeof corpo === 'object') {
    const c = corpo as Record<string, unknown>;
    return paraInteiro(c.device_id ?? c.deviceId);
  }
  return null;
}

// time do equipamento: epoch em segundos (ou ms) ou string de data.
export function paraIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  let d: Date;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    d = new Date(n < 1e11 ? n * 1000 : n);
  } else {
    d = new Date(String(v));
  }
  const t = d.getTime();
  // recusa datas absurdas (relógio do equipamento zerado)
  if (Number.isNaN(t) || t < Date.UTC(2020, 0, 1) || t > Date.now() + 24 * 3600 * 1000) return null;
  return d.toISOString();
}

const CHAVES_PROIBIDAS = /(image|photo|foto|face|template|biometr|base64|password|senha|token)/i;

// Remove biometria/segredos e limita tamanho. Profundidade e nº de chaves limitados.
export function sanitizar(v: unknown, prof = 0): unknown {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) : v;
  if (prof >= 4) return null;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => sanitizar(x, prof + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
      if (CHAVES_PROIBIDAS.test(k)) continue;
      out[k.slice(0, 60)] = sanitizar(val, prof + 1);
    }
    return out;
  }
  return null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// Converte o corpo recebido numa lista de eventos prontos para gravar.
export function parseEventos(rota: Rota, corpo: unknown): EventoParseado[] {
  const c = obj(corpo);

  if (rota === 'device_is_alive') {
    const balde = Math.floor(Date.now() / 60000); // 1 heartbeat por minuto
    return [{ event_type: 'alive', dedupe_key: `alive:${balde}`, device_time: null, external_user_id: null, payload: {} }];
  }

  if (rota === 'dao') {
    const mudancas = Array.isArray(c.object_changes) ? c.object_changes.slice(0, 50) : [];
    const eventos: EventoParseado[] = [];
    for (const m of mudancas) {
      const mm = obj(m);
      if (mm.object !== 'access_logs' || (mm.type && mm.type !== 'inserted')) continue;
      const vals = obj(mm.values);
      const idLog = vals.id !== undefined ? String(vals.id).slice(0, 60) : null;
      const quando = paraIso(vals.time);
      const user = paraInteiro(vals.user_id);
      eventos.push({
        event_type: 'access_log',
        dedupe_key: idLog ? `log:${idLog}` : `log:${quando ?? 'x'}:${user ?? 'x'}:${String(vals.event ?? '')}`,
        device_time: quando,
        external_user_id: user && user > 0 ? user : null, // 0 = não identificado
        payload: sanitizar({ event: vals.event, portal_id: vals.portal_id, user_id: user, identification_rule_id: vals.identification_rule_id }) as Record<string, unknown>,
      });
    }
    return eventos;
  }

  if (rota === 'door') {
    const quando = paraIso(c.time);
    const chave = `door:${String(c.id ?? '')}:${String(c.door ?? '')}:${String(c.action ?? '')}:${quando ?? Math.floor(Date.now() / 1000)}`;
    return [{ event_type: 'door', dedupe_key: chave.slice(0, 200), device_time: quando, external_user_id: null, payload: sanitizar({ door: c.door, action: c.action, open: c.open }) as Record<string, unknown> }];
  }

  if (rota === 'result') {
    // O corpo pode trazer dados de usuários/biometria: só guarda o resumo.
    const idCmd = String(c.response_id ?? c.uuid ?? c.id ?? '').slice(0, 80);
    const erro = c.error !== undefined ? String(c.error).slice(0, 200) : null;
    return [{
      event_type: 'push_result',
      dedupe_key: `result:${idCmd || Date.now()}`,
      device_time: null,
      external_user_id: null,
      payload: { command_id: idCmd || null, error: erro },
    }];
  }

  return []; // access_photo: ignorado (foto só entra numa etapa própria, Storage privado)
}
