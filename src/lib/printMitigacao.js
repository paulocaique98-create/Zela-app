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

// Abre uma janela com o relatório formatado como o modelo em PDF da escola e
// aciona a impressão — o usuário escolhe "Salvar como PDF" no diálogo do
// navegador. Evita depender de uma biblioteca de geração de PDF: o
// navegador já faz esse trabalho de forma confiável.
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function printMitigacaoReport({ report, student, school, sectionValues }) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('O navegador bloqueou a abertura da janela de impressão. Permita pop-ups para este site e tente novamente.');
    return;
  }

  const values = sectionValues || Object.fromEntries(MITIGACAO_SECTIONS.map(s => [s.key, report[s.key] || '']));
  const introducao = buildIntroducaoText(student?.name, report.reference_period);
  const logoHtml = school?.logo_url
    ? `<img src="${escapeHtml(school.logo_url)}" alt="${escapeHtml(school?.name || '')}" style="max-height:56px;max-width:220px;object-fit:contain;" />`
    : `<h2 style="margin:0;">${escapeHtml(school?.name || '')}</h2>`;

  const today = new Date();
  const placeDate = school?.city ? `${school.city}, ${today.getDate()} de ${MESES[today.getMonth()]} de ${today.getFullYear()}` : '';

  const sectionsHtml = MITIGACAO_SECTIONS.map(s => `
    <div style="margin-bottom:18px;">
      <p style="font-weight:700;text-transform:uppercase;font-size:13px;margin:0 0 4px;">${s.label}:</p>
      <p style="margin:0;white-space:pre-wrap;font-size:13px;line-height:1.5;">${escapeHtml(values[s.key]) || '—'}</p>
    </div>
  `).join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Relatório de Mitigação — ${escapeHtml(student?.name || '')}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; }
        /* Tabela ocupando o documento inteiro: o <thead> é repetido pelo
           navegador no topo de CADA página impressa/PDF — é a forma mais
           confiável entre navegadores de ter um cabeçalho fixo por página
           (position:fixed não se repete de forma consistente na impressão). */
        table.page { width: 100%; border-collapse: collapse; }
        table.page > thead > tr > td { padding: 24px 48px 12px; }
        table.page > tbody > tr > td { padding: 0 48px 32px; }
        .header-logo { text-align: center; }
        .header-logo img { max-height: 56px; max-width: 220px; object-fit: contain; display: block; margin: 0 auto; }
        h1 { text-align: center; font-size: 18px; margin: 12px 0 20px; }
        table.info { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        table.info td { border: 1px solid #94a3b8; padding: 8px 10px; font-size: 13px; vertical-align: top; }
        table.info td strong { display: inline; }
        .intro { font-size: 13px; line-height: 1.5; margin-bottom: 24px; white-space: pre-line; }
        .signatures { margin-top: 56px; text-align: center; font-size: 13px; }
        .signature-block { margin-bottom: 32px; }
        .signature-line { border-top: 1px solid #1e293b; width: 260px; margin: 0 auto 4px; padding-top: 4px; }
        @media print {
          table.page > thead > tr > td { padding: 12px 32px 8px; }
          table.page > tbody > tr > td { padding: 0 32px 24px; }
        }
      </style>
    </head>
    <body>
      <table class="page">
        <thead>
          <tr><td>
            <div class="header-logo">${logoHtml}</div>
          </td></tr>
        </thead>
        <tbody>
          <tr><td>
            <h1>RELATÓRIO DE MITIGAÇÃO${report.reference_period ? ' — ' + escapeHtml(report.reference_period).toUpperCase() : ''}</h1>

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
          </td></tr>
        </tbody>
      </table>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  // Pequeno delay pra garantir que a logo (se remota) carregue antes do print.
  setTimeout(() => win.print(), 400);
}
