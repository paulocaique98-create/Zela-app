/**
 * humanFaceEngine.js — Motor de reconhecimento facial alternativo, baseado em
 * @vladmandic/human (candidato a substituir o face-api.js — ver
 * PLANO_MIGRACAO_BIBLIOTECA_RECONHECIMENTO_FACIAL.md).
 *
 * FASE E do plano: escrita de código isolada, SEM fio nenhum ligado ao motor
 * atual. NÃO É CHAMADO EM NENHUM LUGAR DO APP ainda — nenhum componente
 * importa este arquivo. O motor em produção continua sendo exclusivamente
 * `faceModels.js` (face-api.js), com MATCH_THRESHOLD/MATCH_MARGIN/
 * CONSISTENCY_FRAMES/findSecureMatch/evaluateFramePosition/
 * enhanceForLowLight intocados em AdminFaceScanner.jsx.
 *
 * A Fase F (modo observador, quando autorizada) será o primeiro lugar a
 * efetivamente chamar essas funções, em paralelo ao motor atual, sem
 * influenciar nenhuma decisão real de check-in.
 */
import { Human } from '@vladmandic/human';

// Threshold candidato, calibrado com dado real na Fase D (não é definitivo —
// amostra pequena, 4 pessoas / 8 comparações). Ver seção 8 de
// FASE_D_CALIBRACAO_THRESHOLD_HUMAN.md.
export const HUMAN_MATCH_THRESHOLD_COSINE = 0.48;

const config = {
  modelBasePath: '/models-human/',
  backend: 'webgl',
  debug: false,
  cacheSensitivity: 0, // cada detecção é tratada de forma independente — ver bug documentado na Fase C (cache entre frames misturava resultados de fotos diferentes)
  face: {
    detector: { enabled: true },
    mesh: { enabled: true },
    description: { enabled: true },
    emotion: { enabled: false },
    iris: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: false },
  object: { enabled: false },
};

let _human = null;
let _loadPromise = null;

/**
 * Inicia (ou retorna já resolvida) a Promise de carregamento dos modelos do
 * Human. Mesmo padrão de `preloadFaceModels()` em faceModels.js — chamar
 * várias vezes é seguro, só carrega uma vez.
 */
export function preloadHumanModels() {
  if (!_loadPromise) {
    _human = new Human(config);
    _loadPromise = _human.tf.ready().then(() => _human.load());
  }
  return _loadPromise;
}

/**
 * Detecta um rosto num elemento de vídeo/imagem/canvas e retorna o
 * descriptor (embedding de 1024 dimensões) + score de confiança da detecção.
 * Retorna null se nenhum rosto for detectado.
 *
 * Não mexe em câmera/canvas — recebe o elemento já pronto, mesma
 * responsabilidade que `faceapi.detectSingleFace(...)` tem hoje.
 */
export async function detectHumanDescriptor(input) {
  if (!_human) await preloadHumanModels();
  const result = await _human.detect(input, config);
  if (!result.face || result.face.length === 0) return null;
  const face = result.face[0];
  if (!face.embedding || face.embedding.length === 0) return null;
  return { descriptor: Array.from(face.embedding), score: face.score || 0 };
}

/**
 * Similaridade de cosseno entre dois descriptors — métrica validada na
 * Fase D (a distância euclidiana produzia overlap real entre match genuíno
 * de foto ruim e falso positivo; cosseno resolveu isso nos dados testados).
 * Retorna um valor entre -1 e 1; quanto MAIOR, mais parecido (o oposto de
 * distância euclidiana, onde menor = mais parecido).
 */
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Encontra a melhor correspondência entre um descriptor capturado e uma
 * lista de pessoas já cadastradas (cada uma com seu próprio descriptor).
 * Equivalente conceitual ao `findSecureMatch()` do motor atual, mas para o
 * espaço vetorial do Human (cosseno, não euclidiana) — implementação
 * própria, não uma cópia da lógica protegida do face-api.js.
 *
 * NÃO implementa (de propósito, nesta fase): verificação de ambiguidade
 * entre múltiplos candidatos próximos, nem a lógica de múltiplos frames
 * consecutivos (CONSISTENCY_FRAMES). Isso é responsabilidade de quem for
 * integrar esse motor num fluxo real (Fase F/G), não deste módulo de
 * primitivas — mantém a mesma separação de responsabilidade que
 * `storage.js` tem hoje (helpers puros, sem lógica de fluxo).
 *
 * @param {number[]} descriptor - descriptor capturado agora
 * @param {{id: string, descriptor: number[]}[]} candidates - pessoas cadastradas
 * @param {number} threshold - mínimo de similaridade pra considerar match (default: HUMAN_MATCH_THRESHOLD_COSINE)
 * @returns {{id: string, similarity: number} | null}
 */
export function findBestMatchHuman(descriptor, candidates, threshold = HUMAN_MATCH_THRESHOLD_COSINE) {
  let best = null;
  for (const candidate of candidates) {
    const similarity = cosineSimilarity(descriptor, candidate.descriptor);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: candidate.id, similarity };
    }
  }
  return best;
}

export { Human };
