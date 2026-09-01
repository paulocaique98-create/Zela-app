// Exportação em PDF do Histórico Geral (Admin) e Histórico de Horários
// (Família) — mesmo mecanismo comprovado do relatório de Mitigação
// (window.open + print nativo do navegador, sem depender de lib de PDF).
//
// Regra importante: quando o relatório sai sem um aluno específico
// selecionado (filtro/busca vazios ou combinando vários alunos), cada
// aluno vira sua PRÓPRIA página (page-break-after), com cabeçalho próprio
// (Aluno / Turma / Responsável Financeiro) — nunca mistura horários de
// alunos diferentes na mesma tabela. Se o filtro já aponta pra um único
// aluno, sai só a página dele.

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
  /* Sem isso a página herda a largura da janela do popup em vez do papel —
     mesma correção aplicada no relatório de Mitigação. */
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 297mm; max-width: 297mm; margin: 0 auto; overflow-x: hidden; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; }
  p, td, div, th { overflow-wrap: break-word; word-break: break-word; }

  table.page { width: 100%; max-width: 297mm; border-collapse: collapse; table-layout: fixed; }
  table.page > thead > tr > td { padding: 20px 36px 8px; }
  table.page > tbody > tr > td { padding: 0 36px 28px; }

  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #3525cd; padding-bottom: 12px; margin-bottom: 4px; }
  .header-logo img { max-height: 44px; max-width: 180px; object-fit: contain; }
  .header-title h1 { margin: 0; font-size: 20px; color: #0b1c30; }
  .header-title p { margin: 2px 0 0; font-size: 12px; color: #464555; }
  .header-meta { text-align: right; font-size: 11px; color: #777587; }

  /* Cabeçalho do ALUNO — repete no topo de cada página, evita misturar
     um aluno com o outro mesmo folheando o PDF fora de ordem. */
  table.student-info { width: 100%; border-collapse: collapse; margin: 16px 0 20px; }
  table.student-info td { border: 1px solid #94a3b8; padding: 8px 12px; font-size: 12px; vertical-align: top; }
  table.student-info td strong { display: inline; }

  .summary { display: flex; gap: 12px; margin-bottom: 20px; }
  .summary .card { flex: 1; background: #f8f9ff; border: 1px solid #d3e4fe; border-radius: 10px; padding: 10px 14px; }
  .summary .card .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #777587; }
  .summary .card .value { font-size: 20px; font-weight: 700; color: #3525cd; margin-top: 2px; }

  table.data { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.data thead th { text-align: left; background: #eff4ff; color: #464555; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 2px solid #c7c4d8; }
  table.data tbody td { padding: 7px 10px; border-bottom: 1px solid #eff4ff; vertical-align: top; }
  table.data tbody tr:nth-child(even) { background: #fafbff; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 999px; }
  .badge-ok { background: #dcfce7; color: #15803d; }
  .badge-over { background: #fee2e2; color: #b91c1c; }
  .badge-open { background: #fef3c7; color: #b45309; }

  .footer-note { margin-top: 16px; font-size: 9px; color: #777587; text-align: right; }

  .student-page { page-break-after: always; }
  .student-page:last-child { page-break-after: auto; }

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

function statusBadgeHtml(r) {
  if (r.duration === null) return `<span class="badge badge-open">Em andamento</span>`;
  if (r.overtime) return `<span class="badge badge-over">+${escapeHtml(r.overtime)}</span>`;
  return `<span class="badge badge-ok">Ok</span>`;
}

// Monta a página de UM aluno: cabeçalho (Aluno/Turma/Responsável
// Financeiro) + resumo + tabela só com os registros dele. O rodapé só
// entra na última página — colocá-lo fora do último .student-page fazia
// o navegador abrir uma página extra em branco só pra essa linha.
function buildStudentPageHtml(studentRecords, periodLabel, isLast) {
  const first = studentRecords[0];
  const total = studentRecords.length;
  const dias = new Set(studentRecords.map(r => r.date)).size;
  const excedentes = studentRecords.filter(r => r.overtime).length;

  const rowsHtml = studentRecords.map(r => `
    <tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.entry) || '—'}</td>
      <td>${escapeHtml(r.exit) || '—'}</td>
      <td>${escapeHtml(r.contracted)}</td>
      <td>${statusBadgeHtml(r)}</td>
    </tr>
  `).join('');

  return `
    <div class="student-page">
      <table class="student-info">
        <tr>
          <td style="width:40%;"><strong>ALUNO:</strong> ${escapeHtml(first.studentName)}</td>
          <td><strong>TURMA:</strong> ${escapeHtml(first.turma) || '—'}</td>
        </tr>
        <tr>
          <td colspan="2"><strong>RESPONSÁVEL FINANCEIRO:</strong> ${escapeHtml(first.family) || '—'}</td>
        </tr>
      </table>

      <div class="summary">
        <div class="card"><div class="label">Registros</div><div class="value">${total}</div></div>
        <div class="card"><div class="label">Dias no período</div><div class="value">${dias}</div></div>
        <div class="card"><div class="label">Com excedente</div><div class="value">${excedentes}</div></div>
      </div>

      <table class="data">
        <thead>
          <tr>
            <th>Data</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Ciclo</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="5" style="text-align:center;padding:24px;color:#777587;">Nenhum registro no período selecionado.</td></tr>`}</tbody>
      </table>

      ${isLast ? '<p class="footer-note">Zela · Gestão Escolar Inteligente</p>' : ''}
    </div>
  `;
}

function buildBodyHtml({ records, periodLabel, school }) {
  const generatedAt = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Agrupa por aluno (id se disponível, senão nome) — cada grupo vira uma
  // página própria, na ordem em que já apareciam na tela.
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

  const pagesHtml = groups.length > 0
    ? groups.map((g, i) => buildStudentPageHtml(g, periodLabel, i === groups.length - 1)).join('')
    : buildStudentPageHtml([{ studentName: '—', turma: '', family: '' }], periodLabel, true).replace(
        /<tbody>.*<\/tbody>/s,
        `<tbody><tr><td colspan="5" style="text-align:center;padding:24px;color:#777587;">Nenhum registro no período selecionado.</td></tr></tbody>`
      );

  return `
    <div class="header-row">
      <div class="header-logo">${buildHeaderLogoHtml(school)}</div>
      <div class="header-title" style="flex:1; text-align:center;">
        <h1>Histórico Geral</h1>
        <p>${escapeHtml(school?.name || '')} · ${escapeHtml(periodLabel)}</p>
      </div>
      <div class="header-meta">Gerado em<br/>${generatedAt}</div>
    </div>

    ${pagesHtml}
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

// `records` já vem filtrado pela tela (busca + período). Se os registros
// pertencerem a mais de um aluno, cada um sai em página separada; se já
// for um único aluno (ex: busca por nome), sai só a página dele.
export function printHistoricoReport({ records, periodLabel, school }) {
  const bodyHtml = buildBodyHtml({ records, periodLabel, school });
  const win = openPrintWindow(`Histórico Geral · ${school?.name || ''}`.trim(), bodyHtml);
  if (!win) return;
  setTimeout(() => win.print(), 400);
}
