import { MITIGACAO_SECTIONS, calcIdade, buildIntroducaoText } from './mitigacaoSections';

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const STYLES = `
  /* Sem isso, a página herda a largura da JANELA (window.open abre do
     tamanho da tela do usuário) em vez da largura real do papel — o PDF
     exportado saía largo/paisagem em telas grandes. Trava o documento no
     tamanho A4 independente do quão larga a janela do popup estiver. */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 210mm; max-width: 210mm; margin: 0 auto; overflow-x: hidden; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; }
  /* Texto sem espaços (ou com poucos) não tem onde quebrar por padrão —
     sem isso ele ultrapassa a borda da página em vez de ir pra linha de
     baixo, mesmo com a largura da página já travada em A4 acima. */
  p, td, div { overflow-wrap: break-word; word-break: break-word; }
  /* Tabela ocupando o documento inteiro: o <thead> é repetido pelo
     navegador no topo de CADA página impressa/PDF — é a forma mais
     confiável entre navegadores de ter um cabeçalho fixo por página
     (position:fixed não se repete de forma consistente na impressão). */
  table.page { width: 100%; max-width: 210mm; border-collapse: collapse; table-layout: fixed; }
  table.page > thead > tr > td { padding: 24px 48px 12px; }
  table.page > tbody > tr > td { padding: 0 48px 32px; }
  .header-logo { text-align: center; }
  .header-logo img { max-height: 56px; max-width: 220px; object-fit: contain; display: block; margin: 0 auto; }
  h1 { text-align: center; font-size: 18px; margin: 12px 0 20px; }
  table.info { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 24px; }
  table.info td { border: 1px solid #94a3b8; padding: 8px 10px; font-size: 13px; vertical-align: top; }
  table.info td strong { display: inline; }
  .intro { font-size: 13px; line-height: 1.5; margin-bottom: 24px; white-space: pre-line; }
  .signatures { margin-top: 56px; text-align: center; font-size: 13px; }
  .signature-block { margin-bottom: 32px; }
  .signature-line { border-top: 1px solid #1e293b; width: 260px; margin: 0 auto 4px; padding-top: 4px; }
  .report-page { page-break-after: always; }
  .report-page:last-child { page-break-after: auto; }
  @media print {
    table.page > thead > tr > td { padding: 12px 32px 8px; }
    table.page > tbody > tr > td { padding: 0 32px 24px; }
  }
`;

function buildHeaderLogoHtml(school) {
  return school?.logo_url
    ? `<img src="${escapeHtml(school.logo_url)}" alt="${escapeHtml(school?.name || '')}" style="max-height:56px;max-width:220px;object-fit:contain;" />`
    : `<h2 style="margin:0;">${escapeHtml(school?.name || '')}</h2>`;
}

// Monta o corpo (sem o <thead> da logo, que é compartilhado) de UM relatório
// — usado tanto na impressão individual quanto na exportação em lote.
function buildReportBodyHtml(report, student, school, sectionValues) {
  const values = sectionValues || Object.fromEntries(MITIGACAO_SECTIONS.map(s => [s.key, report[s.key] || '']));
  const introducao = buildIntroducaoText(student?.name, report.reference_period);

  const today = new Date();
  const placeDate = school?.city ? `${school.city}, ${today.getDate()} de ${MESES[today.getMonth()]} de ${today.getFullYear()}` : '';

  const sectionsHtml = MITIGACAO_SECTIONS.map(s => `
    <div style="margin-bottom:18px;">
      <p style="font-weight:700;text-transform:uppercase;font-size:13px;margin:0 0 4px;">${s.label}:</p>
      <p style="margin:0;white-space:pre-wrap;font-size:13px;line-height:1.5;">${escapeHtml(values[s.key]) || '—'}</p>
    </div>
  `).join('');

  return `
    <h1>RELATÓRIO DE MITIGAÇÃO${report.reference_period ? ' · ' + escapeHtml(report.reference_period).toUpperCase() : ''}</h1>

    <table class="info">
      <tr>
        <td style="width:60%;"><strong>NOME:</strong> ${escapeHtml(student?.name)}</td>
        <td><strong>DATA:</strong> ${formatDate(report.created_at)}</td>
      </tr>
      <tr>
        <td><strong>TURMA:</strong> ${escapeHtml(student?.turma)}</td>
        <td><strong>IDADE:</strong> ${escapeHtml(calcIdade(student?.birth_date))}</td>
      </tr>
      <tr>
        <td colspan="2"><strong>GUIA RESPONSÁVEL:</strong> ${escapeHtml(report.guia_responsavel)}</td>
      </tr>
    </table>

    <p class="intro">${escapeHtml(introducao)}</p>

    ${sectionsHtml}

    ${placeDate ? `<p style="font-size:13px;margin-top:40px;">${escapeHtml(placeDate)}</p>` : ''}

    <div class="signatures">
      <div class="signature-block">
        <p style="margin:0 0 4px;">${escapeHtml(school?.director_name || '')}</p>
        <div class="signature-line"></div>
        <p style="margin:0;font-weight:700;">DIRETORA PEDAGÓGICA</p>
      </div>
      <div class="signature-block">
        <p style="margin:0 0 4px;">${escapeHtml(report.guia_responsavel)}</p>
        <div class="signature-line"></div>
        <p style="margin:0;font-weight:700;">GUIA RESPONSÁVEL</p>
      </div>
    </div>
  `;
}

function openPrintWindow(title, bodyHtml, logoHtml) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('O navegador bloqueou a abertura da janela de impressão. Permita pop-ups para este site e tente novamente.');
    return null;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>${STYLES}</style>
    </head>
    <body>
      <table class="page">
        <thead>
          <tr><td>
            <div class="header-logo">${logoHtml}</div>
          </td></tr>
        </thead>
        <tbody>
          <tr><td>${bodyHtml}</td></tr>
        </tbody>
      </table>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  return win;
}

// Abre uma janela com UM relatório formatado como o modelo em PDF da escola e
// aciona a impressão — o usuário escolhe "Salvar como PDF" no diálogo do
// navegador. Evita depender de uma biblioteca de geração de PDF: o navegador
// já faz esse trabalho de forma confiável.
export function printMitigacaoReport({ report, student, school, sectionValues }) {
  const logoHtml = buildHeaderLogoHtml(school);
  const bodyHtml = buildReportBodyHtml(report, student, school, sectionValues);
  const win = openPrintWindow(`Relatório de Mitigação · ${student?.name || ''}`, bodyHtml, logoHtml);
  if (!win) return;
  // Pequeno delay pra garantir que a logo (se remota) carregue antes do print.
  setTimeout(() => win.print(), 400);
}

// Exportação em lote: monta UMA janela com todos os relatórios de uma turma
// em sequência, cada um começando em página nova (page-break-after), com a
// logo repetida em cada página via o mesmo <thead>. `reports` já vem
// filtrado (ex: só PUBLICADO) pelo chamador.
export function printMitigacaoReportsBulk({ reports, studentsById, school }) {
  if (!reports || reports.length === 0) {
    alert('Nenhum relatório para exportar.');
    return;
  }
  const logoHtml = buildHeaderLogoHtml(school);
  const bodyHtml = reports
    .map(r => `<div class="report-page">${buildReportBodyHtml(r, studentsById.get(r.student_id), school)}</div>`)
    .join('');
  const win = openPrintWindow(`Relatórios de Mitigação (${reports.length})`, bodyHtml, logoHtml);
  if (!win) return;
  setTimeout(() => win.print(), 500);
}
