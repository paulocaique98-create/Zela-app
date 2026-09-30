// Contas vinculadas (29/09/2026): a mesma pessoa com mais de uma conta
// (ex.: Coordenadora que também é mãe) troca entre elas pelo botão ao lado
// do "Sair". Regras de exibição do botão; o vínculo e a troca são conferidos
// no servidor (migração 20260929233347_contas_vinculadas.sql e funções
// vincular-conta / trocar-conta).

import { SETORES_CHAT } from './constants';

// Rótulo pelo tipo de acesso e cargo da conta: Gestão, Coordenação ou
// Direção, o setor da Recepção, Professora, Responsável.
const ROTULOS = {
  family: 'Responsável',
  teacher: 'Professora',
  gestao: 'Gestão',
};

export function rotuloDaConta(conta) {
  if (!conta) return '';
  if (conta.role === 'gestao_pedagogica') return conta.departamento === 'diretoria_pedagogica' ? 'Direção' : 'Coordenação';
  // Equipe da Recepção: o nome do setor do cadastro (Recepção, Administrativo...).
  if (conta.role === 'admin') return SETORES_CHAT.find(s => s.value === conta.departamento && s.value !== 'suporte_zela')?.label || 'Recepção';
  return ROTULOS[conta.role] || 'Conta';
}

// "Responsável · Maitê" / "Coordenação" (sem o nome da escola, 30/09/2026).
export function tituloDaConta(conta) {
  const rotulo = rotuloDaConta(conta);
  return conta?.role === 'family' && conta.alunos?.length ? `${rotulo} · ${conta.alunos.join(', ')}` : rotulo;
}

export function totalNaoLidas(contas) {
  return (contas || []).filter(c => !c.atual).reduce((soma, c) => soma + (c.nao_lidas || 0), 0);
}

// Família só vê o botão quando já tem conta vinculada (não aparece para
// todos os responsáveis); a equipe sempre vê, para poder vincular. O
// suporte nunca.
export function mostrarBotaoDeContas(role, contas) {
  if (!role || role === 'developer') return false;
  if (role === 'family') return (contas || []).some(c => !c.atual);
  return true;
}

// Mensagem de erro que a função de borda devolveu no corpo.
export async function mensagemDaFuncao(fnError, fallback) {
  if (fnError?.context && typeof fnError.context.json === 'function') {
    try {
      const body = await fnError.context.json();
      if (body?.error) return body.error;
    } catch { /* corpo não era JSON */ }
  }
  return fallback;
}
