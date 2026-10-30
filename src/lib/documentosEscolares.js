// Histórico escolar oficial e declarações (item 12 do plano de expansão da Gestão).
// Funções puras que montam o conteúdo do documento (a "foto" gravada na emissão), listam
// pendências de dados e validam os anos cursados fora. A emissão, o número e o hash saem do
// servidor (documentos_emitir); o texto aqui nunca leva hífen, é voltado à família e à escola.

export const TIPOS_DOCUMENTO = {
  historico: 'Histórico escolar',
  declaracao_matricula: 'Declaração de matrícula',
  declaracao_escolaridade: 'Declaração de escolaridade',
  ficha_acompanhamento: 'Ficha de acompanhamento',
};

export const RESULTADOS_EXTERNOS = [
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'transferido', label: 'Transferido' },
  { value: 'cursando', label: 'Cursando' },
];

const ROTULO_RESULTADO = {
  aprovado: 'Aprovado',
  recuperacao: 'Em recuperação final',
  reprovado: 'Reprovado',
  reprovado_frequencia: 'Reprovado por frequência',
  transferido: 'Transferido',
  cursando: 'Cursando',
};

export const rotuloResultado = (v) => ROTULO_RESULTADO[v] || '';

// Tipos que a escola Montessori emite no lugar do histórico com notas.
export function tipoPadraoDoHistorico(metodo) {
  return metodo === 'montessori' ? 'ficha_acompanhamento' : 'historico';
}

export function tiposDisponiveis(metodo) {
  const base = ['declaracao_matricula', 'declaracao_escolaridade'];
  return metodo === 'montessori' ? ['ficha_acompanhamento', ...base] : ['historico', ...base];
}

// 16 caracteres hexadecimais em grupos de 4 separados por espaço, como aparece no documento.
export function formatarCodigo(codigo) {
  const limpo = String(codigo || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return limpo.match(/.{1,4}/g)?.join(' ') || '';
}

export function normalizarCodigo(texto) {
  return String(texto || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 32);
}

export const codigoValido = (texto) => /^[0-9A-F]{16}$/.test(normalizarCodigo(texto));

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataPorExtenso(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return '';
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

// "Matemática: 8,5" por linha, para a pessoa digitar sem tabela.
export function parseDisciplinas(texto) {
  return String(texto || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 40).map((linha) => {
    const i = linha.lastIndexOf(':');
    if (i < 0) return { nome: linha.slice(0, 80), nota: '' };
    return { nome: linha.slice(0, i).trim().slice(0, 80), nota: linha.slice(i + 1).trim().slice(0, 12) };
  }).filter(d => d.nome);
}

export const disciplinasParaTexto = (lista) =>
  (lista || []).map(d => (d.nota ? `${d.nome}: ${d.nota}` : d.nome)).join('\n');

// Valida o formulário de um ano cursado fora. Devolve a mensagem do primeiro problema ou ''.
export function validarAnoExterno(f, anoAtual = new Date().getFullYear()) {
  if (!String(f?.escola_origem || '').trim()) return 'Informe a escola de origem.';
  const ano = Number(f?.ano_letivo);
  if (!Number.isInteger(ano) || ano < 1980 || ano > anoAtual) return 'Confira o ano letivo.';
  if (!String(f?.serie || '').trim()) return 'Informe a série cursada.';
  if (f?.uf && !/^[A-Za-z]{2}$/.test(String(f.uf).trim())) return 'A sigla do estado tem duas letras.';
  if (f?.carga_horaria !== '' && f?.carga_horaria != null) {
    const ch = Number(f.carga_horaria);
    if (!Number.isInteger(ch) || ch < 1 || ch > 10000) return 'Confira a carga horária.';
  }
  if (f?.frequencia !== '' && f?.frequencia != null) {
    const fr = Number(String(f.frequencia).replace(',', '.'));
    if (!Number.isFinite(fr) || fr < 0 || fr > 100) return 'A frequência vai de 0 a 100.';
  }
  return '';
}

export function linhaDoAnoExterno(f, userId) {
  const fr = f.frequencia === '' || f.frequencia == null ? null : Number(String(f.frequencia).replace(',', '.'));
  return {
    escola_origem: String(f.escola_origem).trim(),
    cidade: String(f.cidade || '').trim() || null,
    uf: String(f.uf || '').trim().toUpperCase() || null,
    ano_letivo: Number(f.ano_letivo),
    serie: String(f.serie).trim(),
    disciplinas: parseDisciplinas(f.disciplinas_texto),
    carga_horaria: f.carga_horaria === '' || f.carga_horaria == null ? null : Number(f.carga_horaria),
    frequencia: fr,
    resultado: f.resultado || 'aprovado',
    observacao: String(f.observacao || '').trim() || null,
    ...(userId ? { created_by: userId } : {}),
  };
}

// Junta os anos da própria escola (resultados fechados do Método Tradicional) com os cursados
// fora, do mais antigo ao mais recente. Montessori: sem notas, só série, frequência e resultado.
export function montarAnos({ internos = [], externos = [], escolaNome = '', semNotas = false }) {
  const dosInternos = internos.map(a => ({
    origem: 'interna',
    ano: String(a.ano),
    serie: a.turma || '',
    escola: escolaNome,
    cidade: '',
    uf: '',
    disciplinas: semNotas ? [] : (a.boletim || []).map(l => ({
      nome: l.disciplina,
      nota: l.media_anual === null || l.media_anual === undefined ? '' : String(l.media_anual).replace('.', ','),
    })),
    cargaHoraria: null,
    frequencia: a.frequencia,
    resultado: a.situacao,
    observacao: a.observacao || '',
  }));
  const dosExternos = externos.map(e => ({
    origem: 'externa',
    ano: String(e.ano_letivo),
    serie: e.serie,
    escola: e.escola_origem,
    cidade: e.cidade || '',
    uf: e.uf || '',
    disciplinas: semNotas ? [] : (e.disciplinas || []),
    cargaHoraria: e.carga_horaria,
    frequencia: e.frequencia === null || e.frequencia === undefined ? null : Number(e.frequencia),
    resultado: e.resultado,
    observacao: e.observacao || '',
  }));
  return [...dosExternos, ...dosInternos].sort(
    (a, b) => a.ano.localeCompare(b.ano, 'pt-BR', { numeric: true }) || (a.origem === 'externa' ? -1 : 1),
  );
}

export function enderecoEmLinha(e) {
  if (!e) return '';
  const rua = [e.street, e.number].filter(Boolean).join(', ');
  const cidade = [e.city, e.state].filter(Boolean).join('/');
  return [rua, e.complement, e.neighborhood, cidade, e.zip_code ? `CEP ${e.zip_code}` : ''].filter(Boolean).join(', ');
}

// Dados que faltam para o documento sair completo. Aviso, nunca bloqueio.
export function pendenciasDeDados({ escola, aluno, responsaveis = [], tipo, anos = [], ato = '' }) {
  const p = [];
  if (!escola?.razao_social && !escola?.name) p.push('Nome da escola');
  if (!escola?.cnpj) p.push('CNPJ da escola');
  if (!escola?.city) p.push('Endereço da escola');
  if (!escola?.director_name) p.push('Nome da direção');
  if (tipo !== 'declaracao_matricula' && !String(ato).trim()) p.push('Ato de autorização da escola');
  if (!aluno?.birth_date) p.push('Data de nascimento do aluno');
  if (!aluno?.cidade_nascimento) p.push('Naturalidade do aluno');
  if (!responsaveis.length) p.push('Filiação (responsáveis) do aluno');
  if ((tipo === 'historico' || tipo === 'ficha_acompanhamento') && !anos.length) p.push('Nenhum ano cursado para mostrar');
  return p;
}

function textoDaDeclaracao(tipo, { aluno, escolaNome, serie, ano }) {
  const nome = aluno.nome;
  if (tipo === 'declaracao_matricula') {
    return `Declaramos, para os devidos fins, que ${nome}${aluno.nascimento ? `, nascido(a) em ${dataBR(aluno.nascimento)}` : ''}, está regularmente matriculado(a) em ${escolaNome}${serie ? `, na turma ${serie}` : ''}, no ano letivo de ${ano}.`;
  }
  return `Declaramos, para os devidos fins, que ${nome}${aluno.nascimento ? `, nascido(a) em ${dataBR(aluno.nascimento)}` : ''}, frequenta ou frequentou ${escolaNome}${serie ? `, tendo como turma atual ${serie}` : ''}, conforme os registros desta secretaria.`;
}

// A "foto" do documento. Fica gravada em school_documents_issued.conteudo.
export function montarConteudo({
  tipo, escola, aluno, responsaveis = [], anos = [], metodo, secretario = '', diretor = '',
  observacoes = '', local = '', data, ato = '', turmaAtual = '',
}) {
  const escolaNome = escola?.razao_social || escola?.name || '';
  const alunoNome = aluno?.name || '';
  const base = {
    versao: 1,
    tipo,
    titulo: TIPOS_DOCUMENTO[tipo] || 'Documento escolar',
    semNotas: tipo === 'ficha_acompanhamento' || metodo === 'montessori',
    escola: {
      nome: escola?.name || '',
      razaoSocial: escola?.razao_social || '',
      cnpj: escola?.cnpj || '',
      ato: String(ato || '').trim(),
      endereco: enderecoEmLinha(escola),
      telefone: escola?.phone || '',
      email: escola?.email || '',
    },
    aluno: {
      nome: alunoNome,
      nascimento: aluno?.birth_date || '',
      naturalidade: aluno?.cidade_nascimento || '',
      filiacao: responsaveis.map(r => ({ nome: r.nome, parentesco: r.parentesco || '' })),
    },
    observacoes: String(observacoes || '').trim().slice(0, 1500),
    local: String(local || '').trim().slice(0, 80),
    data: data || '',
    assinaturas: { secretario: String(secretario || '').trim().slice(0, 80), diretor: String(diretor || '').trim().slice(0, 80) },
  };
  if (tipo === 'declaracao_matricula' || tipo === 'declaracao_escolaridade') {
    return {
      ...base,
      anos: [],
      texto: textoDaDeclaracao(tipo, {
        aluno: base.aluno, escolaNome, serie: turmaAtual, ano: String(data || '').slice(0, 4) || String(new Date().getFullYear()),
      }),
    };
  }
  return { ...base, anos: anos.map(a => (base.semNotas ? { ...a, disciplinas: [] } : a)), texto: '' };
}
