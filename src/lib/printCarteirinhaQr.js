// Impressão da carteirinha de check-in por QR Code (Fase 1 do plano de QR
// Code) -- mesmo mecanismo comprovado dos outros print*.js (window.open +
// print nativo do navegador, sem lib de PDF). Layout pequeno de propósito
// (pensado pra plastificar e pendurar num chaveiro/mochila), não uma folha
// A4 cheia como os relatórios.

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
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Source Sans 3", Arial, Helvetica, sans-serif; color: #0b1c30; margin: 0; }

  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }

  .card { border: 1px dashed #c7c4d8; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; page-break-inside: avoid; }
  .card .brand { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 13px; color: #3525cd; }
  .card .brand .dot { width: 8px; height: 8px; border-radius: 50%; background: #3525cd; }
  .card img.qr { width: 150px; height: 150px; }
  .card .name { font-weight: 700; font-size: 14px; text-align: center; }
  .card .turma { font-size: 11px; color: #464555; }
  .card .footer { font-size: 8.5px; color: #777587; text-align: center; margin-top: 4px; }
`;

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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;700;800&display=swap" />
      <style>${STYLES}</style>
    </head>
    <body>${bodyHtml}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  return win;
}

// `students`: [{ name, turma, qrDataUrl }] -- qrDataUrl já vem pronto
// (gerado com a lib `qrcode` na tela, ver AdminQrCheckin.jsx), essa função
// só monta o layout de impressão.
export function printCarteirinhasQr(students, school) {
  const cardsHtml = students.map(s => `
    <div class="card">
      <div class="brand"><span class="dot"></span> Zela</div>
      <img class="qr" src="${s.qrDataUrl}" alt="QR Code de ${escapeHtml(s.name)}" />
      <div class="name">${escapeHtml(s.name)}</div>
      ${s.turma ? `<div class="turma">${escapeHtml(s.turma)}</div>` : ''}
      <div class="footer">Check-in/Check-out · ${escapeHtml(school?.name || '')}</div>
    </div>
  `).join('');

  const win = openPrintWindow('Carteirinhas de Check-in', `<div class="grid">${cardsHtml}</div>`);
  if (!win) return;
  setTimeout(() => win.print(), 500);
}
