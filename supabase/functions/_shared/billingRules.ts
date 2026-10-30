// Régua de cobrança (item 14): modelos padrão, preenchimento de variáveis e hora de Brasília.
// Compartilhado entre run-billing-rules (cron) e test-billing-message (envio de teste).

export type CanalRegua = 'push' | 'email';
export type PassoRegua = { dias: number; canais: CanalRegua[] };

export type VariaveisMensagem = {
  responsavel: string;
  aluno: string;
  valor: string;
  vencimento: string;
  link_pagamento: string;
};

// Sem hífen e sem expor valor a quem não é o responsável financeiro (a cobrança já vai só para ele).
export function modeloPadrao(canal: CanalRegua, dias: number): { assunto: string; texto: string } {
  if (dias < 0) {
    const n = Math.abs(dias);
    const quando = n === 1 ? 'amanhã' : `em ${n} dias`;
    return canal === 'push'
      ? { assunto: `Mensalidade vence ${quando}`, texto: `{aluno}: {valor} vence ${quando} ({vencimento}).` }
      : {
        assunto: `Lembrete: mensalidade de {aluno} vence ${quando}`,
        texto: `Olá, {responsavel}. A cobrança de {aluno} no valor de {valor} vence ${quando}, em {vencimento}. Para pagar: {link_pagamento}`,
      };
  }
  if (dias === 0) {
    return canal === 'push'
      ? { assunto: 'Mensalidade vence hoje', texto: '{aluno}: {valor} vence hoje.' }
      : {
        assunto: 'Sua mensalidade vence hoje',
        texto: 'Olá, {responsavel}. A cobrança de {aluno} no valor de {valor} vence hoje, {vencimento}. Para pagar: {link_pagamento}',
      };
  }
  return canal === 'push'
    ? { assunto: 'Mensalidade em atraso', texto: '{aluno}: {valor} venceu em {vencimento}.' }
    : {
      assunto: 'Cobrança em atraso de {aluno}',
      texto: 'Olá, {responsavel}. A cobrança de {aluno} no valor de {valor}, com vencimento em {vencimento}, ainda está em aberto. Se já pagou, desconsidere esta mensagem. Para pagar: {link_pagamento}',
    };
}

export function preencher(texto: string, v: VariaveisMensagem): string {
  return texto.replace(/\{(responsavel|aluno|valor|vencimento|link_pagamento)\}/g, (_m, chave: keyof VariaveisMensagem) => v[chave] ?? '');
}

export function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Texto puro em HTML: quebra de linha vira <br>, endereço http vira link.
export function textoParaHtml(texto: string): string {
  return escaparHtml(texto)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>');
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// Data (AAAA-MM-DD) e hora de Brasília (UTC-3, sem horário de verão desde 2019).
export function agoraBrasilia(base = new Date()): { data: string; hora: number } {
  const b = new Date(base.getTime() - 3 * 3600 * 1000);
  return { data: b.toISOString().slice(0, 10), hora: b.getUTCHours() };
}

export function somaDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function passosValidos(bruto: unknown): PassoRegua[] {
  if (!Array.isArray(bruto)) return [];
  const out: PassoRegua[] = [];
  for (const p of bruto) {
    const dias = Number((p as { dias?: unknown })?.dias);
    const canais = ((p as { canais?: unknown })?.canais as unknown[] | undefined) ?? [];
    if (!Number.isInteger(dias) || dias < -30 || dias > 60) continue;
    const ok = canais.filter((c): c is CanalRegua => c === 'push' || c === 'email');
    if (ok.length) out.push({ dias, canais: ok });
  }
  return out;
}
