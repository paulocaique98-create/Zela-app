/**
 * humanShadowWorker.js — roda o motor Human isolado num Web Worker.
 *
 * Por quê: face-api.js (usado no thread principal, AdminFaceScanner.jsx) e
 * @vladmandic/human embutem versões diferentes do TensorFlow.js. Carregar os
 * dois no mesmo contexto JS causa um erro de conflito de estado global
 * (confirmado em teste real — ver FASE_F_MODO_OBSERVADOR.md). Um Web Worker
 * tem um escopo global totalmente separado, então o `Human` roda aqui sem
 * nenhum risco de colidir com o `face-api.js` do thread principal.
 *
 * FASE F do plano — modo observador: este worker só existe para medir o que
 * o Human diria sobre um frame já confirmado pelo motor atual. Nunca decide
 * nada sozinho, nunca é consultado antes da decisão real.
 */
import { Human } from '@vladmandic/human';

const config = {
  modelBasePath: '/models-human/',
  backend: 'webgl',
  debug: false,
  cacheSensitivity: 0,
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

let human = null;
let loadPromise = null;

function ensureLoaded() {
  if (!loadPromise) {
    human = new Human(config);
    loadPromise = human.tf.ready().then(() => human.load());
  }
  return loadPromise;
}

self.onmessage = async (event) => {
  const { id, type, imageBitmap } = event.data;
  if (type !== 'detect') return;

  try {
    await ensureLoaded();
    const result = await human.detect(imageBitmap, config);
    imageBitmap.close();

    if (!result.face || result.face.length === 0 || !result.face[0].embedding) {
      self.postMessage({ id, ok: true, descriptor: null });
      return;
    }
    self.postMessage({ id, ok: true, descriptor: Array.from(result.face[0].embedding), score: result.face[0].score || 0 });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};
