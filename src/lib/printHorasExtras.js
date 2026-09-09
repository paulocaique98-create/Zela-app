// Exportação em PDF do Relatório de Horas Extras — mesmo mecanismo do
// Histórico Geral (window.open + print nativo do navegador).
//
// Cada aluno vira sua PRÓPRIA folha, com o cabeçalho completo (marca,
// título, escola, data de geração) dentro do <thead> dessa folha, que o
// navegador repete em toda página que ela ocupar na impressão. Folha em pé
// (retrato): o layout anterior era deitado, e o "Salvar como PDF" do
// navegador às vezes ignora essa configuração e espreme o conteúdo na
// largura errada.

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
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 210mm; max-width: 210mm; margin: 0 auto; overflow-x: hidden; }
  body { font-family: "Source Sans 3", Arial, Helvetica, sans-serif; color: #1b1a30; }
  p, td, div, th { overflow-wrap: break-word; word-break: break-word; }

  table.student-sheet { width: 100%; max-width: 210mm; border-collapse: collapse; table-layout: fixed; }
  table.student-sheet > thead > tr > td { padding: 22px 28px 14px; }
  table.student-sheet > tbody > tr > td { padding: 0 28px 24px; }
  .sheet-wrap { page-break-after: always; }
  .sheet-wrap:last-child { page-break-after: auto; }

  .letterhead { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 2.5px solid #3525cd; padding-bottom: 12px; margin-bottom: 4px; }
  .lh-brand { display: flex; align-items: center; gap: 10px; }
  .lh-mark { width: 26px; height: 26px; border-radius: 7px; background: #3525cd; flex-shrink: 0; }
  .lh-brand-name { font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 14px; color: #1b1a30; }
  .lh-brand-name span { color: #8b88a8; font-weight: 400; }
  .lh-title { text-align: center; flex: 1; }
  .lh-eyebrow { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: #3525cd; margin: 0 0 3px; }
  .lh-title h1 { font-family: "Fraunces", Georgia, serif; font-weight: 600; margin: 0; font-size: 18px; color: #1b1a30; }
  .lh-title p { margin: 3px 0 0; font-size: 10px; color: #8b88a8; }
  .lh-meta { text-align: right; font-size: 9px; color: #8b88a8; line-height: 1.4; }
  .lh-meta b { display: block; font-size: 10px; color: #5b5876; }

  .student-card { background: #f6f5ff; border: 1px solid #e1e2f2; border-radius: 10px; padding: 12px 16px; margin: 16px 0 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .student-card .name { font-weight: 700; font-size: 15px; color: #1b1a30; }
  .student-card .meta-line { font-size: 11px; color: #5b5876; margin-top: 2px; }
  .student-card .seq { font-size: 9px; color: #8b88a8; white-space: nowrap; }

  .stats { display: flex; gap: 10px; margin-bottom: 18px; }
  .stats .stat { flex: 1; background: #ffffff; border: 1px solid #e1e2f2; border-radius: 8px; padding: 10px 14px; }
  .stats .stat .lbl { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #8b88a8; }
  .stats .stat .val { font-family: "Fraunces", Georgia, serif; font-size: 19px; font-weight: 600; color: #1b1a30; margin-top: 2px; }
  .stats .stat.warn .val { color: #9a5b00; }
  .stats .stat.danger .val { color: #b91c1c; }

  table.data { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.data thead th { text-align: left; background: #eeecfd; color: #5b5876; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 8px; }
  table.data thead th:first-child { border-radius: 6px 0 0 6px; }
  table.data thead th:last-child { border-radius: 0 6px 6px 0; text-align: right; }
  table.data thead th.num { text-align: right; }
  table.data tbody td { padding: 8px 8px; border-bottom: 1px solid #e1e2f2; vertical-align: top; }
  table.data tbody td.num { text-align: right; }
  table.data tbody tr:nth-child(even) { background: #f9f9ff; }
  table.data tbody tr.excess { background: #fff8ec; }
  .pill { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 9px; border-radius: 999px; }
  .pill-ok { background: #e3f6e8; color: #1a7d3a; }
  .pill-open { background: #fff3de; color: #9a5b00; }

  .sheet-footer { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e1e2f2; display: flex; justify-content: space-between; font-size: 9px; color: #8b88a8; }

  @media print {
    table.student-sheet > thead > tr > td { padding: 16px 22px 10px; }
    table.student-sheet > tbody > tr > td { padding: 0 22px 18px; }
  }
`;

function buildLetterheadHtml({ title, subtitle, generatedAt }) {
  return `
    <div class="letterhead">
      <div class="lh-brand">
        <div class="lh-mark"></div>
        <div class="lh-brand-name">Zela <span>Portal</span></div>
      </div>
      <div class="lh-title">
        <p class="lh-eyebrow">${escapeHtml(subtitle)}</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="lh-meta">Gerado em<br/><b>${escapeHtml(generatedAt)}</b></div>
    </div>
  `;
}

// Monta a folha de UM aluno inteira, com cabeçalho próprio no <thead> pra
// repetir em toda página que essa tabela ocupar na impressão.
function buildStudentSheetHtml(studentLogs, { school, periodLabel, generatedAt, index, total }) {
  const first = studentLogs[0];
  const totalRegistros = studentLogs.length;
  const totalMinutos = studentLogs.reduce((acc, log) => acc + log.minutos_excedentes, 0);
  const totalValor = studentLogs.reduce((acc, log) => acc + log.valor, 0);
  const totalValorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValor);

  const rowsHtml = studentLogs.map(log => {
    const temExcesso = log.excessoEntrada || (log.excessoSaida && !log.sem_saida);
    const excessText = log.sem_saida && !log.excessoEntrada
      ? '•'
      : (temExcesso ? `${Math.floor(log.minutos_excedentes / 60)}h ${log.minutos_excedentes % 60}min` : '•');
    const valorText = log.sem_saida && !log.excessoEntrada ? '•' : (temExcesso ? log.valorFormatado : 'R$ 0,00');
    return `
      <tr class="${temExcesso ? 'excess' : ''}">
        <td>${escapeHtml(log.date)}</td>
        <td>${escapeHtml(log.entry) || '•'}</td>
        <td>${log.exit ? escapeHtml(log.exit) : '<span class="pill pill-open">Pendente</span>'}</td>
        <td>${escapeHtml(log.contractedExit)}</td>
        <td class="num">${excessText}</td>
        <td class="num">${valorText}</td>
        <td>${escapeHtml(log.approvedBy)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="sheet-wrap">
      <table class="student-sheet">
        <thead>
          <tr><td>${buildLetterheadHtml({
            title: 'Relatório de Horas Extras',
            subtitle: `${school?.name || ''} · ${periodLabel}`,
            generatedAt,
          })}</td></tr>
        </thead>
        <tbody>
          <tr><td>
            <div class="student-card">
              <div>
                <div class="name">${escapeHtml(first.studentName)}</div>
                <div class="meta-line">Responsável financeiro ${escapeHtml(first.family) || 'não informado'}</div>
              </div>
              <div class="seq">Aluno ${index} de ${total}</div>
            </div>

            <div class="stats">
              <div class="stat"><div class="lbl">Registros</div><div class="val">${totalRegistros}</div></div>
              <div class="stat warn"><div class="lbl">Minutos excedentes</div><div class="val">${totalMinutos} min</div></div>
              <div class="stat danger"><div class="lbl">Valor a cobrar</div><div class="val">${escapeHtml(totalValorFormatado)}</div></div>
            </div>

            <table class="data">
              <thead>
                <tr><th>Data</th><th>Entrada</th><th>Saída</th><th>Hor. contratado</th><th class="num">Excedente</th><th class="num">Valor</th><th>Aprovado por</th></tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>

            <div class="sheet-footer">
              <span>Zela, Gestão Escolar Inteligente</span>
              <span>Aluno ${index} de ${total}</span>
            </div>
          </td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildBodyHtml({ records, periodLabel, school }) {
  const generatedAt = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (records.length === 0) {
    return `
      <div class="sheet-wrap">
        <table class="student-sheet">
          <thead>
            <tr><td>${buildLetterheadHtml({ title: 'Relatório de Horas Extras', subtitle: `${school?.name || ''} · ${periodLabel}`, generatedAt })}</td></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:center;padding:48px;color:#8b88a8;">Nenhum registro no período selecionado.</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // Agrupa por aluno (id se disponível, senão nome) — cada grupo vira sua
  // própria folha, na ordem em que já apareciam na tela.
  const groups = [];
  const indexByKey = new Map();
  records.forEach(r => {
    const key = r.studentId || r.studentName;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push([]);
    }
    groups[indexByKey.get(key)].push(r);
  });

  return groups.map((g, i) => buildStudentSheetHtml(g, { school, periodLabel, generatedAt, index: i + 1, total: groups.length })).join('');
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Source+Sans+3:wght@400;500;600;700&display=swap" />
      <style>${STYLES}</style>
    </head>
    <body>${bodyHtml}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  return win;
}

export function printHorasExtrasReport({ records, periodLabel, school }) {
  const bodyHtml = buildBodyHtml({ records, periodLabel, school });
  const win = openPrintWindow(`Relatório de Horas Extras, ${school?.name || ''}`.trim(), bodyHtml);
  if (!win) return;
  setTimeout(() => win.print(), 500);
}
