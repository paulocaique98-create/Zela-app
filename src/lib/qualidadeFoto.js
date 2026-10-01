// Qualidade da foto de biometria (01/10/2026).
//
// A foto do cadastro passou a usar a resolução máxima da câmera; antes de
// salvar, conferimos números objetivos da região do rosto. Os limites são
// folgados de propósito: só barram foto claramente ruim (rosto pequeno,
// escura, estourada ou borrada). Os números ficam guardados em
// authorized_persons.foto_qualidade para calibrar depois com dado real.

export const LIMITES_QUALIDADE = {
  rostoMinPx: 120, // abaixo disso o rosto tem pouco detalhe para os motores
  brilhoMin: 45, // 0 a 255
  brilhoMax: 225,
  nitidezMin: 12, // variância do Laplaciano (cinza 0 a 255)
};

const luminancia = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Brilho médio e nitidez (variância do Laplaciano) de uma região já em
// ImageData ({ data, width, height }).
export function metricasDaRegiao({ data, width, height }) {
  const cinza = new Float32Array(width * height);
  let soma = 0;
  for (let i = 0, p = 0; p < cinza.length; i += 4, p += 1) {
    const v = luminancia(data[i], data[i + 1], data[i + 2]);
    cinza[p] = v;
    soma += v;
  }
  const brilho = cinza.length ? soma / cinza.length : 0;
  let n = 0, media = 0, m2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = y * width + x;
      const lap = cinza[c - width] + cinza[c + width] + cinza[c - 1] + cinza[c + 1] - 4 * cinza[c];
      n += 1;
      const delta = lap - media;
      media += delta / n;
      m2 += delta * (lap - media);
    }
  }
  const nitidez = n > 1 ? m2 / (n - 1) : 0;
  return { brilho: Math.round(brilho), nitidez: Math.round(nitidez * 10) / 10 };
}

export function avaliarQualidade({ rosto_px, brilho, nitidez }, limites = LIMITES_QUALIDADE) {
  const motivos = [];
  if (!(rosto_px >= limites.rostoMinPx)) motivos.push('Rosto pequeno na foto. Chegue um pouco mais perto da câmera.');
  if (brilho < limites.brilhoMin) motivos.push('Foto escura. Procure um lugar mais iluminado.');
  if (brilho > limites.brilhoMax) motivos.push('Foto clara demais. Evite luz forte atrás ou de frente para a câmera.');
  if (nitidez < limites.nitidezMin) motivos.push('Foto borrada. Fique parado durante a contagem.');
  return { ok: motivos.length === 0, motivos };
}

// Média de vários descritores do Human (cada um normalizado), normalizada no
// fim: um descritor de vários quadros é mais estável que o de uma foto só.
export function mediaDeDescritores(lista) {
  const validos = (lista || []).filter(d => Array.isArray(d) && d.length > 0);
  if (validos.length === 0) return null;
  const tamanho = validos[0].length;
  const soma = new Array(tamanho).fill(0);
  for (const d of validos) {
    if (d.length !== tamanho) continue;
    const norma = Math.sqrt(d.reduce((s, v) => s + v * v, 0)) || 1;
    for (let i = 0; i < tamanho; i++) soma[i] += d[i] / norma;
  }
  const norma = Math.sqrt(soma.reduce((s, v) => s + v * v, 0)) || 1;
  return soma.map(v => v / norma);
}
