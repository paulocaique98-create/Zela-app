import * as XLSX from 'xlsx';

// Colunas do modelo de importação em massa de Matrícula/Rematrícula — uma
// linha por CRIANÇA (irmãos repetem os dados do(s) responsável(is) em cada
// linha própria; o import agrupa de volta por CPF do responsável). Nomes de
// coluna batem 1 pra 1 com os campos reais do formulário unificado (ver
// src/lib/matriculaFields.js) -- pensado pra digitar a partir de um
// formulário antigo em papel/Google Forms, sem depender de nenhum sistema
// externo.
export const IMPORT_COLUMNS = [
  'Nome do Responsavel Financeiro *',
  'Email do Responsavel Financeiro *',
  'Telefone 1 do Responsavel *',
  'Telefone 2 do Responsavel',
  'CPF do Responsavel *',
  'RG do Responsavel',
  'Data de Expedicao do RG (dd/mm/aaaa)',
  'Orgao Expedidor do RG',
  'Profissao do Responsavel',
  'Estado Civil do Responsavel',
  'Nome do 2o Responsavel',
  'Email do 2o Responsavel',
  'Telefone do 2o Responsavel',
  'CPF do 2o Responsavel',
  'RG do 2o Responsavel',
  'Nome da Crianca *',
  'Cidade de Nascimento da Crianca *',
  'Data de Nascimento da Crianca (dd/mm/aaaa) *',
  'Ciclo da Crianca em horas: 6, 8 ou 10 *',
  'Periodo da Crianca (ex: 07:00 as 13:00) *',
  'CEP',
  'Rua',
  'Numero',
  'Complemento',
  'Bairro',
  'Cidade',
  'UF',
  'Restricao Alimentar',
  'Alimentacao Atual',
  'Restricao de Saude',
  'Especialista Consultado',
  'Tratamento em Andamento',
  'Alergia',
  'Habito Importante',
  'Nome do Autorizado 1',
  'Telefone do Autorizado 1',
  'Parentesco do Autorizado 1',
  'Nome do Autorizado 2',
  'Telefone do Autorizado 2',
  'Parentesco do Autorizado 2',
  'Autorizacao de Imagem (sim ou nao)',
  'Autorizacao de Emergencia Medica (sim ou nao)',
];

const EXAMPLE_ROW = [
  'Maria Silva', 'maria.silva@email.com', '27999990000', '',
  '12345678900', '1234567', '01/03/2010', 'SSP ES', 'Professora', 'Casada',
  '', '', '', '', '',
  'Joao Silva', 'Vitoria', '15/05/2020', '8', '07:00 as 15:00',
  '29000000', 'Rua das Flores', '100', 'Apto 201', 'Centro', 'Vitoria', 'ES',
  'Nao possui', 'Come de tudo, sem restricao', 'Nao possui', 'Nao', 'Nao faz',
  'Nao possui', 'Usa chupeta para dormir',
  'Ana Souza', '27988880000', 'Avo(o)', '', '', '',
  'sim', 'sim',
];

// Gera e baixa o arquivo .xlsx do modelo, com cabeçalho + 1 linha de
// exemplo (igual ao padrão já usado em AdminImportModal.jsx).
export function downloadMatriculaImportTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS, EXAMPLE_ROW]);
  worksheet['!cols'] = IMPORT_COLUMNS.map(() => ({ wch: 26 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Matriculas');
  XLSX.writeFile(workbook, 'modelo-importacao-matriculas.xlsx');
}
