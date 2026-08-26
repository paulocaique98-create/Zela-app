// pdfjs-dist é ~1MB — carregado sob demanda (só quando o admin realmente importa um
// PDF), pra não inflar o bundle inicial do painel admin com uma lib que a maioria
// das sessões nunca usa. Compartilhado entre pdfDateListParser.js (Calendário/
// Cardápio no formato "data - descrição") e freeTableCardapioParser.js (Cardápio
// em tabela livre, sem data no texto).
let _pdfjsLoadPromise = null;
export async function loadPdfjs() {
  if (!_pdfjsLoadPromise) {
    _pdfjsLoadPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjsLib, workerUrlModule]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrlModule.default;
      return pdfjsLib;
    });
  }
  return _pdfjsLoadPromise;
}
