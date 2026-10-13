import { SETORES_CHAT } from './constants';

// Setores da escola no chat (sem o Suporte Zela, que não é configurável).
export const SETORES_ESCOLA_CHAT = SETORES_CHAT.filter(s => s.value !== 'suporte_zela');

// Espelha a função SQL chat_pode_user (a RLS é a regra de verdade; isto só
// decide o que mostrar na tela).
//   gestao -> tudo | chat_visibilidade_total -> tudo
//   senão: linha de chat_acesso_setor (perfil = departamento, setor); sem linha,
//   só o próprio setor.
export function podeNoSetor(user, linhas, setor, acao) {
  if (!user || !SETORES_ESCOLA_CHAT.some(s => s.value === setor)) return false;
  if (user.role === 'gestao' || user.chat_visibilidade_total) return true;
  const linha = (linhas || []).find(l => l.perfil === user.departamento && l.setor === setor);
  if (linha) return !!linha.pode_ver && (acao === 'ver' || !!linha.pode_responder);
  return user.departamento === setor;
}

export function setoresVisiveis(user, linhas) {
  return SETORES_ESCOLA_CHAT.filter(s => podeNoSetor(user, linhas, s.value, 'ver'));
}

// Matriz completa (perfil x setor) com o padrão aplicado onde não há linha.
export function matrizDeAcesso(linhas) {
  return SETORES_ESCOLA_CHAT.flatMap(perfil => SETORES_ESCOLA_CHAT.map(setor => {
    const l = (linhas || []).find(x => x.perfil === perfil.value && x.setor === setor.value);
    const padrao = perfil.value === setor.value;
    return {
      perfil: perfil.value,
      setor: setor.value,
      pode_ver: l ? !!l.pode_ver : padrao,
      pode_responder: l ? !!l.pode_ver && !!l.pode_responder : padrao,
    };
  }));
}
