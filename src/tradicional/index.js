// Método Tradicional (PLANO_METODO_TRADICIONAL.md). Tudo do Tradicional vive
// nesta pasta; os portais só importam daqui e leem as chaves como
// `features.x === true`. Nada do Montessori é editado.
export const METODO_TRADICIONAL = 'tradicional';
export const MODULO_TRADICIONAL_ID = 'pedagogico_tradicional';

export const ehTradicional = (method) => method === METODO_TRADICIONAL;

export { ABAS_SO_MONTESSORI, ocultoNoTradicional } from './menus';
