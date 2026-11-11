// Painel de dispositivos de acesso (Control iD, fase 7). Regras puras, sem rede.
// O equipamento manda heartbeat a cada ~30 s; passou de 2 min sem contato = offline.
export const LIMITE_ONLINE_MS = 2 * 60 * 1000;

export function conexaoDoDispositivo(lastSeenAt, agora = Date.now()) {
  if (!lastSeenAt) return 'nunca';
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return 'nunca';
  return agora - t <= LIMITE_ONLINE_MS ? 'online' : 'offline';
}

// Modelos com suporte validado. Novo modelo só entra aqui depois de testado em bancada.
export const MODELOS_DISPOSITIVO = ['iDFace'];

export const ROTULO_CONEXAO = { online: 'Online', offline: 'Offline', nunca: 'Nunca conectou' };
export const ROTULO_STATUS = { pending: 'Aguardando 1º contato', active: 'Ativo', disabled: 'Desativado' };

export function tempoDesde(lastSeenAt, agora = Date.now()) {
  if (!lastSeenAt) return '—';
  const s = Math.max(0, Math.floor((agora - new Date(lastSeenAt).getTime()) / 1000));
  if (s < 60) return 'agora há pouco';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export function validarNovoDispositivo({ name, model }) {
  if (!MODELOS_DISPOSITIVO.includes(model)) return 'Selecione o modelo do dispositivo.';
  const n = (name || '').trim();
  if (!n) return 'Informe o nome do equipamento.';
  if (n.length > 80) return 'O nome pode ter no máximo 80 caracteres.';
  return '';
}
