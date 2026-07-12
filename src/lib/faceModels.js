/**
 * faceModels.js — Singleton para cache de modelos do face-api.js
 *
 * Os modelos são carregados UMA VEZ e ficam em memória.
 * Chamadas subsequentes ao preloadFaceModels() retornam
 * imediatamente (Promise já resolvida).
 */
import * as faceapi from 'face-api.js';

let _loadPromise = null;

/**
 * Inicia (ou retorna já resolvida) a Promise de carregamento dos modelos.
 * Chamar várias vezes é seguro — só carrega uma vez.
 */
export function preloadFaceModels() {
  if (!_loadPromise) {
    _loadPromise = Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]);
  }
  return _loadPromise;
}

export { faceapi };
