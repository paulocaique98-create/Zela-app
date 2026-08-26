import { supabase } from './supabase';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result é "data:application/pdf;base64,AAAA..." — a Edge
      // Function (Gemini inline_data) só quer a parte depois da vírgula.
      const base64 = String(reader.result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Envia o PDF (base64) pra Edge Function parse-cardapio-ia (Gemini lê o PDF
// diretamente, sem precisar converter em imagem no cliente) e devolve
// { cardapios: [{ numero, dias: { 'Segunda-feira': { Desjejum, ... } } }] }.
export async function parseCardapioComIA(file) {
  const pdfBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('parse-cardapio-ia', {
    body: { pdfBase64 },
  });
  if (error) {
    let serverMsg;
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json();
        serverMsg = body?.error;
      } catch {
        // corpo não era JSON — segue com a mensagem genérica abaixo
      }
    }
    throw new Error(serverMsg || error.message || 'Erro ao processar o cardápio com IA.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const WEEKDAY_OFFSETS = {
  'Segunda-feira': 0, 'Terça-feira': 1, 'Quarta-feira': 2,
  'Quinta-feira': 3, 'Sexta-feira': 4, 'Sábado': 5,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Aplica os cardápios lidos pela IA em rotação (semana 1 -> cardápio 1,
// semana 2 -> cardápio 2, ..., ciclando) a partir de uma segunda-feira real
// escolhida pelo admin, até uma data final — vira a mesma lista "flat" de
// candidatos que o fluxo de importação por texto já sabe agrupar em
// semanas (groupCandidatesByWeek, em AdminCardapio.jsx).
export function expandCardapiosToCandidates(cardapios, startMondayStr, endDateStr) {
  if (!cardapios?.length || !startMondayStr || !endDateStr) return [];
  const candidates = [];
  let weekStart = startMondayStr;
  let weekIndex = 0;
  let id = 0;
  let guard = 0;
  while (weekStart <= endDateStr && guard < 520) { // guarda contra loop infinito (~10 anos)
    guard++;
    const cardapio = cardapios[weekIndex % cardapios.length];
    for (const [dia, refeicoes] of Object.entries(cardapio.dias || {})) {
      const offset = WEEKDAY_OFFSETS[dia];
      if (offset === undefined) continue;
      const date = addDays(weekStart, offset);
      if (date > endDateStr) continue;
      for (const [refeicao, itens] of Object.entries(refeicoes || {})) {
        if (!itens || !itens.trim()) continue;
        candidates.push({ id: id++, date, descricao: itens.trim(), refeicao, selected: true });
      }
    }
    weekStart = addDays(weekStart, 7);
    weekIndex++;
  }
  return candidates;
}
