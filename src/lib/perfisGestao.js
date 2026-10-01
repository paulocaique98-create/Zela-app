import { ITEM_POR_ID } from './modulosCatalogo';

// Perfis do Portal da Gestão (PLANO_PERFIL_GESTAO_PEDAGOGICA.md, 29/09/2026).
//
// 'gestao'            · a Gestão da escola, vê tudo.
// 'gestao_pedagogica' · Coordenação e Direção (o rótulo vem do departamento):
//                       mesmo portal, SEM financeiro, contratos, notas
//                       fiscais, horas extras, permissões, configurações
//                       (exceto o alerta de faltas) e LGPD.
//
// Fonte única de verdade da TELA (menu, atalhos, link direto). Quem barra de
// verdade é o banco (regras "Gestao pedagogica ..." da migração
// perfil_gestao_pedagogica). O teste perfisGestao.test.js confere que toda
// aba do menu da Gestão está classificada aqui, então uma tela nova nunca
// aparece para a Coordenação sem alguém decidir.

export const PAPEL_GESTAO = 'gestao';
export const PAPEL_GESTAO_PEDAGOGICA = 'gestao_pedagogica';

export function usaPortalGestao(role) {
  return role === PAPEL_GESTAO || role === PAPEL_GESTAO_PEDAGOGICA;
}

export function ehGestaoPedagogica(role) {
  return role === PAPEL_GESTAO_PEDAGOGICA;
}

// Abas que a Coordenação e a Direção veem.
export const ABAS_GESTAO_PEDAGOGICA = new Set([
  'home',
  'pendencias',
  // Secretaria
  'secretaria-alunos',
  'secretaria-matriculas',
  'secretaria-documentos',
  // Presença (consulta e correções que não geram hora extra)
  'presenca-dia',
  'attendance-corrections',
  // Cadastros
  'cadastros-usuarios',
  'cadastros-novo',
  'cadastros-turmas',
  // Acadêmico
  'academico-ano-letivo',
  'academico-frequencia',
  'academico-relatorios',
  'academico-ocorrencias',
  'calendario',
  'academico-cardapio',
  'academico-diario',
  'academico-materias',
  // Comunicação
  'comunicacao-comunicados',
  'comunicacao-mural',
  // Relatórios sem valores
  'relatorios-academico',
  'relatorios-operacional',
  // Configurações · alerta de faltas
  'config-academico',
]);

// Telas pedagógicas que vieram do portal da Recepção e só existem para a
// Coordenação e a Direção (a Gestão não opera Cardápio, Diário e Matérias).
export const ABAS_SO_GESTAO_PEDAGOGICA = new Set([
  'academico-cardapio',
  'academico-diario',
  'academico-materias',
]);

// Abas exclusivas da Gestão (listadas de propósito: o teste exige que toda
// aba do menu esteja numa das duas listas).
export const ABAS_SO_GESTAO = new Set([
  'contratos-lista', 'contratos-modelos', 'contratos-assinaturas', 'contratos-aditivos',
  'financeiro-visao', 'financeiro-mensalidades', 'financeiro-cobrancas', 'financeiro-inadimplencia',
  'financeiro-recebimentos', 'financeiro-despesas',
  'horas-extras',
  'cadastros-funcionarios', 'cadastros-fornecedores', 'cadastros-exclusoes', 'cadastros-biometria', 'cadastros-qualidade-biometria', 'cadastros-unificar',
  'relatorios-gestao', 'relatorios-financeiro',
  'config-escola', 'config-financeiro', 'config-comunicacao', 'config-seguranca',
  'permissoes-perfis', 'permissoes-auditoria', 'integracoes',
]);

export function podeVerAba(role, tab) {
  if (role === PAPEL_GESTAO) return !ABAS_SO_GESTAO_PEDAGOGICA.has(tab);
  if (role === PAPEL_GESTAO_PEDAGOGICA) return ABAS_GESTAO_PEDAGOGICA.has(tab);
  return false;
}

// Abas da Gestão que dependem do plano da escola (01/10/2026). Antes a Gestão
// mostrava Acadêmico, Mural etc. em qualquer plano; agora segue as mesmas
// chaves de features_enabled que a Recepção, a Família e as Professoras.
// Chave do plano base (sempre incluso) é lida como `!== false`; módulo ou
// adicional, como `=== true` (regra "tudo começa desativado").
export const MODULO_DA_ABA_GESTAO = {
  'academico-frequencia': 'frequencia',
  'academico-relatorios': 'relatorios_pedagogicos',
  'academico-materias': 'materias',
  'academico-cardapio': 'cardapio',
  'academico-diario': 'diario',
  'comunicacao-mural': 'mural',
  'comunicacao-comunicados': 'comunicados',
  calendario: 'calendario',
  'presenca-dia': 'checkin',
  'attendance-corrections': 'checkin',
  'horas-extras': 'checkin',
  'financeiro-visao': 'financeiro',
  'financeiro-mensalidades': 'financeiro',
  'financeiro-cobrancas': 'financeiro',
  'financeiro-inadimplencia': 'financeiro',
  'financeiro-recebimentos': 'financeiro',
  'financeiro-despesas': 'financeiro',
  'relatorios-financeiro': 'financeiro',
  'config-financeiro': 'financeiro',
};

const CHAVES_DO_PLANO_BASE = new Set(ITEM_POR_ID.base.keys);

export function chaveLigada(features, chave) {
  const f = features || {};
  return CHAVES_DO_PLANO_BASE.has(chave) ? f[chave] !== false : f[chave] === true;
}

export function abaLiberadaPeloPlano(tab, features) {
  const chave = MODULO_DA_ABA_GESTAO[tab];
  return !chave || chaveLigada(features, chave);
}

// Perfil pode ver a aba E o plano da escola tem o módulo dela.
export function podeAbrirAba(role, tab, features) {
  return podeVerAba(role, tab) && abaLiberadaPeloPlano(tab, features);
}

// O que cada perfil faz dentro das telas que os dois veem.
export function recursosDoPerfil(role) {
  const gestao = role === PAPEL_GESTAO;
  return {
    financeiro: gestao, // valores, cobranças, aba Financeiro do aluno, bolsista de hora extra
    escolherResponsavelFinanceiro: gestao,
    aprovarCorrecaoQueGeraCobranca: gestao,
    excluirContas: gestao,
    criarContasDaEquipe: gestao,
    abrirAnoLetivo: gestao,
    chat: role === PAPEL_GESTAO_PEDAGOGICA,
  };
}

// Áreas do painel de Pendências que a Coordenação e a Direção veem.
export const AREAS_PENDENCIAS_GESTAO_PEDAGOGICA = new Set(['cadastros', 'secretaria', 'presenca']);

// Rótulo do perfil na tela: Gestão, Coordenação ou Direção.
export function rotuloDoPerfil(user) {
  if (user?.role === PAPEL_GESTAO_PEDAGOGICA) {
    return user?.departamento === 'diretoria_pedagogica' ? 'Direção' : 'Coordenação';
  }
  return 'Gestão';
}
