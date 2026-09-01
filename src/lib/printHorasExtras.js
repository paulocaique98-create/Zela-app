// Exportação em PDF do Relatório de Horas Extras — mesmo mecanismo já usado
// no Histórico Geral (window.open + print nativo do navegador). Diferente do
// Histórico, aqui é sempre UMA tabela só (é um relatório financeiro de
// cobrança, faz sentido comparar todos os alunos lado a lado, não separar
// por página).

function escapeHtml(str) {
  return (str || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 297mm; max-width: 297mm; margin: 0 auto; overflow-x: hidden; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; }
  p, td, div, th { overflow-wrap: break-word; word-break: break-word; }

  table.page { width: 100%; max-width: 297mm; border-collapse: collapse; table-layout: fixed; }
  table.page > thead > tr > td { padding: 20px 36px 8px; }
  table.page > tbody > tr > td { padding: 0 36px 28px; }

  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #3525cd; padding-bottom: 12px; margin-bottom: 16px; }
  .header-logo img { max-height: 44px; max-width: 180px; object-fit: contain; }
  .header-title h1 { margin: 0; font-size: 20px; color: #0b1c30; }
  .header-title p { margin: 2px 0 0; font-size: 12px; color: #464555; }
  .header-meta { text-align: right; font-size: 11px; color: #777587; }

  .summary { display: flex; gap: 12px; margin-bottom: 20px; }
  .summary .card { flex: 1; background: #f8f9ff; border: 1px solid #d3e4fe; border-radius: 10px; padding: 10px 14px; }
  .summary .card .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #777587; }
  .summary .card .value { font-size: 20px; font-weight: 700; color: #3525cd; margin-top: 2px; }
  .summary .card.warn .value { color: #b45309; }
  .summary .card.danger .value { color: #b91c1c; }

  table.data { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.data thead th { text-align: left; background: #eff4ff; color: #464555; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 8px; border-bottom: 2px solid #c7c4d8; }
  table.data thead th.num { text-align: right; }
  table.data tbody td { padding: 6px 8px; border-bottom: 1px solid #eff4ff; vertical-align: top; }
  table.data tbody td.num { text-align: right; }
  table.data tbody tr:nth-child(even) { background: #fafbff; }
  table.data tbody tr.excess { background: #fff8ec; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 999px; }
  .badge-ok { background: #dcfce7; color: #15803d; }
  .badge-open { background: #fef3c7; color: #b45309; }

  .footer-note { margin-top: 16px; font-size: 9px; color: #777587; text-align: right; }

  @media print {
    table.page > thead > tr > td { padding: 12px 24px 6px; }
    table.page > tbody > tr > td { padding: 0 24px 20px; }
  }
`;

function buildHeaderLogoHtml(school) {
  return school?.logo_url
    ? `<img src="${escapeHtml(school.logo_url)}" alt="${escapeHtml(school?.name || '')}" />`
    : `<span style="font-weight:700;font-size:16px;">${escapeHtml(school?.name || '')}</span>`;
}

function buildBodyHtml({ records, periodLabel, school, totals }) {
  const generatedAt = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const rowsHtml = records.map(r => {
    const isExcess = !r.dentro_tolerancia && !r.sem_saida;
    const excessText = r.sem_saida ? '—' : (isExcess ? `${Math.floor(r.minutos_excedentes / 60)}h ${r.minutos_excedentes % 60}min` : '—');
    const valorText = r.sem_saida ? '—' : (isExcess ? r.valorFormatado : 'R$ 0,00');
    return `
      <tr class="${isExcess ? 'excess' : ''}">
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.studentName)}</td>
        <td>${escapeHtml(r.family)}</td>
        <td>${escapeHtml(r.entry) || '—'}</td>
        <td>${r.sem_saida ? '<span class="badge badge-open">Pendente</span>' : escapeHtml(r.exit)}</td>
        <td>${escapeHtml(r.contractedExit)}</td>
        <td class="num">${excessText}</td>
        <td class="num">${valorText}</td>
        <td>${escapeHtml(r.approvedBy)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="header-row">
      <div class="header-logo">${buildHeaderLogoHtml(school)}</div>
      <div class="header-title" style="flex:1; text-align:center;">
        <h1>Relatório de Horas Extras</h1>
        <p>${escapeHtml(school?.name || '')} · ${escapeHtml(periodLabel)}</p>
      </div>
      <div class="header-meta">Gerado em<br/>${generatedAt}</div>
    </div>

    <div class="summary">
      <div class="card"><div class="label">Total de Registros</div><div class="value">${totals.totalRegistros}</div></div>
      <div class="card warn"><div class="label">Minutos Excedentes</div><div class="value">${totals.totalMinutosExcedentes} min</div></div>
      <div class="card danger"><div class="label">Valor Total a Cobrar</div><div class="value">${escapeHtml(totals.totalValorFormatado)}</div></div>
    </div>

    <table class="data">
      <thead>
        <tr>
          <th>Data</th>
          <th>Aluno</th>
          <th>Responsável</th>
          <th>Entrada</th>
          <th>Saída</th>
          <th>Hor. Contratado</th>
          <th class="num">Excedente</th>
          <th class="num">Valor</th>
          <th>Aprovado por</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || `<tr><td colspan="9" style="text-align:center;padding:24px;color:#777587;">Nenhum registro no período selecionado.</td></tr>`}</tbody>
    </table>

    <p class="footer-note">Zela · Gestão Escolar Inteligente</p>
  `;
}

function openPrintWindow(title, bodyHtml) {
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

export function printHorasExtrasReport({ records, periodLabel, school, totals }) {
  const bodyHtml = buildBodyHtml({ records, periodLabel, school, totals });
  const win = openPrintWindow(`Relatório de Horas Extras · ${school?.name || ''}`.trim(), bodyHtml);
  if (!win) return;
  setTimeout(() => win.print(), 400);
}
