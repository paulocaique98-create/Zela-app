// Biblioteca (módulo `biblioteca`, PLANO_EXPANSAO_GESTAO.md item 4).
// Regras puras: situação do empréstimo, ISBN, tombo e leitura da planilha do
// acervo. O banco é quem barra de verdade (RLS e RPCs library_*).

export const ESTADOS_EXEMPLAR = {
  bom: 'Bom',
  regular: 'Regular',
  ruim: 'Ruim',
  perdido: 'Perdido',
};

export const PRAZO_PADRAO_DIAS = 7;

export function hojeISO(base = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
}

export function somarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return hojeISO(new Date(a, m - 1, d + dias));
}

export function dataBR(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10).split('-').reverse().join('/');
}

function diasEntre(deISO, ateISO) {
  const [a1, m1, d1] = deISO.split('-').map(Number);
  const [a2, m2, d2] = ateISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

// 'devolvido' | 'atrasado' | 'vence_hoje' | 'em_dia', com os dias de atraso.
export function situacaoEmprestimo(emp, hoje = hojeISO()) {
  if (emp.devolvido_em) return { codigo: 'devolvido', diasAtraso: 0 };
  const dif = diasEntre(emp.devolver_ate, hoje);
  if (dif > 0) return { codigo: 'atrasado', diasAtraso: dif };
  if (dif === 0) return { codigo: 'vence_hoje', diasAtraso: 0 };
  return { codigo: 'em_dia', diasAtraso: 0 };
}

export const ROTULO_SITUACAO = {
  devolvido: 'Devolvido',
  atrasado: 'Atrasado',
  vence_hoje: 'Vence hoje',
  em_dia: 'Em dia',
};

// Leitor de código (USB, QR ou barras) digita o código e dá Enter: tira espaços
// e quebras de linha.
export function normalizarCodigo(valor) {
  return [...String(valor ?? '')].filter(c => c.charCodeAt(0) > 31).join('').replace(/\s+/g, '');
}

export function normalizarIsbn(valor) {
  return String(valor ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

// ISBN em branco é aceito (livro antigo sem ISBN); preenchido, precisa fechar o dígito.
export function isbnValido(valor) {
  const isbn = normalizarIsbn(valor);
  if (!isbn) return true;
  if (isbn.length === 10) {
    let soma = 0;
    for (let i = 0; i < 10; i++) {
      const c = isbn[i] === 'X' ? 10 : Number(isbn[i]);
      if (Number.isNaN(c) || (isbn[i] === 'X' && i !== 9)) return false;
      soma += c * (10 - i);
    }
    return soma % 11 === 0;
  }
  if (isbn.length === 13 && !isbn.includes('X')) {
    let soma = 0;
    for (let i = 0; i < 13; i++) soma += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
    return soma % 10 === 0;
  }
  return false;
}

export function textoBusca(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ── Planilha do acervo (uma linha por exemplar) ──
export const COLUNAS_ACERVO = [
  { key: 'titulo', label: 'Título', obrigatoria: true },
  { key: 'autor', label: 'Autor' },
  { key: 'editora', label: 'Editora' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'faixa_etaria', label: 'Faixa etária' },
  { key: 'tombo', label: 'Tombo', obrigatoria: true },
  { key: 'localizacao', label: 'Localização' },
  { key: 'estado', label: 'Estado' },
];

const ESTADO_POR_TEXTO = Object.fromEntries(
  Object.entries(ESTADOS_EXEMPLAR).map(([k, v]) => [textoBusca(v), k]),
);

export async function baixarModeloAcervo() {
  const XLSX = await import('xlsx');
  const cab = COLUNAS_ACERVO.map(c => c.label);
  const exemplo = ['Pequeno Príncipe', 'Antoine de Saint-Exupéry', 'Agir', '9788522008735', 'Fábulas', '6 a 9 anos', 'T0001', 'Estante A2', 'Bom'];
  const ws = XLSX.utils.aoa_to_sheet([cab, exemplo]);
  ws['!cols'] = cab.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Acervo');
  XLSX.writeFile(wb, 'modelo-acervo-biblioteca.xlsx');
}

// linhas: objetos lidos da planilha (cabeçalho = rótulo da coluna). Agrupa
// exemplares do mesmo livro (mesmo ISBN, ou mesmo título e autor sem ISBN).
// Devolve { itens: [{ ...livro, exemplares: [{tombo, localizacao, estado}] }], erros: [{linha, motivo}] }.
export function lerAcervo(linhas, tombosExistentes = new Set()) {
  const porRotulo = Object.fromEntries(COLUNAS_ACERVO.map(c => [textoBusca(c.label), c.key]));
  const itens = new Map();
  const erros = [];
  const tombosVistos = new Set();

  linhas.forEach((bruta, i) => {
    const linha = i + 2;
    const l = {};
    for (const [rotulo, valor] of Object.entries(bruta)) {
      const key = porRotulo[textoBusca(rotulo)];
      if (key) l[key] = String(valor ?? '').trim();
    }
    if (Object.values(l).every(v => !v)) return;

    const titulo = l.titulo || '';
    const tombo = normalizarCodigo(l.tombo);
    if (!titulo) return erros.push({ linha, motivo: 'Título em branco' });
    if (titulo.length > 200) return erros.push({ linha, motivo: 'Título passa de 200 letras' });
    if (!tombo) return erros.push({ linha, motivo: 'Tombo em branco' });
    if (tombo.length > 40) return erros.push({ linha, motivo: 'Tombo passa de 40 caracteres' });
    if (tombosVistos.has(tombo)) return erros.push({ linha, motivo: `Tombo ${tombo} repetido na planilha` });
    if (tombosExistentes.has(tombo)) return erros.push({ linha, motivo: `Tombo ${tombo} já existe no acervo` });
    if (!isbnValido(l.isbn)) return erros.push({ linha, motivo: 'ISBN inválido' });
    const estado = l.estado ? ESTADO_POR_TEXTO[textoBusca(l.estado)] : 'bom';
    if (!estado) return erros.push({ linha, motivo: 'Estado deve ser Bom, Regular, Ruim ou Perdido' });
    tombosVistos.add(tombo);

    const isbn = normalizarIsbn(l.isbn);
    const chave = isbn || `${textoBusca(titulo)}|${textoBusca(l.autor)}`;
    if (!itens.has(chave)) {
      itens.set(chave, {
        titulo,
        autor: l.autor || null,
        editora: l.editora || null,
        isbn: isbn || null,
        categoria: l.categoria || null,
        faixa_etaria: l.faixa_etaria || null,
        exemplares: [],
      });
    }
    itens.get(chave).exemplares.push({ tombo, localizacao: l.localizacao || null, estado });
  });

  return { itens: [...itens.values()], erros };
}
