// Sessão encerrada em outro aparelho (01/10/2026).
//
// Diagnóstico: "Sair" e o deslogar por inatividade encerravam a sessão da
// conta em TODOS os aparelhos (padrão da biblioteca de login). A conta da
// Recepção fica aberta no totem e no computador da recepção: quando um
// deslogava, o totem continuava parecendo funcionar (o acesso guardado ainda
// valia para o banco), mas as funções do servidor recusavam com "Token
// inválido ou expirado" e o aviso de entrada/saída não chegava à família
// (210 vezes desde 18/09). Agora "Sair" é só do aparelho (App.jsx) e, se
// mesmo assim uma chamada encontrar a sessão encerrada, renova o login e
// tenta de novo; se não der, avisa o app para pedir login, em vez de falhar
// em silêncio.

export const EVENTO_SESSAO_ENCERRADA = 'zela:sessao-encerrada';

const PADROES_SESSAO = [
  /token inv[áa]lido/i,
  /token.*expirad/i,
  /invalid jwt/i,
  /jwt expired/i,
  /session.*(not found|missing|expired)/i,
];

export function ehSessaoInvalida(mensagem) {
  const m = String(mensagem ?? '');
  return PADROES_SESSAO.some(p => p.test(m));
}

async function mensagemDoErro(erro) {
  if (!erro) return null;
  if (erro.context && typeof erro.context.json === 'function') {
    try {
      const corpo = await erro.context.json();
      if (corpo?.error) return String(corpo.error);
      if (corpo?.msg) return String(corpo.msg);
    } catch { /* corpo não era JSON */ }
  }
  return erro.message || String(erro);
}

export function avisarSessaoEncerrada(alvo = globalThis.window) {
  try { alvo?.dispatchEvent?.(new CustomEvent(EVENTO_SESSAO_ENCERRADA)); } catch { /* sem janela (teste) */ }
}

// Chama uma função do servidor; se a sessão estiver vencida ou encerrada,
// renova o login e tenta uma vez de novo. Devolve { data, error, mensagem }.
export async function chamarFuncaoComSessao(supabase, nome, opcoes, { aoEncerrar = avisarSessaoEncerrada } = {}) {
  const tentar = async () => {
    const r = await supabase.functions.invoke(nome, opcoes);
    return { data: r.data, error: r.error, mensagem: r.error ? await mensagemDoErro(r.error) : null };
  };
  let resultado = await tentar();
  if (resultado.error && ehSessaoInvalida(resultado.mensagem)) {
    const { error: erroRenovar } = await supabase.auth.refreshSession();
    if (!erroRenovar) resultado = await tentar();
    if (resultado.error && ehSessaoInvalida(resultado.mensagem)) aoEncerrar();
  }
  return resultado;
}
