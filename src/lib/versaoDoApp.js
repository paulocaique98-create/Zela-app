// Versão do Zela aberta neste aparelho x versão publicada (01/10/2026).
// O build grava /version.json e a constante __APP_BUILD__ (vite.config.js).
// Usado pelo aviso de versão nova (useAppUpdate), pela atualização
// automática do Autoatendimento e pela conferência antes da câmera do
// cadastro de biometria: o iPhone do totem ficou horas com a captura antiga
// porque o Autoatendimento nunca recarregava sozinho.

/* global __APP_BUILD__ */
export const BUILD_ATUAL = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : null;

// Para qual versão este aparelho já recarregou nesta sessão. Evita recarregar
// em laço se a hospedagem ainda servir a página antiga por alguns instantes.
export const CHAVE_RECARGA_DE_VERSAO = 'zela_recarregado_para_build';

// Build publicado agora, ou null (sem arquivo de versão, rede fora etc.).
export async function buscarBuildPublicado(fetchFn = fetch) {
  try {
    const res = await fetchFn(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.build === 'string' && data.build ? data.build : null;
  } catch {
    return null;
  }
}

function ler(storage, chave) {
  try { return storage?.getItem(chave) ?? null; } catch { return null; }
}

// Build novo para o qual vale recarregar agora, ou null: não dá para
// comparar, é a mesma versão ou este aparelho já recarregou para ela.
export async function versaoNovaParaRecarregar({ buildAtual = BUILD_ATUAL, fetchFn = fetch, storage = globalThis.sessionStorage } = {}) {
  if (!buildAtual) return null;
  const publicado = await buscarBuildPublicado(fetchFn);
  if (!publicado || publicado === buildAtual) return null;
  if (ler(storage, CHAVE_RECARGA_DE_VERSAO) === publicado) return null;
  return publicado;
}

// Anota a tentativa e recarrega a página.
export function recarregarParaVersao(build, { storage = globalThis.sessionStorage, recarregar = () => globalThis.location.reload() } = {}) {
  try { storage?.setItem(CHAVE_RECARGA_DE_VERSAO, build); } catch { /* sem armazenamento: recarrega assim mesmo */ }
  recarregar();
}
