// Captação (módulo `captacao`, PLANO_EXPANSAO_GESTAO.md item 11). Regras puras de etapa,
// funil e contato. O banco é quem barra de verdade (RLS, gatilhos de etapa e de fila).
import { publicAppUrl } from './publicUrl';

export const ETAPAS = [
  { id: 'novo', label: 'Novo' },
  { id: 'contato', label: 'Em contato' },
  { id: 'visita_agendada', label: 'Visita agendada' },
  { id: 'visitou', label: 'Visitou' },
  { id: 'proposta', label: 'Proposta' },
  { id: 'matriculado', label: 'Matriculado' },
  { id: 'perdido', label: 'Perdido' },
];

// Quadro: as etapas em andamento; Matriculado e Perdido têm tratamento próprio.
export const ETAPAS_ABERTAS = ETAPAS.filter(e => e.id !== 'matriculado' && e.id !== 'perdido');
export const rotuloEtapa = (id) => ETAPAS.find(e => e.id === id)?.label || id;

export const ORIGENS = [
  { id: 'site', label: 'Site ou formulário' },
  { id: 'indicacao', label: 'Indicação' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'google', label: 'Google' },
  { id: 'visita', label: 'Visita espontânea' },
  { id: 'outro', label: 'Outro' },
];
export const rotuloOrigem = (id) => ORIGENS.find(o => o.id === id)?.label || id;

export const TIPOS_INTERACAO = [
  { id: 'ligacao', label: 'Ligação' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'E-mail' },
  { id: 'visita', label: 'Visita' },
  { id: 'nota', label: 'Anotação' },
];
export const rotuloInteracao = (id) => TIPOS_INTERACAO.find(t => t.id === id)?.label || id;

export const STATUS_VISITA = [
  { id: 'agendada', label: 'Agendada' },
  { id: 'realizada', label: 'Realizada' },
  { id: 'faltou', label: 'Não compareceu' },
  { id: 'cancelada', label: 'Cancelada' },
];
export const rotuloVisita = (id) => STATUS_VISITA.find(s => s.id === id)?.label || id;

export const STATUS_FILA = [
  { id: 'aguardando', label: 'Aguardando' },
  { id: 'chamada', label: 'Chamada' },
  { id: 'matriculada', label: 'Matriculada' },
  { id: 'desistiu', label: 'Desistiu' },
];
export const rotuloFila = (id) => STATUS_FILA.find(s => s.id === id)?.label || id;

// Link do formulário público que a escola divulga. `origem` só marca de onde veio.
export function linkFormulario(schoolCode, origem) {
  const q = new URLSearchParams({ codigo: schoolCode });
  if (origem && origem !== 'site') q.set('origem', origem);
  return publicAppUrl(`/quero-conhecer?${q.toString()}`);
}

// Só dígitos, com 55 na frente quando vier sem código do país. Sem número válido, null.
export function linkWhatsapp(telefone) {
  const d = String(telefone || '').replace(/\D/g, '');
  if (d.length < 10 || d.length > 13) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

export function textoBusca(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Lead que já acabou (matriculado ou perdido) não entra em "precisa de atenção".
export const leadAberto = (l) => l.etapa !== 'matriculado' && l.etapa !== 'perdido';

// Dias desde o último contato; sem contato registrado, desde que o lead chegou.
export function diasSemContato(lead, ultimaInteracao, agora = Date.now()) {
  const base = ultimaInteracao || lead.created_at;
  const t = new Date(base).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 86400000));
}

// Resumo do funil a partir das linhas { origem, etapa, total } da RPC captacao_funil.
// "Chegaram" é todo lead do período; conversão = matriculados / chegaram.
export function resumirFunil(linhas) {
  const porEtapa = Object.fromEntries(ETAPAS.map(e => [e.id, 0]));
  const porOrigem = {};
  let total = 0;
  for (const l of linhas || []) {
    const n = Number(l.total) || 0;
    total += n;
    porEtapa[l.etapa] = (porEtapa[l.etapa] || 0) + n;
    const o = (porOrigem[l.origem] ||= { origem: l.origem, total: 0, matriculados: 0 });
    o.total += n;
    if (l.etapa === 'matriculado') o.matriculados += n;
  }
  const conversao = (n, d) => (d > 0 ? Math.round((1000 * n) / d) / 10 : null);
  // Etapas a partir das quais o lead "chegou ao menos até aqui" (Perdido não conta como avanço).
  const ordem = ['novo', 'contato', 'visita_agendada', 'visitou', 'proposta', 'matriculado'];
  const alcancou = ordem.map((id, i) => ({
    id,
    label: rotuloEtapa(id),
    total: ordem.slice(i).reduce((s, x) => s + (porEtapa[x] || 0), 0),
  }));
  return {
    total,
    porEtapa,
    alcancou,
    perdidos: porEtapa.perdido || 0,
    matriculados: porEtapa.matriculado || 0,
    conversao: conversao(porEtapa.matriculado || 0, total),
    porOrigem: Object.values(porOrigem)
      .map(o => ({ ...o, conversao: conversao(o.matriculados, o.total) }))
      .sort((a, b) => b.total - a.total),
  };
}

// Posição de cada pessoa na fila por turma, só entre quem ainda aguarda.
export function filaPorTurma(entradas) {
  const turmas = {};
  for (const e of entradas || []) (turmas[e.turma] ||= []).push(e);
  return Object.entries(turmas)
    .map(([turma, itens]) => {
      const ordenados = [...itens].sort((a, b) => a.posicao - b.posicao);
      let n = 0;
      return {
        turma,
        aguardando: ordenados.filter(i => i.status === 'aguardando').length,
        itens: ordenados.map(i => ({ ...i, lugar: i.status === 'aguardando' ? ++n : null })),
      };
    })
    .sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR', { numeric: true }));
}
