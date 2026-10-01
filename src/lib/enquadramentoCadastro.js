// Enquadramento do rosto no cadastro de biometria (FaceCameraCapture).

// Tamanho do rosto para o "Perfeito" (01/10/2026). Antes bastava 50% da
// largura da oval; agora são 65%, e também um mínimo em pixels reais da
// câmera, valendo o que for maior: a oval é medida na tela, então numa
// câmera de resolução baixa "Perfeito" ainda podia virar um rosto pequeno
// na foto (caso do iPhone do totem: rosto com 96 px).
export const ROSTO_MIN_DA_OVAL = 0.65;
export const ROSTO_MAX_DA_OVAL = 1.15;
export const ROSTO_MIN_PX_CAMERA = 300;
// Teto do mínimo: em câmera de resolução muito baixa, 300 px passaria do
// tamanho da oval. O mínimo para em 95% dela, para a pessoa sempre
// conseguir chegar no "Perfeito".
export const TETO_DO_MINIMO_DA_OVAL = 0.95;

// Verifica a posição do rosto contra a geometria REAL da oval na tela (não
// uma proporção genérica) — projeta a caixa do rosto (coordenadas nativas do
// vídeo) para o espaço renderizado do container levando em conta o recorte
// do object-cover. Checa o CENTRO da caixa contra a elipse da oval (não os 4
// cantos: uma caixa retangular bem enquadrada sempre tem cantos fora de uma
// elipse inscrita — isso faria um rosto perfeitamente centralizado nunca
// passar) e o tamanho do rosto relativo à oval, pra distinguir perto/longe.
export function evaluateFramePosition(box, videoWidth, videoHeight, containerRect, ovalRect) {
  if (!containerRect || !ovalRect || !containerRect.width || !containerRect.height) return null;

  const scale = Math.max(containerRect.width / videoWidth, containerRect.height / videoHeight);
  const renderedW = videoWidth * scale;
  const renderedH = videoHeight * scale;
  const offsetX = (renderedW - containerRect.width) / 2;
  const offsetY = (renderedH - containerRect.height) / 2;

  // Mirror horizontal é ignorado de propósito: a oval é centralizada no
  // container (items-center/justify-center), então o teste é simétrico em
  // relação ao espelhamento — o resultado é o mesmo com ou sem inverter o
  // eixo X.
  const left = box.x * scale - offsetX;
  const top = box.y * scale - offsetY;
  const width = box.width * scale;
  const height = box.height * scale;
  const boxCenterX = left + width / 2;
  const boxCenterY = top + height / 2;

  const ovalLocalLeft = ovalRect.left - containerRect.left;
  const ovalLocalTop = ovalRect.top - containerRect.top;
  const ovalCenterX = ovalLocalLeft + ovalRect.width / 2;
  const ovalCenterY = ovalLocalTop + ovalRect.height / 2;
  const rx = ovalRect.width / 2;
  const ry = ovalRect.height / 2;

  if (rx <= 0 || ry <= 0) return null;

  const nx = (boxCenterX - ovalCenterX) / rx;
  const ny = (boxCenterY - ovalCenterY) / ry;
  const isCentered = nx * nx + ny * ny <= 0.4 * 0.4 + 0.4 * 0.4; // até ~40% do raio em cada eixo

  const boxWidthRatio = width / ovalRect.width;
  const minimoPelosPixels = (ROSTO_MIN_PX_CAMERA * scale) / ovalRect.width;
  const minimo = Math.min(Math.max(ROSTO_MIN_DA_OVAL, minimoPelosPixels), TETO_DO_MINIMO_DA_OVAL);

  if (boxWidthRatio < minimo) return 'too-far';
  if (boxWidthRatio > ROSTO_MAX_DA_OVAL) return 'too-close';
  if (!isCentered) return 'off-center';
  return 'ok';
}

// Contagem regressiva (01/10/2026): só anda com o rosto em "Perfeito". O que
// fazer quando se completa um segundo seguido em "Perfeito" no número atual.
export function proximoPassoDaContagem(contagem, posicao) {
  if (posicao !== 'ok') return 'pausada';
  return contagem <= 1 ? 'capturar' : 'descer';
}

export const MENSAGEM_DO_ENQUADRAMENTO = {
  ok: 'Perfeito',
  'too-far': 'Aproxime-se',
  'too-close': 'Afaste-se',
  'off-center': 'Centralize o rosto',
};
