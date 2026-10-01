import { describe, it, expect } from 'vitest';
import { evaluateFramePosition, proximoPassoDaContagem, MENSAGEM_DO_ENQUADRAMENTO, ROSTO_MIN_PX_CAMERA } from './enquadramentoCadastro.js';

// Container 400x400 na tela com a oval 240x320 no centro.
const container = { left: 0, top: 0, width: 400, height: 400 };
const oval = { left: 80, top: 40, width: 240, height: 320 };

// Rosto centralizado na oval com largura `fracaoDaOval` dela, para um vídeo
// de videoW x videoH exibido com object-cover no container.
function rostoCentral(fracaoDaOval, videoW, videoH) {
  const scale = Math.max(container.width / videoW, container.height / videoH);
  const larguraTela = fracaoDaOval * oval.width;
  const largura = larguraTela / scale;
  const offsetX = (videoW * scale - container.width) / 2;
  const offsetY = (videoH * scale - container.height) / 2;
  const centroX = (oval.left + oval.width / 2 + offsetX) / scale;
  const centroY = (oval.top + oval.height / 2 + offsetY) / scale;
  return { x: centroX - largura / 2, y: centroY - largura * 0.6, width: largura, height: largura * 1.2 };
}

const posicao = (fracao, w, h) => evaluateFramePosition(rostoCentral(fracao, w, h), w, h, container, oval);

describe('cadastro de biometria · enquadramento', () => {
  it('"Perfeito" pede 65% da oval (antes bastava 50%) numa câmera boa', () => {
    expect(posicao(0.55, 2160, 3840)).toBe('too-far'); // passava antes
    expect(posicao(0.64, 2160, 3840)).toBe('too-far');
    expect(posicao(0.66, 2160, 3840)).toBe('ok');
    expect(posicao(1.1, 2160, 3840)).toBe('ok');
    expect(posicao(1.2, 2160, 3840)).toBe('too-close');
  });

  it('câmera média: vale o mínimo de 300 px reais do rosto quando ele é maior que 65% da oval', () => {
    // 720x1280 nesse container: escala 0.556, 300 px = 167 px na tela = 69% da oval
    expect(posicao(0.67, 720, 1280)).toBe('too-far');
    expect(posicao(0.71, 720, 1280)).toBe('ok');
    const box = rostoCentral(0.71, 720, 1280);
    expect(box.width).toBeGreaterThanOrEqual(ROSTO_MIN_PX_CAMERA);
  });

  it('câmera de resolução baixa: o mínimo para em 95% da oval (sempre dá para chegar no Perfeito)', () => {
    // 480x640: 300 px reais passariam de 100% da oval; o mínimo fica em 95%.
    expect(posicao(0.9, 480, 640)).toBe('too-far');
    expect(posicao(0.97, 480, 640)).toBe('ok');
  });

  it('rosto fora do centro e sem medidas da tela', () => {
    const box = rostoCentral(0.8, 2160, 3840);
    expect(evaluateFramePosition({ ...box, x: box.x + 900 }, 2160, 3840, container, oval)).toBe('off-center');
    expect(evaluateFramePosition(box, 2160, 3840, null, oval)).toBeNull();
    expect(evaluateFramePosition(box, 2160, 3840, { ...container, width: 0 }, oval)).toBeNull();
  });

  it('contagem: só anda em Perfeito e a foto sai no fim do último número', () => {
    expect(proximoPassoDaContagem(3, 'ok')).toBe('descer');
    expect(proximoPassoDaContagem(2, 'ok')).toBe('descer');
    expect(proximoPassoDaContagem(1, 'ok')).toBe('capturar');
    for (const fora of ['too-far', 'too-close', 'off-center', null]) {
      expect(proximoPassoDaContagem(2, fora)).toBe('pausada');
      expect(proximoPassoDaContagem(1, fora)).toBe('pausada');
    }
  });

  it('mensagens da orientação', () => {
    expect(MENSAGEM_DO_ENQUADRAMENTO).toEqual({ ok: 'Perfeito', 'too-far': 'Aproxime-se', 'too-close': 'Afaste-se', 'off-center': 'Centralize o rosto' });
  });
});
