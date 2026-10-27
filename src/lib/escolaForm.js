import { featuresIniciais } from './modulosCatalogo';

// O que o "Editar/Nova Escola" do Portal do Dev grava em schools.
//
// NUNCA envia `turmas`: as turmas são da escola e ficam em Gestão › Cadastros
// › Turmas (RPCs update_school_turmas/rename_school_turma, que também
// atualizam os alunos). Enviar a lista daqui já apagou/renomeou turmas sem
// levar os alunos junto; o campo saiu do formulário em 28/09/2026.
// Também não mexe nos módulos ao editar (tela Módulos); escola nova nasce só
// com o plano base (regra: tudo que se ativa começa desativado).
export const METODOS_PEDAGOGICOS = ['tradicional', 'montessori', 'personalizado'];

// O método é escolhido explicitamente: o banco tem DEFAULT 'tradicional', então
// uma escola Montessori sem escolha viraria Tradicional sem ninguém notar.
export function montarDadosEscola({ formData, limits, pedagogicalMethod, customClassLabel, isNew }) {
  if (!METODOS_PEDAGOGICOS.includes(pedagogicalMethod)) {
    throw new Error('Selecione o método pedagógico da escola.');
  }
  const custom_config = customClassLabel.trim()
    ? { terminology: { class: customClassLabel.trim() } }
    : {};
  const dados = { ...formData, limits, pedagogical_method: pedagogicalMethod, custom_config };
  return isNew ? { ...dados, features_enabled: featuresIniciais() } : dados;
}
