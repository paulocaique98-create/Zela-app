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

// Problemas possíveis (código → rótulo curto, usado nos relatórios).
export const PROBLEMAS_DA_FOTO = {
  sem_rosto: 'Nenhum rosto encontrado',
  rosto_pequeno: 'Rosto pequeno',
  escura: 'Escura',
  clara: 'Clara demais',
  borrada: 'Borrada',
};

export function avaliarQualidade({ rosto_px, brilho, nitidez }, limites = LIMITES_QUALIDADE) {
  const motivos = [];
  const codigos = [];
  if (!(rosto_px >= limites.rostoMinPx)) { codigos.push('rosto_pequeno'); motivos.push('Rosto pequeno na foto. Chegue um pouco mais perto da câmera.'); }
  if (brilho < limites.brilhoMin) { codigos.push('escura'); motivos.push('Foto escura. Procure um lugar mais iluminado.'); }
  if (brilho > limites.brilhoMax) { codigos.push('clara'); motivos.push('Foto clara demais. Evite luz forte atrás ou de frente para a câmera.'); }
  if (nitidez < limites.nitidezMin) { codigos.push('borrada'); motivos.push('Foto borrada. Fique parado durante a contagem.'); }
  return { ok: motivos.length === 0, motivos, codigos };
}

// Situação da foto guardada de uma pessoa, a partir de foto_qualidade.
export function situacaoDaFoto(fotoQualidade, limites = LIMITES_QUALIDADE) {
  if (!fotoQualidade) return { situacao: 'sem_analise', codigos: [] };
  if (fotoQualidade.sem_rosto) return { situacao: 'refazer', codigos: ['sem_rosto'] };
  const { ok, codigos } = avaliarQualidade(fotoQualidade, limites);
  return { situacao: ok ? 'ok' : 'refazer', codigos };
}

// Rótulo do descritor do motor Human (face_descriptor_v2_status).
export const ROTULO_DESCRITOR_HUMAN = {
  GENERATED_LIVE: 'Gerado no cadastro',
  GENERATED: 'Gerado da foto guardada',
  FAILED_NO_FACE: 'Rosto não encontrado',
  FAILED_LOW_QUALITY: 'Foto de baixa qualidade',
  FAILED_ERROR: 'Erro ao gerar',
  PENDING: 'Pendente',
};

// Resumo de uma lista de pessoas ({ foto_qualidade, face_descriptor_v2_status }).
export function resumoDaQualidade(pessoas, limites = LIMITES_QUALIDADE) {
  const resumo = { total: 0, ok: 0, refazer: 0, sem_analise: 0, problemas: {}, descritorHuman: {} };
  for (const p of pessoas || []) {
    resumo.total += 1;
    const { situacao, codigos } = situacaoDaFoto(p.foto_qualidade, limites);
    resumo[situacao] += 1;
    for (const c of codigos) resumo.problemas[c] = (resumo.problemas[c] || 0) + 1;
    const v2 = p.face_descriptor_v2_status || 'PENDING';
    resumo.descritorHuman[v2] = (resumo.descritorHuman[v2] || 0) + 1;
  }
  return resumo;
}

// Mede o rosto numa imagem já carregada (navegador): recorta a região da
// caixa, reduz para no máximo 200 px e calcula brilho e nitidez. Devolve o
// objeto que vai para authorized_persons.foto_qualidade.
export function medirRostoNaImagem(img, caixa, origem) {
  const base = {
    largura_px: img.naturalWidth || img.width,
    altura_px: img.naturalHeight || img.height,
    avaliado_em: new Date().toISOString(),
    origem,
  };
  const valida = caixa && [caixa.x, caixa.y, caixa.width, caixa.height].every(Number.isFinite) && caixa.width > 0 && caixa.height > 0;
  if (!valida) return { ...base, rosto_px: 0, sem_rosto: true };
  const escala = Math.min(1, 200 / Math.max(caixa.width, caixa.height));
  const recorte = document.createElement('canvas');
  recorte.width = Math.max(1, Math.round(caixa.width * escala));
  recorte.height = Math.max(1, Math.round(caixa.height * escala));
  const ctx = recorte.getContext('2d');
  ctx.drawImage(img, caixa.x, caixa.y, caixa.width, caixa.height, 0, 0, recorte.width, recorte.height);
  const { brilho, nitidez } = metricasDaRegiao(ctx.getImageData(0, 0, recorte.width, recorte.height));
  return { ...base, rosto_px: Math.round(caixa.width), brilho, nitidez };
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
