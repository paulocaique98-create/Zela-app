// Utilitários compartilhados pelas telas do Portal da Gestão.

export function centsToBRL(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

export function brlToCents(text) {
  if (text === null || text === undefined) return 0;
  const normalized = String(text).trim().replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function formatDateBR(dateStr) {
  if (!dateStr) return '·';
  const d = dateStr.length === 10 ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  return Number.isNaN(d.getTime()) ? '·' : d.toLocaleDateString('pt-BR');
}

export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end), label: start.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) };
}

// Planilha simples (CSV com ; e BOM, abre direto no Excel em português).
export function toCSV(rows, columns) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map(c => escape(c.label)).join(';');
  const body = rows.map(r => columns.map(c => escape(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(';')).join('\n');
  return `﻿${header}\n${body}`;
}

export function downloadCSV(filename, rows, columns) {
  const blob = new Blob([toCSV(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Preenche os campos {{...}} de um modelo de contrato.
// Contrato sem mensalidade cadastrada no Financeiro (01/10/2026): a escola
// informa o valor e o 1º vencimento na hora de gerar. Só entra o que foi
// preenchido; valor zero ou data vazia não substitui nada.
export function valoresManuaisDoContrato({ valor, vencimento }) {
  const out = {};
  const cents = brlToCents(valor);
  if (cents > 0) out.valor_mensal = centsToBRL(cents);
  if (vencimento) out.primeiro_vencimento = formatDateBR(vencimento);
  return out;
}

export function fillTemplate(body, values) {
  return String(body || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key) => (values[key] !== undefined && values[key] !== null && values[key] !== '' ? String(values[key]) : match));
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Extrato bancário OFX: só os lançamentos de CRÉDITO (entradas).
export function parseOFXCredits(text) {
  const out = [];
  const blocks = String(text || '').split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const tag = (name) => {
      const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const amount = Number(tag('TRNAMT').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const dt = tag('DTPOSTED');
    const date = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : '';
    out.push({ id: tag('FITID') || `${date}-${amount}-${out.length}`, date, amount_cents: Math.round(amount * 100), memo: tag('MEMO') || tag('NAME') });
  }
  return out;
}
