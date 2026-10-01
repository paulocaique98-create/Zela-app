// Atualizações em tempo real de pessoas autorizadas (01/10/2026).
//
// Toda alteração em authorized_persons chega em tempo real ao totem (que
// recarregava TODAS as biometrias da escola e reiniciava o ciclo de leitura)
// e ao app (que buscava de novo o link da foto). Gravar só os números de
// qualidade da foto (foto_qualidade) de 145 pessoas causaria 145 recargas
// seguidas no totem. Agora só recarrega quando muda algo que importa.

function igual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

// true se algum dos campos mudou (ou se ainda não conhecemos a pessoa).
export function camposMudaram(atual, novo, campos) {
  if (!atual || !novo) return true;
  return campos.some(c => !igual(atual[c], novo[c]));
}

// O que o totem usa para reconhecer (lista carregada no scanner).
export const CAMPOS_DO_TOTEM = ['name', 'relation', 'family_id', 'face_descriptor', 'face_descriptor_v2', 'status'];

// Junta várias alterações seguidas numa recarga só (ex.: a análise de
// qualidade gravando dezenas de pessoas em sequência).
export function agruparChamadas(fn, esperaMs = 1500) {
  let timer = null;
  const agendada = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(); }, esperaMs);
  };
  agendada.cancelar = () => { clearTimeout(timer); timer = null; };
  return agendada;
}
