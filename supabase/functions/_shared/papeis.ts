// Fase C1 (Recepção): durante a troca de 'admin' para 'recepcao' as duas strings
// valem como Recepção. A C4 remove 'admin' daqui.
export const PAPEIS_RECEPCAO = ['admin', 'recepcao'];

export function ehRecepcao(role: unknown): boolean {
  return typeof role === 'string' && PAPEIS_RECEPCAO.includes(role);
}
