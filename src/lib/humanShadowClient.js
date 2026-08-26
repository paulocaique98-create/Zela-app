/**
 * humanShadowClient.js — cliente para o Worker do motor Human
 * (humanShadowWorker.js). Ver esse arquivo para o porquê do Worker existir
 * (isolamento de TensorFlow.js, evita conflito com face-api.js).
 *
 * FASE F do plano de migração — modo observador. Só usado por
 * AdminFaceScanner.jsx, exclusivamente depois que o motor atual já confirmou
 * um match de verdade — nunca antes, nunca decide nada.
 */

let _worker = null;
let _reqId = 0;
const _pending = new Map();

function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL('./humanShadowWorker.js', import.meta.url), { type: 'module' });
    _worker.onmessage = (event) => {
      const { id, ...rest } = event.data;
      const resolve = _pending.get(id);
      if (resolve) {
        resolve(rest);
        _pending.delete(id);
      }
    };
    _worker.onerror = (err) => {
      console.error('[Shadow Human worker] erro não tratado:', err.message);
    };
  }
  return _worker;
}

/**
 * Envia um frame de vídeo pro worker do Human e aguarda o resultado.
 * Nunca lança exceção — em caso de erro, retorna { ok: false, error }.
 * Timeout de segurança de 15s pra nunca deixar uma Promise pendurada pra
 * sempre caso o worker trave.
 */
export async function detectViaHumanWorker(videoElement) {
  try {
    const imageBitmap = await createImageBitmap(videoElement);
    const worker = getWorker();
    const id = ++_reqId;

    const resultPromise = new Promise((resolve) => {
      _pending.set(id, resolve);
      worker.postMessage({ id, type: 'detect', imageBitmap }, [imageBitmap]);
    });

    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => { _pending.delete(id); resolve({ ok: false, error: 'timeout' }); }, 15000)
    );

    return await Promise.race([resultPromise, timeoutPromise]);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
