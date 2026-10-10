import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Guarda do novo layout (fase 10): sem emojis e sem ícone de estrelas na interface.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2728}]/u;
const ESTRELAS = /\bSparkles?\b/;

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === 'test' ? [] : arquivos(caminho);
    return /\.(jsx|js)$/.test(nome) ? [caminho] : [];
  });
}

const fontes = arquivos(join(process.cwd(), 'src'));

describe('padrão visual', () => {
  it('não usa emojis no código da interface', () => {
    const achados = fontes.filter((f) => EMOJI.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });

  it('não usa cores fixas da paleta do Tailwind (só tokens do tema)', () => {
    const paleta = /\b(?:text|bg|border|from|to|via|ring|fill|stroke|divide|placeholder|outline|decoration|accent|caret|shadow)-(?:red|green|blue|yellow|amber|orange|slate|gray|zinc|neutral|emerald|rose|indigo|purple|sky|teal|cyan|lime|pink|violet|fuchsia|stone)-\d{2,3}\b/;
    const achados = fontes.filter((f) => f.endsWith('.jsx') && paleta.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });

  it('não usa rounded-3xl e não usa rounded-full em selos e botões (círculo só em formas redondas)', () => {
    const achados = [];
    for (const f of fontes.filter((x) => x.endsWith('.jsx'))) {
      readFileSync(f, 'utf8').split('\n').forEach((linha, i) => {
        const pilula = /rounded-full/.test(linha) && /(px-[\d.]+.*py-[\d.]+|py-[\d.]+.*px-[\d.]+|min-w-)/.test(linha);
        if (/rounded-3xl/.test(linha) || pilula) achados.push(`${f}:${i + 1}`);
      });
    }
    expect(achados).toEqual([]);
  });

  it('não usa o ícone de estrelas (Sparkles)', () => {
    const achados = fontes.filter((f) => ESTRELAS.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });
});
