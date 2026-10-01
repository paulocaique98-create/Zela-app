import { versaoNovaParaRecarregar, recarregarParaVersao } from './versaoDoApp';

// Atualização automática do Autoatendimento (01/10/2026). O totem não
// mostra o aviso de versão nova e não recarregava sozinho: o iPhone da
// escola ficou horas com a versão antiga, inclusive a captura antiga do
// cadastro de biometria. Agora, havendo versão nova, ele recarrega quando
// ninguém usa o totem há alguns minutos: nenhum rosto na câmera e nenhum
// toque na tela.

export const TOTEM_OCIOSO_MS = 3 * 60 * 1000;

let ultimaAtividade = Date.now();

// Rosto na câmera, toque ou tecla: alguém está usando o totem.
export function marcarAtividadeDoTotem(agora = Date.now()) {
  ultimaAtividade = agora;
}

export function ultimaAtividadeDoTotem() {
  return ultimaAtividade;
}

export function totemOcioso(agora, ultima, limite = TOTEM_OCIOSO_MS) {
  return agora - ultima >= limite;
}

// Confere e, se for o caso, recarrega. Tudo injetável para teste. Confere a
// ociosidade de novo depois de buscar a versão: alguém pode ter chegado.
export async function tentarAtualizarTotem({
  relogio = () => Date.now(),
  lerAtividade = ultimaAtividadeDoTotem,
  online = () => typeof navigator === 'undefined' || navigator.onLine !== false,
  continuar = () => true,
  buscarVersaoNova = () => versaoNovaParaRecarregar(),
  antesDeRecarregar = () => {},
  recarregar = (build) => recarregarParaVersao(build),
} = {}) {
  const ocioso = () => totemOcioso(relogio(), lerAtividade());
  if (!online() || !ocioso()) return 'aguardando';
  const build = await buscarVersaoNova();
  if (!build) return 'sem_versao_nova';
  if (!continuar() || !ocioso()) return 'aguardando';
  antesDeRecarregar();
  recarregar(build);
  return 'recarregando';
}

// Leitor aberto antes da recarga (rosto ou QR): volta aberto depois dela,
// para o totem seguir funcionando sem ninguém precisar tocar em nada.
const CHAVE_LEITOR_ABERTO = 'zela_totem_reabrir_leitor';
const LEITORES = ['rosto', 'qr'];

export function lembrarLeitorAberto(leitor, storage = globalThis.sessionStorage) {
  try { storage?.setItem(CHAVE_LEITOR_ABERTO, leitor); } catch { /* sem armazenamento: só não reabre */ }
}

export function leitorParaReabrir(storage = globalThis.sessionStorage) {
  try {
    const leitor = storage?.getItem(CHAVE_LEITOR_ABERTO);
    return LEITORES.includes(leitor) ? leitor : null;
  } catch {
    return null;
  }
}

export function esquecerLeitorAberto(storage = globalThis.sessionStorage) {
  try { storage?.removeItem(CHAVE_LEITOR_ABERTO); } catch { /* nada a fazer */ }
}
