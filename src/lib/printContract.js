// Impressão (e "salvar como PDF" do navegador) de um contrato ou aditivo,
// com o bloco de evidências da assinatura eletrônica quando assinado.

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function printContract(doc, schoolName) {
  const win = window.open('', '_blank');
  if (!win) return false;
  const signedAt = doc.signed_at ? new Date(doc.signed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  const signature = doc.status === 'assinado'
    ? `<section class="sig">
        <h2>Assinatura eletrônica</h2>
        <p>Assinado por <strong>${escapeHtml(doc.signer_name)}</strong> em ${escapeHtml(signedAt)}.</p>
        <p>Método: ${escapeHtml(doc.signature_meta?.metodo || 'assinatura eletrônica simples pelo app Zela')}.</p>
        ${doc.signature_meta?.ip ? `<p>Endereço IP: ${escapeHtml(doc.signature_meta.ip)}</p>` : ''}
        <p class="hash">Impressão digital do texto (SHA 256): ${escapeHtml(doc.content_hash)}</p>
      </section>`
    : '';
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; color: #111; max-width: 760px; margin: 32px auto; padding: 0 24px; line-height: 1.55; }
      header { border-bottom: 1px solid #999; margin-bottom: 20px; padding-bottom: 8px; }
      header p { margin: 0; font-size: 12px; color: #555; font-family: system-ui, sans-serif; }
      h1 { font-size: 20px; margin: 4px 0 0; }
      .body { white-space: pre-wrap; font-size: 14px; }
      .sig { margin-top: 32px; border: 1px solid #999; padding: 12px 16px; font-family: system-ui, sans-serif; font-size: 12px; }
      .sig h2 { font-size: 13px; margin: 0 0 6px; }
      .sig p { margin: 2px 0; }
      .hash { word-break: break-all; color: #555; }
    </style></head><body>
    <header><p>${escapeHtml(schoolName || '')}</p><h1>${escapeHtml(doc.title)}</h1></header>
    <div class="body">${escapeHtml(doc.body)}</div>
    ${signature}
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
  return true;
}
