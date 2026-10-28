// Exportação do painel: CSV por gráfico (mesmo formato do resto do sistema) e
// XLSX da aba inteira, uma planilha por gráfico. O XLSX é importado sob demanda.
import { downloadCSV } from '../gestaoUtils';

// colunas: [{ label, value: 'campo' | (linha) => valor }]
export function baixarCsvGrafico(nomeArquivo, linhas, colunas) {
  downloadCSV(`${nomeArquivo}.csv`, linhas, colunas);
}

// Nome de planilha do Excel: até 31 caracteres, sem : \ / ? * [ ]
export function nomeDePlanilha(titulo, usados = []) {
  const base = String(titulo || 'Planilha').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Planilha';
  let nome = base;
  let n = 2;
  while (usados.includes(nome)) {
    const sufixo = ` ${n}`;
    nome = `${base.slice(0, 31 - sufixo.length)}${sufixo}`;
    n += 1;
  }
  return nome;
}

// graficos: [{ titulo, linhas, colunas }]
export async function baixarXlsxAba(nomeArquivo, graficos) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const usados = [];
  for (const g of graficos) {
    const cab = g.colunas.map(c => c.label);
    const corpo = g.linhas.map(l => g.colunas.map(c => (typeof c.value === 'function' ? c.value(l) : l[c.value]) ?? ''));
    const nome = nomeDePlanilha(g.titulo, usados);
    usados.push(nome);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...corpo]), nome);
  }
  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
}
