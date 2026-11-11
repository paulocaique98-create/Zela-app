// Recepção: o papel é só 'recepcao' (a troca de 'admin' terminou na Fase C4).
export const PAPEIS_RECEPCAO = ['recepcao'];

export function ehRecepcao(role: unknown): boolean {
  return typeof role === 'string' && PAPEIS_RECEPCAO.includes(role);
}
