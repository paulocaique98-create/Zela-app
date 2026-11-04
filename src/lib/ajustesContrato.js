// Regras puras dos ajustes na ficha do contrato (PLANO_FATURAMENTO_ZELA.md, 7B). O servidor revalida tudo
// (RPCs zela_ajustar_vencimentos, zela_reparcelar_saldo, zela_aplicar_desconto_mensalidade); aqui é só prévia.
import { arredondar } from './planosZela';

export const INTERVALO_PADRAO_DIAS = 30;
export const TIPO_AJUSTE = {
  vencimentos: 'Vencimentos',
  reparcelamento: 'Reparcelamento',
  desconto_mensalidade: 'Desconto na mensalidade',
};

export const abertaParaAjuste = (c) => c.status === 'pendente' || c.status === 'vencida';

export function somarDiasISO(iso, dias) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Primeiro vencimento informado; cada parcela seguinte 30 dias depois da anterior (editável na tela).
export function gerarVencimentos(primeiroISO, quantidade, intervalo = INTERVALO_PADRAO_DIAS) {
  if (!primeiroISO || !(quantidade >= 1)) return [];
  return Array.from({ length: quantidade }, (_, i) => somarDiasISO(primeiroISO, i * intervalo));
}

// Divide o total em n partes de centavos; a última leva a diferença, como a RPC.
export function dividirSaldo(total, n) {
  if (!(n >= 1)) return [];
  const parte = arredondar(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? arredondar(total - parte * (n - 1)) : parte));
}

// Prévia do desconto a partir da parcela: pendente, futura e tipo parcela. Calcula do valor original.
export function previaDesconto(cobrancas, aPartir, percentual, hojeISO) {
  return (cobrancas || [])
    .filter(c => c.tipo === 'parcela' && c.numero >= aPartir && c.status === 'pendente' && c.vencimento >= hojeISO)
    .sort((a, b) => a.numero - b.numero)
    .map(c => {
      const base = Number(c.valor_sistema_original ?? c.valor_sistema);
      const novoSistema = arredondar(base * (1 - Number(percentual) / 100));
      return { id: c.id, numero: c.numero, antes: Number(c.valor), depois: arredondar(novoSistema + Number(c.valor_implantacao || 0)) };
    });
}

// Valida os vencimentos digitados: todos preenchidos, de hoje em diante.
export function vencimentosValidos(lista, hojeISO) {
  return lista.length > 0 && lista.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && v >= hojeISO);
}
