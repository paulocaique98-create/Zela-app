import { describe, it, expect } from 'vitest';
import { findSecureMatch, evaluateFramePosition } from './AdminFaceScanner.jsx';

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
