// Estruturas de dados compartilhadas entre Matrícula (PublicMatricula.jsx,
// família nova) e Rematrícula (FamilyMatriculas.jsx, família já cadastrada).
// Unificado porque os dois formulários já divergiam entre si (ex: Rematrícula
// não tinha endereço estruturado, e a lista de documentos do responsável
// incluía o cartão de vacina, que é da CRIANÇA, não do responsável) -- os
// dois precisam sempre ter os mesmos campos e opções, já que são o mesmo
// conceito de formulário preenchido pelo mesmo público (responsáveis),
// só em dois momentos diferentes.

export const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Separado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'];
export const PARENTESCOS = ['Avô(ó)', 'Tio(a)', 'Irmão(ã)', 'Cuidador(a)', 'Babá', 'Outro'];

export const CICLOS = [6, 8, 10];
export const PERIODOS_POR_CICLO = {
  6: [
    { label: '07:00 às 13:00', turno: 'Matutino' },
    { label: '13:00 às 19:00', turno: 'Vespertino' },
  ],
  8: [
    { label: '07:00 às 15:00', turno: 'Matutino' },
    { label: '11:00 às 19:00', turno: 'Vespertino' },
    { label: '13:00 às 19:00', turno: 'Vespertino' },
  ],
  10: [
    { label: '07:00 às 17:00', turno: 'Matutino' },
    { label: '09:00 às 19:00', turno: 'Matutino' },
  ],
};

// Documentos do RESPONSÁVEL (nunca da criança) -- os dois formulários usam
// a mesma lista agora; antes a Rematrícula misturava o cartão de vacina
// (que é da criança) aqui dentro.
export const RESPONSAVEL_DOC_FIELDS = [
  { key: 'cpf_doc', label: 'CPF' },
  { key: 'rg_doc', label: 'RG' },
  { key: 'comprovante_residencia_doc', label: 'Comprovante de Residência' },
  { key: 'plano_saude_doc', label: 'Plano de Saúde ou SUS' },
];

// Documentos da CRIANÇA -- certidão de nascimento e cartão de vacina, um
// jogo por filho.
export const CRIANCA_DOC_FIELDS = [
  { key: 'certidao_doc', label: 'Certidão de Nascimento' },
  { key: 'cartao_vacina_doc', label: 'Cartão de Vacina' },
];

export const emptyResponsavel = () => ({
  nome: '', email: '', cpf: '', rg: '', rg_expedicao: '', rg_orgao: '',
  telefone: '', telefone2: '', profissao: '', estado_civil: '',
});

export const emptyCrianca = () => ({
  id: Date.now() + Math.random(),
  nome: '', nascimento: '', cidade_nascimento: '', ciclo: '', periodo: '', turno: '',
  cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  alimentacao_atual: '', restricao_alimentar: '', restricao_saude: '',
  especialista: '', tratamento: '', alergia: '', habito_importante: '',
  certidao_doc: null, cartao_vacina_doc: null,
});

export const emptyAutorizado = () => ({ id: Date.now() + Math.random(), nome: '', telefone: '', parentesco: '' });
export const emptyTransporteAutorizado = () => ({ id: Date.now() + Math.random(), nome: '' });

// Monta o campo único "endereço" que o resto do sistema já espera (tela do
// Admin em Formulários > Matrículas mostra c.endereco como uma linha só) --
// a coleta em si fica em campos separados (CEP/Rua/Número/Complemento/
// Bairro/Cidade/UF) nos dois formulários.
export function montarEndereco(c) {
  const linha1 = [c.rua, c.numero].filter(Boolean).join(', ') + (c.complemento ? ` · ${c.complemento}` : '');
  const linha2 = [c.bairro, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(', ');
  return [linha1.trim(), linha2, c.cep ? `CEP ${c.cep}` : ''].filter(Boolean).join(' · ');
}

export const inputCls = 'w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-on-surface text-sm';
export const labelCls = 'block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5';
