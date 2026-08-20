// pdfjs-dist é ~1MB — carregado sob demanda (só quando o admin realmente importa um
// PDF), pra não inflar o bundle inicial do painel admin com uma lib que a maioria
// das sessões nunca usa.
let _pdfjsLoadPromise = null;
async function loadPdfjs() {
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

const MONTHS = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  março: 3, marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

const MONTH_NAMES_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

// dd/mm ou dd/mm/aaaa
const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
// "dd de mês [de aaaa]"
const NAMED_DATE_RE = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTH_NAMES_PATTERN})\\.?(?:\\s+de\\s+(\\d{4}))?\\b`, 'gi');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeYear(y, fallbackYear) {
  if (!y) return fallbackYear;
  const n = Number(y);
  if (n < 100) return 2000 + n;
  return n;
}

function cleanTitle(line, matchText) {
  let title = line.replace(matchText, ' ');
  // remove sobras comuns de tabelas/pontuação
  title = title.replace(/[•\-–—|:;.]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return title;
}

// Extrai todas as datas (numéricas ou por extenso) de um trecho de texto.
function extractDatesFromSegment(segment, currentYear) {
  const dates = [];
  for (const m of segment.matchAll(NUMERIC_DATE_RE)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    dates.push(`${normalizeYear(m[3], currentYear)}-${pad2(month)}-${pad2(day)}`);
  }
  for (const m of segment.matchAll(NAMED_DATE_RE)) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].toLowerCase()];
    if (!month || day < 1 || day > 31) continue;
    dates.push(`${normalizeYear(m[3], currentYear)}-${pad2(month)}-${pad2(day)}`);
  }
  return dates;
}

/**
 * Extrai o texto de um PDF (todas as páginas) usando pdf.js.
 */
async function extractTextFromPdf(file) {
  const pdfjsLib = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Agrupa itens por posição vertical (y) aproximada pra reconstruir linhas —
    // pdf.js retorna fragmentos de texto soltos, não linhas prontas.
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(item.str);
    }
    const sortedYs = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      lines.push(rows.get(y).join(' ').replace(/\s{2,}/g, ' ').trim());
    }
  }
  return lines.filter(Boolean);
}

/**
 * Varre as linhas de texto extraídas de um PDF em busca de datas e monta uma lista
 * de candidatos (data + título) pra revisão antes de importar. Usado tanto pelo
 * Calendário quanto pelo Cardápio — qualquer PDF no formato "data - descrição".
 */
export async function parseDateTextList(file, { fallbackYear } = {}) {
  const currentYear = fallbackYear || new Date().getFullYear();
  const lines = await extractTextFromPdf(file);

  const candidates = [];
  const seen = new Set();

  const addCandidate = (dateStr, title, raw) => {
    const cleanedTitle = (title || '').trim() || 'Evento';
    const key = `${dateStr}|${cleanedTitle.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ date: dateStr, title: cleanedTitle, raw });
  };

  // Regex de "lista de feriados" oficial: "dd/mm [e dd/mm] - Descrição." — padrão
  // universal em calendários escolares brasileiros (FERIADOS, DATAS COMEMORATIVAS).
  // Damos prioridade a esse formato porque é o mais confiável: a data e o nome do
  // evento vêm claramente separados por um traço, sem ambiguidade.
  const DASH_LIST_RE = /^(.*?)[\s]*[-–][\s]*(.+)$/;

  for (const line of lines) {
    const dashMatch = line.match(DASH_LIST_RE);
    if (dashMatch) {
      const [, leftPart, rightPart] = dashMatch;
      const dates = extractDatesFromSegment(leftPart, currentYear);
      const title = rightPart.trim().replace(/\.+$/, '').trim();
      if (dates.length > 0 && title) {
        dates.forEach(dateStr => addCandidate(dateStr, title, line));
        continue; // já tratado pelo padrão de lista — não roda o fallback genérico
      }
    }

    // Fallback: linhas sem "data - título" claro (ex: datas soltas no meio de texto)
    for (const match of line.matchAll(NUMERIC_DATE_RE)) {
      const [full, dd, mm, yyyy] = match;
      const day = Number(dd);
      const month = Number(mm);
      if (day < 1 || day > 31 || month < 1 || month > 12) continue;
      const dateStr = `${normalizeYear(yyyy, currentYear)}-${pad2(month)}-${pad2(day)}`;
      addCandidate(dateStr, cleanTitle(line, full), line);
    }
    for (const match of line.matchAll(NAMED_DATE_RE)) {
      const [full, dd, monthName, yyyy] = match;
      const day = Number(dd);
      const month = MONTHS[monthName.toLowerCase()];
      if (!month || day < 1 || day > 31) continue;
      const dateStr = `${normalizeYear(yyyy, currentYear)}-${pad2(month)}-${pad2(day)}`;
      addCandidate(dateStr, cleanTitle(line, full), line);
    }
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates;
}
