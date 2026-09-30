// Versão antiga aberta depois de uma publicação (30/09/2026).
//
// Cada publicação troca os nomes dos arquivos das telas. Quem estava com o
// Zela aberto (o totem e a Recepção ficam o dia todo) continua na versão
// anterior e, ao abrir uma tela, pede um arquivo que não existe mais: a
// tela travava ("Failed to fetch dynamically imported module", "text/html
// is not a valid JavaScript MIME type"). Foi o que deixou entradas e saídas
// sem o nome de quem fez em 24 e 25/09 (a Recepção marcou à mão).
// Agora a página recarrega sozinha uma vez, já na versão nova. A trava de
// 60 segundos impede ficar recarregando sem parar se o erro for outro.

const CHAVE = 'zela_recarregou_versao_nova_em';
const INTERVALO_MINIMO_MS = 60 * 1000;

const PADROES = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /is not a valid JavaScript MIME type/i,
  /Unable to preload CSS/i,
];

export function ehErroDeVersaoAntiga(erro) {
  const mensagem = String(erro?.message ?? erro ?? '');
  return PADROES.some(p => p.test(mensagem));
}

// true se recarregou (ou vai recarregar); false se recarregou há pouco e
// não deve tentar de novo.
export function recarregarParaVersaoNova({
  storage = globalThis.sessionStorage,
  recarregar = () => globalThis.location.reload(),
  agora = Date.now(),
} = {}) {
  let ultima = 0;
  try { ultima = Number(storage?.getItem(CHAVE)) || 0; } catch { /* sem armazenamento */ }
  if (agora - ultima < INTERVALO_MINIMO_MS) return false;
  try { storage?.setItem(CHAVE, String(agora)); } catch { /* sem armazenamento */ }
  recarregar();
  return true;
}

// Vite avisa por este evento quando não consegue carregar uma tela.
export function instalarRecuperacaoDeVersaoAntiga(alvo = globalThis.window) {
  alvo?.addEventListener?.('vite:preloadError', (evento) => {
    if (recarregarParaVersaoNova()) evento.preventDefault();
  });
}
