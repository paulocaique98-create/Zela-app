// Exportação da lista de alunos do perfil Marketing (PLANO_MARKETING.md, A6).
// Excel, PDF e CSV, sempre com os filtros já aplicados. xlsx e jspdf entram
// sob demanda. Sem foto: só as colunas aprovadas da RPC marketing_lista_alunos.
import { downloadCSV } from './gestaoUtils';

export const FORMATOS_EXPORTACAO = [
  { value: 'excel', label: 'Excel', ext: 'xlsx' },
  { value: 'pdf', label: 'PDF', ext: 'pdf' },
  { value: 'csv', label: 'CSV', ext: 'csv' },
];

export function formatarNascimento(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

// Neutraliza células que o Excel leria como fórmula (nome vindo de cadastro).
export function textoSeguro(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export const COLUNAS_ALUNOS = [
  { label: 'Aluno', value: (a) => textoSeguro(a.nome) },
  { label: 'Turma', value: (a) => textoSeguro(a.turma) },
  { label: 'Turno', value: (a) => textoSeguro(a.turno) },
  { label: 'Nascimento', value: (a) => formatarNascimento(a.nascimento) },
  { label: 'Idade', value: (a) => (a.idade ?? '') },
  { label: 'Responsável', value: (a) => textoSeguro(a.responsavel_nome) },
  { label: 'Telefone', value: (a) => textoSeguro(a.responsavel_telefone) },
];

export function linhasDaExportacao(alunos) {
  return alunos.map((a) => COLUNAS_ALUNOS.map((c) => c.value(a)));
}

export function nomeDoArquivo(formato, hoje = new Date()) {
  const ext = FORMATOS_EXPORTACAO.find((f) => f.value === formato)?.ext || formato;
  const dia = hoje.toISOString().slice(0, 10);
  return `alunos-${dia}.${ext}`;
}

async function baixarExcel(alunos, arquivo) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const cab = COLUNAS_ALUNOS.map((c) => c.label);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhasDaExportacao(alunos)]), 'Alunos');
  XLSX.writeFile(wb, arquivo);
}

async function baixarPdf(alunos, arquivo, titulo) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const larguras = [70, 30, 25, 28, 14, 70, 40];
  const margem = 10;
  let y = 16;
  const cabecalho = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    let x = margem;
    COLUNAS_ALUNOS.forEach((c, i) => { doc.text(c.label, x, y); x += larguras[i]; });
    doc.line(margem, y + 1.5, margem + larguras.reduce((s, n) => s + n, 0), y + 1.5);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(titulo, margem, y);
  y += 8;
  cabecalho();
  for (const linha of linhasDaExportacao(alunos)) {
    if (y > 195) { doc.addPage(); y = 16; cabecalho(); }
    let x = margem;
    linha.forEach((v, i) => {
      const txt = doc.splitTextToSize(String(v), larguras[i] - 2)[0] || '';
      doc.text(txt, x, y);
      x += larguras[i];
    });
    y += 6;
  }
  doc.save(arquivo);
}

// Gera e baixa o arquivo. Retorna a quantidade exportada.
export async function exportarAlunos(formato, alunos, { titulo = 'Lista de alunos' } = {}) {
  const arquivo = nomeDoArquivo(formato);
  if (formato === 'excel') await baixarExcel(alunos, arquivo);
  else if (formato === 'pdf') await baixarPdf(alunos, arquivo, titulo);
  else if (formato === 'csv') downloadCSV(arquivo, alunos, COLUNAS_ALUNOS);
  else throw new Error('Formato inválido.');
  return alunos.length;
}
