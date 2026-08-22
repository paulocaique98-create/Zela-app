// Ordem e rótulos exatos do modelo em PDF do Relatório de Mitigação — a
// sequência aqui define também a ordem de liberação (current_step).
export const MITIGACAO_SECTIONS = [
  { key: 'entrada', label: 'Entrada' },
  { key: 'socializacao', label: 'Socialização' },
  { key: 'foco_interesses', label: 'Foco de Interesses' },
  { key: 'alimentacao', label: 'Alimentação' },
  { key: 'sono', label: 'Sono' },
  { key: 'normalizacao', label: 'Normalização' },
  { key: 'pontuacoes_gerais', label: 'Pontuações Gerais' },
  { key: 'conclusao', label: 'Conclusão' },
];

// Calcula idade no formato "X ano(s) e Y mes(es)", igual ao cabeçalho do modelo.
export function calcIdade(birthDateStr) {
  if (!birthDateStr) return '';
  const birth = new Date(birthDateStr + 'T00:00:00');
  if (isNaN(birth.getTime())) return '';
  const today = new Date();

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }

  const y = years > 0 ? `${years} ano${years !== 1 ? 's' : ''}` : '';
  const m = `${months} ${months !== 1 ? 'meses' : 'mês'}`;
  if (!y) return m;
  return `${y} e ${m}`;
}

// Texto de introdução padrão do modelo — fixo, não editável, gerado a partir
// do primeiro nome do aluno e do período de referência do relatório.
export function buildIntroducaoText(studentName, referencePeriod) {
  const primeiroNome = (studentName || '').trim().split(' ')[0] || 'aluno(a)';
  const semestre = referencePeriod?.startsWith('2º') ? 'segundo semestre letivo' : 'primeiro semestre letivo';
  return `Este relatório pedagógico tem como objetivo apresentar uma síntese do processo de desenvolvimento de ${primeiroNome} ao longo do ${semestre}.

Os pontos abordados incluem a entrada da criança na escola, seu processo de socialização, participação no ciclo de trabalho, foco de interesses, além de aspectos relacionados à alimentação, sono, normalização e necessidades fisiológicas. Também são apresentadas pontuações gerais e uma conclusão que conecta as observações na mitigação, delineando expectativas e propostas para o próximo semestre.`;
}
