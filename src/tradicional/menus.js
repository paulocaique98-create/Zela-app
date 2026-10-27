// Abas do Montessori que a escola Tradicional não vê (relatórios de Mitigação
// e Mapa de Habilidades). Só esconde com método 'tradicional' explícito: sem
// método (carregando ou leitura falhou) nada some, para nunca tirar menu de
// escola Montessori por engano.
export const ABAS_SO_MONTESSORI = [
  'rel-mitigacao',
  'rel-mapa-habilidades',
  'academico-relatorios',
  'academico-mapa-habilidades',
];

export const ocultoNoTradicional = (method, aba) =>
  method === 'tradicional' && ABAS_SO_MONTESSORI.includes(aba);
