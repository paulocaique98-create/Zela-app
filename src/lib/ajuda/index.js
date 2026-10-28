import { AJUDA_ADMIN } from './admin';
import { AJUDA_GESTAO } from './gestao';
import { AJUDA_PROFESSOR } from './professor';
import { AJUDA_FAMILIA } from './familia';

export const AJUDA_POR_PERFIL = {
  admin: AJUDA_ADMIN,
  gestao: AJUDA_GESTAO,
  professor: AJUDA_PROFESSOR,
  familia: AJUDA_FAMILIA,
};

export const TITULO_DO_PERFIL = {
  admin: 'Recepção',
  gestao: 'Gestão',
  professor: 'Professor',
  familia: 'Família',
};

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const NOME_DO_METODO = {
  tradicional: 'Tradicional',
  montessori: 'Montessori',
  personalizado: 'Personalizado',
};

// Conteúdo sem `metodos` vale para todas as escolas. Com `metodos`, só aparece
// no método da escola. Sem método conhecido (carregando ou falha de leitura)
// mostra só o que é comum, para nunca misturar Tradicional com Montessori.
export function visivelNoMetodo(entidade, method) {
  if (!entidade.metodos) return true;
  return !!method && entidade.metodos.includes(method);
}

// Seções do perfil que a escola enxerga, no método dela.
export function secoesDoMetodo(secoes, method) {
  return (secoes || [])
    .filter((s) => visivelNoMetodo(s, method))
    .map((s) => ({ ...s, itens: s.itens.filter((it) => visivelNoMetodo(it, method)) }))
    .filter((s) => s.itens.length > 0);
}

// Filtra por texto (título, para que serve, passos) e por seção.
// Devolve só seções com ao menos um item que combina.
export function filtrarAjuda(secoes, texto = '', secaoId = 'todas', method = null) {
  const q = semAcento(texto).trim();
  return secoesDoMetodo(secoes, method)
    .filter((s) => secaoId === 'todas' || s.id === secaoId)
    .map((s) => ({
      ...s,
      itens: s.itens.filter((it) => {
        if (!q) return true;
        const alvo = semAcento([it.titulo, it.serve, ...(it.faz || []), it.dica].join(' '));
        return alvo.includes(q);
      }),
    }))
    .filter((s) => s.itens.length > 0);
}
