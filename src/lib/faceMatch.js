// Mesmo limiar (MATCH_THRESHOLD) usado no reconhecimento ao vivo
// (AdminFaceScanner) — se duas biometrias ficam mais parecidas que isso, o
// próprio reconhecimento já as trataria como a mesma pessoa, então não faz
// sentido permitir cadastrar as duas nem deixar duas coexistirem sem avisar.
// Compartilhado entre App.jsx (bloqueio no cadastro) e
// AdminDuplicateBiometrics.jsx (varredura dos já cadastrados).
export const FACE_DUPLICATE_THRESHOLD = 0.45;

export function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function parseDescriptor(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
