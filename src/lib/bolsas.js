// Gestão de bolsas (PLANO_EXPANSAO_GESTAO.md, item 13). Só apoio de tela: o desconto final
// é sempre recalculado no servidor (supabase/functions/_shared/scholarshipDiscount.ts).

export const DIAS_AVISO_RENOVACAO = 30;
export const MAX_DOCUMENTOS = 6;

export const STATUS_PEDIDO = {
  enviada: 'Enviada',
  em_analise: 'Em análise',
  aprovada: 'Aprovada',
  negada: 'Negada',
  cancelada: 'Cancelada',
};

export const PEDIDO_ABERTO = ['enviada', 'em_analise'];

export const brl = (cents) => ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dataBR = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR') : 'sem data');

// "30%" ou "R$ 200,00 por mês".
export function descricaoDoBeneficio(item) {
  if (item?.percentual !== null && item?.percentual !== undefined) return `${Number(item.percentual)}%`;
  return `${brl(item?.valor_cents)} por mês`;
}

// Texto digitado ("1.500,50") para centavos; 0 quando inválido.
export function reaisParaCentavos(texto) {
  const n = parseFloat(String(texto ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export function vigenteEm(grant, dataISO) {
  if (!grant || grant.encerrada_em) return false;
  if (grant.inicio > dataISO) return false;
  return !grant.fim || grant.fim >= dataISO;
}

export function diasParaFim(fim, hojeISO) {
  if (!fim) return null;
  const ms = new Date(`${fim}T00:00:00Z`) - new Date(`${hojeISO}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

// Concessão vigente que termina nos próximos 30 dias: aviso brass para renovar.
export function precisaRenovar(grant, hojeISO) {
  if (!vigenteEm(grant, hojeISO)) return false;
  const dias = diasParaFim(grant.fim, hojeISO);
  return dias !== null && dias <= DIAS_AVISO_RENOVACAO;
}

export function vagasRestantes(tipo, concessoes, hojeISO) {
  if (!tipo?.vagas) return null;
  const usadas = concessoes.filter(g => g.type_id === tipo.id && vigenteEm(g, hojeISO)).length;
  return Math.max(0, tipo.vagas - usadas);
}

// Tipo aberto a pedidos hoje (ativo e dentro da vigência).
export function tipoAceitaPedido(tipo, hojeISO) {
  if (!tipo?.ativo) return false;
  if (tipo.vigencia_inicio && hojeISO < tipo.vigencia_inicio) return false;
  if (tipo.vigencia_fim && hojeISO > tipo.vigencia_fim) return false;
  return true;
}
