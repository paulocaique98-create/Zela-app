// tesseract.js é pesado (~1MB + baixa o modelo de português na primeira vez) —
// carregado só quando o admin realmente importa uma imagem.
let _tesseractLoadPromise = null;
async function loadTesseract() {
  if (!_tesseractLoadPromise) {
    _tesseractLoadPromise = import('tesseract.js');
  }
  return _tesseractLoadPromise;
}

const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
const DATE_RANGE_RE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|à|até)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i;
const STANDALONE_YEAR_RE = /\b(20\d{2})\b/;
const WEEKDAY_RE = /^(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(-feira)?\.?$/i;
const MEAL_KEYWORDS = [
  { re: /desjejum|café\s*da\s*manh[ãa]/i, refeicao: 'Café da Manhã' },
  { re: /cola[çc][ãa]o/i, refeicao: 'Lanche da Manhã' },
  { re: /almo[çc]o/i, refeicao: 'Almoço' },
  { re: /lanche\s*(da\s*)?tarde/i, refeicao: 'Lanche da Tarde' },
  { re: /jantar/i, refeicao: 'Jantar' },
];
// Ordem "natural" das refeições do dia, usada como fallback quando não dá pra ler o
// rótulo da linha (comum quando o rótulo vem rotacionado 90° na lateral da tabela —
// OCR não lê texto rotacionado de forma confiável).
const REFEICAO_ORDER_FALLBACK = ['Café da Manhã', 'Lanche da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeYear(y, fallbackYear) {
  if (!y) return fallbackYear;
  const n = Number(y);
  return n < 100 ? 2000 + n : n;
}

// Achata a árvore blocks → paragraphs → lines → words do resultado do Tesseract.
function flattenWordsAndLines(data) {
  const words = [];
  const lines = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        if (line.text && line.text.trim()) lines.push(line);
        for (const word of line.words || []) {
          if (word.text && word.text.trim()) words.push(word);
        }
      }
    }
  }
  return { words, lines };
}

function guessFallbackYear(lines) {
  for (const line of lines) {
    const m = line.text.match(STANDALONE_YEAR_RE);
    if (m) return Number(m[1]);
  }
  return new Date().getFullYear();
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ── Modo A: datas explícitas (dd/mm/aaaa) como cabeçalho de cada coluna ──
function parseModeA(words) {
  const anchors = [];
  for (const w of words) {
    const m = w.text.match(NUMERIC_DATE_RE);
    if (!m) continue;
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    const year = normalizeYear(m[3]);
    anchors.push({
      date: `${year}-${pad2(month)}-${pad2(day)}`,
      x: (w.bbox.x0 + w.bbox.x1) / 2,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
      bboxBottom: w.bbox.y1,
    });
  }
  if (anchors.length === 0) return [];

  anchors.sort((a, b) => a.y - b.y);
  const ROW_TOLERANCE = 35;
  const rows = [];
  for (const a of anchors) {
    let row = rows.find(r => Math.abs(r.y - a.y) < ROW_TOLERANCE);
    if (!row) {
      row = { y: a.y, items: [] };
      rows.push(row);
    }
    row.items.push(a);
  }
  rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => a.y - b.y);

  const candidates = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const nextRow = rows[ri + 1];
    const yEnd = nextRow ? nextRow.y - ROW_TOLERANCE : Infinity;

    for (let ci = 0; ci < row.items.length; ci++) {
      const anchor = row.items[ci];
      const prev = row.items[ci - 1];
      const next = row.items[ci + 1];
      const xStart = prev ? (prev.x + anchor.x) / 2 : -Infinity;
      const xEnd = next ? (anchor.x + next.x) / 2 : Infinity;
      const yStart = anchor.bboxBottom;

      const cellWords = words.filter(w => {
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        const cy = (w.bbox.y0 + w.bbox.y1) / 2;
        return cx >= xStart && cx < xEnd && cy >= yStart - 5 && cy < yEnd && !WEEKDAY_RE.test(w.text.trim());
      });
      cellWords.sort((a, b) => (a.bbox.y0 - b.bbox.y0) || (a.bbox.x0 - b.bbox.x0));

      const descricao = cellWords.map(w => w.text).join(' ').replace(/\s{2,}/g, ' ').trim();
      if (descricao) candidates.push({ date: anchor.date, descricao, refeicao: null });
    }
  }
  return candidates;
}

// ── Modo B: sem data por coluna — cabeçalho é o NOME do dia da semana (Segunda,
// Terça...) e um intervalo de datas único aparece em algum lugar do topo da imagem
// (ex: "25/05 a 29/05"). As linhas de refeição (Desjejum/Colação/Almoço) costumam
// ter o rótulo rotacionado na lateral, que o OCR não lê de forma confiável — por
// isso agrupamos as linhas por posição vertical (bandas) e usamos a ordem típica
// das refeições do dia como rótulo, em vez de depender de ler esse texto rotacionado.
function parseModeB(words, lines) {
  const rangeLine = lines.find(l => DATE_RANGE_RE.test(l.text));
  if (!rangeLine) return [];
  const m = rangeLine.text.match(DATE_RANGE_RE);
  const fallbackYear = guessFallbackYear(lines);
  const startDay = Number(m[1]);
  const startMonth = Number(m[2]);
  const startYear = normalizeYear(m[3], fallbackYear);
  const weekStart = `${startYear}-${pad2(startMonth)}-${pad2(startDay)}`;

  // Cabeçalhos de coluna: palavras que são nome de dia da semana, na parte de cima
  const headerWords = words.filter(w => WEEKDAY_RE.test(w.text.trim()));
  if (headerWords.length === 0) return [];

  headerWords.sort((a, b) => (a.bbox.x0 + a.bbox.x1) / 2 - (b.bbox.x0 + b.bbox.x1) / 2);
  const headerBottom = Math.max(...headerWords.map(w => w.bbox.y1));
  const columns = headerWords.map((w, i) => ({
    date: addDays(weekStart, i),
    x: (w.bbox.x0 + w.bbox.x1) / 2,
  }));

  // Corpo da tabela: tudo abaixo do cabeçalho, exceto a própria linha de intervalo de datas
  const bodyWords = words.filter(w => {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    return cy > headerBottom + 5 && !DATE_RANGE_RE.test(w.text) && !WEEKDAY_RE.test(w.text.trim());
  });
  if (bodyWords.length === 0) return [];

  // Agrupa o corpo em "bandas" horizontais (uma por refeição) detectando saltos
  // grandes de posição vertical entre uma palavra e a próxima.
  const sorted = [...bodyWords].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const avgHeight = sorted.reduce((sum, w) => sum + (w.bbox.y1 - w.bbox.y0), 0) / sorted.length;
  const gapThreshold = avgHeight * 2.2;

  const bands = [];
  let current = { yStart: sorted[0].bbox.y0, yEnd: sorted[0].bbox.y1, words: [sorted[0]] };
  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    if (w.bbox.y0 - current.yEnd > gapThreshold) {
      bands.push(current);
      current = { yStart: w.bbox.y0, yEnd: w.bbox.y1, words: [w] };
    } else {
      current.words.push(w);
      current.yEnd = Math.max(current.yEnd, w.bbox.y1);
    }
  }
  bands.push(current);

  // Pra cada banda x coluna, junta o texto que cai dentro dos limites
  const candidates = [];
  bands.forEach((band, bi) => {
    const bandWords = band.words;
    const detected = MEAL_KEYWORDS.find(k => bandWords.some(w => k.re.test(w.text)));
    const refeicao = detected ? detected.refeicao : (REFEICAO_ORDER_FALLBACK[bi] || `Refeição ${bi + 1}`);

    columns.forEach((col, ci) => {
      const prev = columns[ci - 1];
      const next = columns[ci + 1];
      const xStart = prev ? (prev.x + col.x) / 2 : -Infinity;
      const xEnd = next ? (col.x + next.x) / 2 : Infinity;

      const cellWords = bandWords.filter(w => {
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        return cx >= xStart && cx < xEnd && !MEAL_KEYWORDS.some(k => k.re.test(w.text));
      });
      cellWords.sort((a, b) => (a.bbox.y0 - b.bbox.y0) || (a.bbox.x0 - b.bbox.x0));
      const descricao = cellWords.map(w => w.text).join(' ').replace(/\s{2,}/g, ' ').trim();
      if (descricao) candidates.push({ date: col.date, descricao, refeicao });
    });
  });

  return candidates;
}

/**
 * Interpreta uma imagem de cardápio (grade semanal) e retorna candidatos
 * { date, descricao, refeicao } pra revisão antes de importar. Tenta primeiro o
 * formato com data explícita por coluna; se não achar nada, tenta o formato com
 * nome do dia da semana + intervalo de datas único no topo.
 */
export async function parseCardapioImageGrid(file, { onProgress } = {}) {
  const { createWorker } = await loadTesseract();
  const worker = await createWorker('por', 1, {
    logger: onProgress
      ? (m) => { if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress(m.progress); }
      : undefined,
  });

  let data;
  try {
    const result = await worker.recognize(file, {}, { blocks: true });
    data = result.data;
  } finally {
    await worker.terminate();
  }

  const { words, lines } = flattenWordsAndLines(data);
  if (words.length === 0) return [];

  let candidates = parseModeA(words);
  if (candidates.length === 0) {
    candidates = parseModeB(words, lines);
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates;
}
