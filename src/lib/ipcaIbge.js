// Textos da busca do IPCA no IBGE (Faturamento). A busca só preenche o campo; quem grava é o Registrar.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function rotuloReferencia({ ano, mes }) {
  return `${MESES[mes - 1] || mes}/${ano}`;
}

// Só dezembro fecha o ano. Antes disso o número é um acumulado parcial e o ano trava depois de usado.
export function avisoReferencia({ ano, mes, percentual }) {
  const valor = `${Number(percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`;
  const base = `IBGE: ${valor} acumulado em 12 meses até ${rotuloReferencia({ ano, mes })}.`;
  if (mes === 12) return { texto: base, parcial: false };
  return { texto: `${base} Ainda não é o ano fechado: registre só se for essa a sua referência.`, parcial: true };
}
