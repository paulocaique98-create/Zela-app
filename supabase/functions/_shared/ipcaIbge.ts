// IPCA acumulado em 12 meses, direto da API pública do IBGE (agregado 1737, variável 2265, Brasil).
// URL fixa: nada vem do cliente. A função só LÊ; quem grava é a RPC zela_ipca_registrar, com o developer conferindo.

export const URL_IPCA_IBGE =
  'https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-1/variaveis/2265?localidades=N1[all]';

export type IpcaIbge = { periodo: string; ano: number; mes: number; percentual: number };

// Aceita a resposta crua do IBGE e devolve o último período numérico válido. Lança Error com mensagem
// segura para mostrar ao developer.
export function lerIpcaIbge(corpo: unknown): IpcaIbge {
  const serie = (corpo as Array<{ resultados?: Array<{ series?: Array<{ serie?: Record<string, string> }> }> }>)
    ?.[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!serie || typeof serie !== 'object') throw new Error('Resposta do IBGE sem a série do IPCA.');
  const periodos = Object.keys(serie).filter((p) => /^\d{6}$/.test(p)).sort();
  for (let i = periodos.length - 1; i >= 0; i--) {
    const bruto = String(serie[periodos[i]] ?? '').trim();
    const percentual = Number(bruto);
    if (!bruto || !Number.isFinite(percentual)) continue; // "-" ou "..." quando o mês ainda não saiu
    if (percentual < 0 || percentual > 30) throw new Error('O IBGE devolveu um IPCA fora do intervalo esperado (0 a 30).');
    const periodo = periodos[i];
    const ano = Number(periodo.slice(0, 4));
    const mes = Number(periodo.slice(4));
    if (mes < 1 || mes > 12) continue;
    return { periodo, ano, mes, percentual: Math.round(percentual * 100) / 100 };
  }
  throw new Error('O IBGE ainda não publicou um valor do IPCA.');
}
