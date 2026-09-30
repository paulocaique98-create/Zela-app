// Contas vinculadas (29/09/2026): a mesma pessoa com mais de uma conta
// (ex.: Coordenadora que também é mãe) troca entre elas pelo botão ao lado
// do "Sair". Regras de exibição do botão; o vínculo e a troca são conferidos
// no servidor (migração 20260929233347_contas_vinculadas.sql e funções
// vincular-conta / trocar-conta).

const ROTULOS = {
  family: 'Responsável',
  teacher: 'Professora',
  gestao: 'Gestão',
};

export function rotuloDaConta(conta) {
  if (!conta) return '';
  if (conta.role === 'gestao_pedagogica') return conta.departamento === 'diretoria_pedagogica' ? 'Direção' : 'Coordenação';
  if (conta.role === 'admin') return conta.departamento && conta.departamento !== 'recepcao' ? 'Equipe' : 'Recepção';
  return ROTULOS[conta.role] || 'Conta';
}

// "Responsável · Maitê" / "Coordenação · Escola Montessori".
export function tituloDaConta(conta) {
  const rotulo = rotuloDaConta(conta);
  const complemento = conta?.role === 'family' && conta.alunos?.length ? conta.alunos.join(', ') : conta?.escola;
  return complemento ? `${rotulo} · ${complemento}` : rotulo;
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
