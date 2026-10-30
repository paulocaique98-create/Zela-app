// Régua de cobrança (PLANO_EXPANSAO_GESTAO.md, item 14). Só apoio de tela: o envio, os horários e a
// regra de "nunca duas vezes" ficam no servidor (run-billing-rules e billing_dispatches).
// dias < 0 é antes do vencimento, 0 é o dia e > 0 é depois.

export const CANAIS = { push: 'Notificação no app', email: 'E-mail' };

export const VARIAVEIS = ['responsavel', 'aluno', 'valor', 'vencimento', 'link_pagamento'];

export const PASSOS_PADRAO = [
  { dias: -3, canais: ['push', 'email'] },
  { dias: 0, canais: ['push', 'email'] },
  { dias: 3, canais: ['push', 'email'] },
  { dias: 10, canais: ['email'] },
];

export const MAX_PASSOS = 10;

export function rotuloDoPasso(dias) {
  if (dias === 0) return 'No dia do vencimento';
  const n = Math.abs(dias);
  const unidade = n === 1 ? 'dia' : 'dias';
  return dias < 0 ? `${n} ${unidade} antes do vencimento` : `${n} ${unidade} depois do vencimento`;
}

// Modelo padrão do passo (espelha supabase/functions/_shared/billingRules.ts).
export function modeloPadrao(canal, dias) {
  if (dias < 0) {
    const n = Math.abs(dias);
    const quando = n === 1 ? 'amanhã' : `em ${n} dias`;
    return canal === 'push'
      ? { assunto: `Mensalidade vence ${quando}`, texto: `{aluno}: {valor} vence ${quando} ({vencimento}).` }
      : { assunto: `Lembrete: mensalidade de {aluno} vence ${quando}`, texto: `Olá, {responsavel}. A cobrança de {aluno} no valor de {valor} vence ${quando}, em {vencimento}. Para pagar: {link_pagamento}` };
  }
  if (dias === 0) {
    return canal === 'push'
      ? { assunto: 'Mensalidade vence hoje', texto: '{aluno}: {valor} vence hoje.' }
      : { assunto: 'Sua mensalidade vence hoje', texto: 'Olá, {responsavel}. A cobrança de {aluno} no valor de {valor} vence hoje, {vencimento}. Para pagar: {link_pagamento}' };
  }
  return canal === 'push'
    ? { assunto: 'Mensalidade em atraso', texto: '{aluno}: {valor} venceu em {vencimento}.' }
    : { assunto: 'Cobrança em atraso de {aluno}', texto: 'Olá, {responsavel}. A cobrança de {aluno} no valor de {valor}, com vencimento em {vencimento}, ainda está em aberto. Se já pagou, desconsidere esta mensagem. Para pagar: {link_pagamento}' };
}

export const EXEMPLO = {
  responsavel: 'Maria', aluno: 'Aluno Exemplo', valor: 'R$ 850,00', vencimento: '10/11/2026', link_pagamento: 'https://zelaedu.com.br/exemplo',
};

export function preencher(texto, vars = EXEMPLO) {
  return String(texto || '').replace(/\{(responsavel|aluno|valor|vencimento|link_pagamento)\}/g, (_m, k) => vars[k] ?? '');
}

// Variáveis escritas que o servidor não conhece (ex.: {nome}) ficariam literais na mensagem.
export function variaveisDesconhecidas(texto) {
  const achadas = String(texto || '').match(/\{[^{}\s]*\}/g) || [];
  return [...new Set(achadas.filter(v => !VARIAVEIS.includes(v.slice(1, -1))))];
}

// Devolve a lista de passos limpa e ordenada, ou lança Error com a mensagem para a tela.
export function validarPassos(passos) {
  if (!Array.isArray(passos) || passos.length === 0) throw new Error('Inclua ao menos um passo na régua.');
  if (passos.length > MAX_PASSOS) throw new Error(`A régua aceita até ${MAX_PASSOS} passos.`);
  const vistos = new Set();
  for (const p of passos) {
    if (!Number.isInteger(p.dias) || p.dias < -30 || p.dias > 60) throw new Error('Os dias do passo vão de 30 antes a 60 depois do vencimento.');
    if (vistos.has(p.dias)) throw new Error('Há dois passos no mesmo dia.');
    vistos.add(p.dias);
    if (!p.canais?.length || p.canais.some(c => !CANAIS[c])) throw new Error('Cada passo precisa de ao menos um canal.');
  }
  return [...passos].sort((a, b) => a.dias - b.dias).map(p => ({ dias: p.dias, canais: [...p.canais] }));
}

export function validarHorario(inicio, fim) {
  const i = Number(inicio); const f = Number(fim);
  if (!Number.isInteger(i) || !Number.isInteger(f) || i < 0 || i > 23 || f < 1 || f > 24) throw new Error('Horário inválido.');
  if (f <= i) throw new Error('O horário final precisa ser depois do inicial.');
  return { inicio: i, fim: f };
}

// Resumo de envios de uma cobrança: { enviado, falhou, ignorado } por contagem.
export function resumoDosEnvios(envios = []) {
  const r = { enviado: 0, falhou: 0, ignorado: 0 };
  for (const e of envios) if (r[e.status] !== undefined) r[e.status]++;
  return r;
}
