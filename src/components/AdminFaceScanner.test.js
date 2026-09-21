import { describe, it, expect } from 'vitest';
import { findSecureMatch, evaluateFramePosition, eyeAspectRatio, averageEyeAspectRatio } from './AdminFaceScanner.jsx';

// Descritor "sintético": vetor de 128 posições (mesmo formato do face-api.js),
// só pra exercitar a matemática de distância euclidiana sem depender de
// nenhum modelo real de IA carregado.
function makeDescriptor(seed) {
  const arr = new Float32Array(128);
  for (let i = 0; i < 128; i++) arr[i] = Math.sin(seed + i) * 0.1;
  return arr;
}

function nudge(descriptor, amount) {
  const out = new Float32Array(descriptor.length);
  for (let i = 0; i < descriptor.length; i++) out[i] = descriptor[i] + amount;
  return out;
}

describe('findSecureMatch — regressão do achado da auditoria (confusão entre pessoas parecidas)', () => {
  const personA = makeDescriptor(1);
  const personB = makeDescriptor(50);

  it('reconhece um descritor idêntico a um cadastrado (distância ~0)', () => {
    const labeled = [{ label: 'pessoa-a', descriptors: [personA] }];
    const result = findSecureMatch(personA, labeled);
    expect(result.label).toBe('pessoa-a');
    expect(result.distance).toBeLessThan(0.01);
  });

  it('rejeita um rosto muito diferente de qualquer cadastrado (unknown)', () => {
    const labeled = [{ label: 'pessoa-a', descriptors: [personA] }];
    const muitoDiferente = makeDescriptor(999);
    const result = findSecureMatch(muitoDiferente, labeled);
    expect(result.label).toBe('unknown');
  });

  it('nunca retorna um match quando não há nenhum descritor cadastrado', () => {
    const result = findSecureMatch(personA, []);
    expect(result.label).toBe('unknown');
    expect(result.distance).toBe(Infinity);
  });

  it('rejeita como ambíguo (unknown) quando duas pessoas têm distâncias perigosamente próximas — o achado real que MATCH_MARGIN existe pra prevenir', () => {
    // Duas pessoas "parecidas" por construção: a mesma base, deslocada por um
    // valor pequeno o bastante pra ambas ficarem dentro do MATCH_THRESHOLD,
    // mas perto o bastante uma da outra pra cair dentro do MATCH_MARGIN.
    const base = new Float32Array(128).fill(0);
    const parecidoA = base;
    const parecidoB = nudge(base, 0.02); // distância euclidiana ≈ 0.02*sqrt(128) ≈ 0.226 — bem dentro do threshold 0.45

    // Probe exatamente no meio: distância a cada um é igual (~0.113) — ambíguo por construção.
    const meioDoCaminho = nudge(base, 0.01);

    const labeled = [
      { label: 'pessoa-a', descriptors: [parecidoA] },
      { label: 'pessoa-b', descriptors: [parecidoB] },
    ];
    const result = findSecureMatch(meioDoCaminho, labeled);
    expect(result.label).toBe('unknown');
    expect(result.ambiguous).toBe(true);
  });

  it('confirma o match certo quando a distância para o correto é clara e a do impostor está fora da margem de ambiguidade', () => {
    const quaseIdenticoA = nudge(personA, 0.001); // bem perto de A, longe de B
    const labeled = [
      { label: 'pessoa-a', descriptors: [personA] },
      { label: 'pessoa-b', descriptors: [personB] },
    ];
    const result = findSecureMatch(quaseIdenticoA, labeled);
    expect(result.label).toBe('pessoa-a');
    expect(result.ambiguous).toBeUndefined();
  });

  it('rejeita entrada com NaN no vetor — nunca deve confirmar um match a partir de um descritor corrompido', () => {
    const corrompido = new Float32Array(128).fill(NaN);
    const labeled = [{ label: 'pessoa-a', descriptors: [personA] }];
    const result = findSecureMatch(corrompido, labeled);
    // Distância contra NaN nunca é < threshold (comparação com NaN é sempre false)
    expect(result.label).toBe('unknown');
  });

  it('uma pessoa com múltiplos descritores cadastrados (várias fotos) ainda reconhece por qualquer um deles', () => {
    const foto1 = makeDescriptor(10);
    const foto2 = makeDescriptor(11);
    const labeled = [{ label: 'pessoa-c', descriptors: [foto1, foto2] }];
    const result = findSecureMatch(nudge(foto2, 0.001), labeled);
    expect(result.label).toBe('pessoa-c');
  });
});

describe('evaluateFramePosition — enquadramento do rosto no molde do Totem', () => {
  const VIDEO_W = 640;
  const VIDEO_H = 480;

  function box(widthRatio, cx, cy) {
    const width = VIDEO_W * widthRatio;
    return {
      width,
      x: cx * VIDEO_W - width / 2,
      height: width, // proporção irrelevante pra essa função, só a largura importa
      y: cy * VIDEO_H - width / 2,
    };
  }

  it('aprova (ok) um rosto bem centralizado e no tamanho ideal', () => {
    expect(evaluateFramePosition(box(0.30, 0.5, 0.5), VIDEO_W, VIDEO_H)).toBe('ok');
  });

  it('rejeita como "too-far" um rosto pequeno demais (longe da câmera)', () => {
    expect(evaluateFramePosition(box(0.10, 0.5, 0.5), VIDEO_W, VIDEO_H)).toBe('too-far');
  });

  it('rejeita como "too-close" um rosto grande demais (perto demais da câmera)', () => {
    expect(evaluateFramePosition(box(0.60, 0.5, 0.5), VIDEO_W, VIDEO_H)).toBe('too-close');
  });

  it('rejeita como "off-center" um rosto fora da tolerância horizontal', () => {
    expect(evaluateFramePosition(box(0.30, 0.85, 0.5), VIDEO_W, VIDEO_H)).toBe('off-center');
  });

  it('rejeita como "off-center" um rosto fora da tolerância vertical', () => {
    expect(evaluateFramePosition(box(0.30, 0.5, 0.9), VIDEO_W, VIDEO_H)).toBe('off-center');
  });

  it('valores de fronteira: exatamente no limite mínimo de tamanho ainda é "ok" (a comparação é sempre com <, nunca <=, então o valor exato do limite passa)', () => {
    // MIN_FACE_WIDTH_RATIO = 0.20 — testando exatamente no limiar
    expect(evaluateFramePosition(box(0.20, 0.5, 0.5), VIDEO_W, VIDEO_H)).toBe('ok');
  });

  it('valores de fronteira: um pouco abaixo do limite mínimo já reprova', () => {
    expect(evaluateFramePosition(box(0.199, 0.5, 0.5), VIDEO_W, VIDEO_H)).toBe('too-far');
  });
});

describe('eyeAspectRatio/averageEyeAspectRatio — Liveness Detection (Fase 1, observação)', () => {
  const pt = (x, y) => ({ x, y });

  // 6 pontos no formato do face-api.js (getLeftEye/getRightEye): [0] e [3]
  // são os cantos (horizontal), [1]/[5] e [2]/[4] são os pares de cima/baixo
  // (vertical) — olho "aberto" tem abertura vertical real, olho "fechado"
  // tem os pares de cima/baixo praticamente colados.
  function eyePoints({ openness }) {
    const cx = 100, cy = 50, width = 20;
    return [
      pt(cx - width / 2, cy),
      pt(cx - width / 4, cy - openness),
      pt(cx + width / 4, cy - openness),
      pt(cx + width / 2, cy),
      pt(cx + width / 4, cy + openness),
      pt(cx - width / 4, cy + openness),
    ];
  }

  it('olho bem aberto tem EAR bem maior que olho fechado', () => {
    const aberto = eyeAspectRatio(eyePoints({ openness: 5 }));
    const fechado = eyeAspectRatio(eyePoints({ openness: 0.1 }));
    expect(aberto).toBeGreaterThan(fechado);
  });

  it('olho completamente fechado (pontos colados) tem EAR ~0', () => {
    const fechado = eyeAspectRatio(eyePoints({ openness: 0 }));
    expect(fechado).toBeCloseTo(0, 5);
  });

  it('nunca lança/divide por zero quando a largura do olho é 0 (landmark degenerado)', () => {
    const degenerado = [pt(50, 50), pt(50, 49), pt(50, 49), pt(50, 50), pt(50, 51), pt(50, 51)];
    expect(eyeAspectRatio(degenerado)).toBe(0);
  });

  it('averageEyeAspectRatio tira a média entre os dois olhos (landmarks do face-api.js)', () => {
    const landmarks = {
      getLeftEye: () => eyePoints({ openness: 4 }),
      getRightEye: () => eyePoints({ openness: 2 }),
    };
    const earEsquerdo = eyeAspectRatio(eyePoints({ openness: 4 }));
    const earDireito = eyeAspectRatio(eyePoints({ openness: 2 }));
    expect(averageEyeAspectRatio(landmarks)).toBeCloseTo((earEsquerdo + earDireito) / 2, 10);
  });

  it('variância do EAR entre frames de um rosto "vivo" (piscando) é bem maior que a de uma foto estática (mesmo valor repetido)', () => {
    // Mesma lógica de acúmulo usada no loop ao vivo (ver AdminFaceScanner.jsx
    // > livenessEnabledRef): 3 frames seguidos, calcula variância populacional.
    const variance = (values) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    };

    const fotoEstatica = [averageEyeAspectRatio({ getLeftEye: () => eyePoints({ openness: 4 }), getRightEye: () => eyePoints({ openness: 4 }) })];
    fotoEstatica.push(fotoEstatica[0], fotoEstatica[0]); // foto/tela: exatamente o mesmo frame 3x

    const rostoVivo = [4, 4.2, 1].map(openness =>
      averageEyeAspectRatio({ getLeftEye: () => eyePoints({ openness }), getRightEye: () => eyePoints({ openness }) })
    ); // pequena variação natural + 1 piscada no meio da janela de 3 frames

    expect(variance(rostoVivo)).toBeGreaterThan(variance(fotoEstatica));
    expect(variance(fotoEstatica)).toBeCloseTo(0, 10);
  });
});
