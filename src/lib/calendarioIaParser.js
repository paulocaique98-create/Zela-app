import { supabase } from './supabase';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Envia o PDF (base64) pra Edge Function parse-calendario-ia (Gemini lê o
// PDF diretamente) e devolve { eventos: [{ date, title, tipo }] } — datas
// reais já vêm prontas da IA (diferente do cardápio, o calendário não
// precisa de "a partir de qual semana aplicar").
export async function parseCalendarioComIA(file) {
  const pdfBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('parse-calendario-ia', {
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
    throw new Error(serverMsg || error.message || 'Erro ao processar o calendário com IA.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
