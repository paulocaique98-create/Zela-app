import { describe, it, expect } from 'vitest';
import { metricasDaRegiao, avaliarQualidade, mediaDeDescritores, LIMITES_QUALIDADE, situacaoDaFoto, resumoDaQualidade } from './qualidadeFoto.js';

function imagem(largura, altura, cor) {
  const data = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const v = cor(x, y);
      const i = (y * largura + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width: largura, height: altura };
}

describe('qualidade da foto de biometria', () => {
  it('foto lisa (sem detalhe) tem nitidez zero; xadrez tem nitidez alta', () => {
    const lisa = metricasDaRegiao(imagem(40, 40, () => 128));
    expect(lisa).toEqual({ brilho: 128, nitidez: 0 });
    const xadrez = metricasDaRegiao(imagem(40, 40, (x, y) => ((x + y) % 2 ? 200 : 60)));
    expect(xadrez.nitidez).toBeGreaterThan(LIMITES_QUALIDADE.nitidezMin);
    expect(xadrez.brilho).toBe(130);
  });

  it('barra só foto claramente ruim, com motivo em português', () => {
    expect(avaliarQualidade({ rosto_px: 300, brilho: 130, nitidez: 80 })).toEqual({ ok: true, motivos: [], codigos: [] });
    const ruim = avaliarQualidade({ rosto_px: 90, brilho: 30, nitidez: 3 });
    expect(ruim.ok).toBe(false);
    expect(ruim.motivos).toHaveLength(3);
    expect(ruim.codigos).toEqual(['rosto_pequeno', 'escura', 'borrada']);
    for (const m of ruim.motivos) expect(m).not.toContain('-');
    expect(avaliarQualidade({ rosto_px: 300, brilho: 240, nitidez: 80 }).motivos[0]).toContain('clara demais');
  });

  it('média de vários quadros do Human: normalizada e na mesma direção', () => {
    const m = mediaDeDescritores([[1, 0], [2, 0], [0.9, 0.1]]);
    expect(Math.hypot(...m)).toBeCloseTo(1, 6);
    expect(m[0]).toBeGreaterThan(0.99);
    expect(mediaDeDescritores([])).toBeNull();
    expect(mediaDeDescritores([null, []])).toBeNull();
  });

  it('situação da foto guardada: boa, refazer (com motivo) ou sem análise', () => {
    expect(situacaoDaFoto(null)).toEqual({ situacao: 'sem_analise', codigos: [] });
    expect(situacaoDaFoto({ sem_rosto: true, rosto_px: 0 })).toEqual({ situacao: 'refazer', codigos: ['sem_rosto'] });
    expect(situacaoDaFoto({ rosto_px: 300, brilho: 130, nitidez: 80 })).toEqual({ situacao: 'ok', codigos: [] });
    expect(situacaoDaFoto({ rosto_px: 100, brilho: 130, nitidez: 80 })).toEqual({ situacao: 'refazer', codigos: ['rosto_pequeno'] });
  });

  it('resumo da escola: contagens por situação, problema e descritor do Human', () => {
    const r = resumoDaQualidade([
      { foto_qualidade: { rosto_px: 300, brilho: 130, nitidez: 80 }, face_descriptor_v2_status: 'GENERATED_LIVE' },
      { foto_qualidade: { rosto_px: 100, brilho: 20, nitidez: 80 }, face_descriptor_v2_status: 'GENERATED' },
      { foto_qualidade: { sem_rosto: true }, face_descriptor_v2_status: 'FAILED_NO_FACE' },
      { foto_qualidade: null, face_descriptor_v2_status: null },
    ]);
    expect(r).toEqual({
      total: 4, ok: 1, refazer: 2, sem_analise: 1,
      problemas: { rosto_pequeno: 1, escura: 1, sem_rosto: 1 },
      descritorHuman: { GENERATED_LIVE: 1, GENERATED: 1, FAILED_NO_FACE: 1, PENDING: 1 },
    });
  });
});
