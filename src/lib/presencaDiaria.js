// Presença Diária (30/09/2026): quatro grupos, cada aluno em um só.
//   · Presentes: na escola (in_school);
//   · Solicitações: pedido de entrada ou saída em aberto (pending_entry /
//     pending_exit), esperando a Recepção confirmar;
//   · Já saíram: saída confirmada hoje (left);
//   · Ausentes: sem movimentação hoje (idle) ou "Não irá hoje" (absent).
// Antes eram só Presentes (que juntava tudo menos ausentes) e Ausentes.

export const GRUPOS_PRESENCA = [
  { id: 'presentes', rotulo: 'Presentes' },
  { id: 'solicitacoes', rotulo: 'Solicitações' },
  { id: 'sairam', rotulo: 'Já saíram' },
  { id: 'ausentes', rotulo: 'Ausentes' },
];

export function situacaoDoAluno(status) {
  if (status === 'in_school') return 'presentes';
  if (status === 'pending_entry' || status === 'pending_exit') return 'solicitacoes';
  if (status === 'left') return 'sairam';
  return 'ausentes';
}

export function contarSituacoes(alunos) {
  const contagem = { presentes: 0, solicitacoes: 0, sairam: 0, ausentes: 0 };
  for (const a of alunos || []) contagem[situacaoDoAluno(a.status)] += 1;
  return contagem;
}

export const MENSAGEM_VAZIA = {
  presentes: 'Nenhum aluno na escola agora.',
  solicitacoes: 'Nenhuma solicitação em aberto.',
  sairam: 'Nenhum aluno saiu ainda hoje.',
  ausentes: 'Nenhum ausente hoje.',
};
