import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, GraduationCap, ChevronRight, ChevronDown, ArrowLeft, ArrowRight, Plus, RefreshCw, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import { buildPainelAlunos, DOCUMENTOS_OBRIGATORIOS, SEM_TURMA } from '../lib/alunosPainel';
import { Loading, Notice, SecondaryButton, PrimaryButton, Modal } from './GestaoShared';
import { sugestoesDaEscola, formatIdade, idadeEmMeses } from '../lib/sugestaoTurma';
import { recursosDoPerfil } from '../lib/perfisGestao';

const PAGE_SIZE = 30;

const ENROLLMENT_STATUS_LABELS = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  transferido: 'Transferido',
  cancelado: 'Cancelado',
};

const ENROLLMENT_STATUS_STYLES = {
  ativo: 'bg-green-50 text-green-700 border-green-200',
  inativo: 'bg-slate-100 text-slate-600 border-slate-200',
  transferido: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelado: 'bg-red-50 text-red-600 border-red-200',
};

const SAIDA_LABEL = { transferido: 'transferido', inativo: 'inativo', cancelado: 'cancelado' };

// Cores da atenção (mesmas da tela de Pendências).
const TONE = {
  bad: { chip: 'bg-red-50 text-error', num: 'bg-error text-white', text: 'text-error font-bold', dot: 'bg-error' },
  warn: { chip: 'bg-amber-50 text-amber-800', num: 'bg-amber-100 text-amber-800', text: 'text-amber-800', dot: 'bg-warning' },
};

const DOCS_TEXTO = DOCUMENTOS_OBRIGATORIOS.map(d => d.label).join(', ').replace(/, ([^,]*)$/, ' e $1');

// Textos do botão "i" de cada cartão: o que o cartão mostra e de onde vem o
// número. Linguagem de quem usa a secretaria, sem termos técnicos.
const AJUDA = {
  ativos: {
    title: 'Alunos ativos',
    paragraphs: [
      'Quantos alunos estão hoje com a matrícula na situação Ativo.',
      'Não entram os alunos transferidos, inativos ou cancelados. Embaixo aparece em quantas turmas esses alunos estão.',
      'Toque no cartão para ver a lista desses alunos.',
    ],
  },
  atencao: {
    title: 'Precisam de atenção',
    paragraphs: [
      'Alunos ativos com pelo menos uma destas situações:',
      ['falta algum documento obrigatório na pasta do aluno (' + DOCS_TEXTO + ');', 'a família ainda não preencheu a ficha médica;', 'existe cobrança vencida e ainda não paga.'],
      'Cada aluno conta uma vez só, mesmo que tenha mais de um motivo. Toque no cartão para ver quem são.',
    ],
  },
  entradas: {
    title: 'Entradas no ano',
    paragraphs: [
      'Alunos matriculados depois da abertura do ano letivo atual.',
      'Quem já estudava na escola quando o ano foi aberto não conta como entrada.',
    ],
  },
  saidas: {
    title: 'Saídas no ano',
    paragraphs: [
      'Alunos que faziam parte do ano letivo atual e hoje estão transferidos, inativos ou cancelados.',
      'A data mostrada é a da transferência para outra escola. Quando não houve transferência, é a data da última mudança na matrícula.',
    ],
  },
};

// Tira dos textos de ajuda as frases sobre cobrança (Coordenação e Direção).
function semCobranca(ajuda) {
  const limpa = (t) => !/cobran/i.test(t);
  return {
    ...ajuda,
    paragraphs: ajuda.paragraphs
      .map(p => (Array.isArray(p) ? p.filter(limpa) : p))
      .filter(p => (Array.isArray(p) ? p.length > 0 : limpa(p))),
  };
}

function BotaoAjuda({ onClick, label }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label={`O que é ${label}?`}
      title="O que é isto?"
      className="w-7 h-7 -m-1 rounded-full flex items-center justify-center text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 shrink-0"
    >
      <Info size={15} />
    </button>
  );
}

function ModalAjuda({ ajuda, onClose }) {
  return (
    <Modal title={ajuda.title} onClose={onClose}>
      {ajuda.paragraphs.map((p, i) => (Array.isArray(p) ? (
        <ul key={i} className="list-disc pl-5 space-y-1 text-sm text-on-surface">
          {p.map(item => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p key={i} className="text-sm text-on-surface">{p}</p>
      )))}
    </Modal>
  );
}

// PostgREST devolve no máximo 1000 linhas por vez.
async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function loadPainelData(schoolId, { comFinanceiro = true } = {}) {
  const [students, documentos, fichas, overdueCharges, { data: anoLetivo, error: anoError }] = await Promise.all([
    selectAll(() => supabase.from('students').select('id, name, turma, turno, birth_date, enrollment_status').eq('school_id', schoolId).order('id')),
    selectAll(() => supabase.from('student_documents').select('student_id, category').eq('school_id', schoolId).in('category', DOCUMENTOS_OBRIGATORIOS.map(d => d.key)).order('id')),
    selectAll(() => supabase.from('fichas_medicas').select('student_id').eq('school_id', schoolId).order('student_id')),
    comFinanceiro
      ? selectAll(() => supabase.from('financial_charges').select('student_id, amount_cents').eq('school_id', schoolId).eq('status', 'OVERDUE').order('id'))
      : Promise.resolve([]),
    supabase.from('school_years').select('id, created_at, starts_on').eq('school_id', schoolId).eq('status', 'aberto').maybeSingle(),
  ]);
  if (anoError) throw anoError;
  let enrollments = [];
  let saidasExternas = [];
  if (anoLetivo) {
    [enrollments, saidasExternas] = await Promise.all([
      selectAll(() => supabase.from('enrollments').select('student_id, created_at, updated_at').eq('school_year_id', anoLetivo.id).order('id')),
      selectAll(() => supabase.from('student_transfers').select('student_id, transferred_at').eq('school_id', schoolId).eq('transfer_type', 'saida_externa').gte('transferred_at', anoLetivo.starts_on).order('id')),
    ]);
  }
  return { students, documentos, fichaStudentIds: fichas.map(f => f.student_id), overdueCharges, anoLetivo, enrollments, saidasExternas };
}

// O "i" fica fora do botão do cartão (botão dentro de botão não é permitido).
function Kpi({ label, value, hint, valueClass = 'text-on-surface', onClick, onAjuda }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <div className="relative min-w-0">
      <Tag onClick={onClick} className={`w-full h-full text-left bg-surface-container-lowest border border-outline-variant rounded-zela-lg px-3 py-2.5 md:px-4 md:py-3.5 flex flex-col gap-0.5 min-w-0 ${onClick ? 'hover:border-primary/40 transition' : ''}`}>
        <span className="pr-6 text-[10px] md:text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">{label}</span>
        <span className={`text-lg md:text-2xl font-black tabular-nums truncate ${valueClass}`}>{value}</span>
        {hint && <span className="hidden md:block text-xs text-on-surface-variant truncate">{hint}</span>}
      </Tag>
      <div className="absolute top-2.5 right-2.5 md:top-3 md:right-3"><BotaoAjuda onClick={onAjuda} label={label} /></div>
    </div>
  );
}

function VerMais({ children, onClick }) {
  return (
    <button onClick={onClick} className="mt-auto self-start flex items-center gap-1.5 min-h-[40px] text-sm font-bold text-primary hover:underline">
      {children} <ArrowRight size={15} />
    </button>
  );
}

function LinhaAluno({ linha, onOpen }) {
  return (
    <button onClick={() => onOpen(linha.id)} className="w-full flex justify-between gap-3 py-2 border-t border-outline-variant/50 text-left text-[13px] hover:text-primary">
      <span className="truncate text-on-surface">{linha.name}</span>
      <span className={`whitespace-nowrap ${linha.tone ? TONE[linha.tone].text : 'text-on-surface-variant'}`}>{linha.resumo}</span>
    </button>
  );
}

function ChipAtencao({ turma }) {
  if (!turma.atencao.length) {
    return <span className="self-start text-[11px] font-bold rounded-full px-2.5 py-1 bg-emerald-50 text-emerald-800">Todos em dia</span>;
  }
  return (
    <span className={`self-start text-[11px] font-bold rounded-full px-2.5 py-1 ${TONE[turma.tone].chip}`}>
      {turma.atencao.length} {turma.atencao.length === 1 ? 'precisa' : 'precisam'} de atenção
    </span>
  );
}

function Proporcao({ turma }) {
  const pct = turma.total ? Math.round((turma.emDia / turma.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 rounded-full bg-surface-container-high overflow-hidden" role="img" aria-label={`${turma.emDia} de ${turma.total} em dia`}>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-on-surface-variant tabular-nums">
        {turma.emDia} de {turma.total} em dia · {turma.turnos.map(t => `${t.turno} ${t.total}`).join(' · ')}
      </p>
    </div>
  );
}

function CartaoTurma({ turma, onOpen, onVerTurma }) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <h3 className="flex-1 min-w-0 truncate text-base font-black text-on-surface">{turma.nome}</h3>
        <span className="text-xs text-on-surface-variant tabular-nums"><strong className="text-on-surface">{turma.total}</strong> {turma.total === 1 ? 'aluno' : 'alunos'}</span>
      </div>
      <Proporcao turma={turma} />
      <ChipAtencao turma={turma} />
      <div className="hidden lg:block">
        {turma.destaque.map(l => <LinhaAluno key={l.id} linha={l} onOpen={onOpen} />)}
      </div>
      <VerMais onClick={() => onVerTurma(turma.nome)}>Ver {turma.total === 1 ? 'o aluno' : `os ${turma.total} alunos`}</VerMais>
    </section>
  );
}

// Protótipo (28/09/2026): quem pode estar na hora de mudar de turma, só pela
// idade (regras em src/lib/sugestaoTurma.js). "Mudar" abre o perfil na
// Matrícula com a nova turma já escolhida; a escola confirma.
function CartaoSugestoes({ sugestoes, onMudar, onOpen }) {
  const [verTodas, setVerTodas] = useState(false);
  const visiveis = verTodas ? sugestoes : sugestoes.slice(0, 4);
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-col gap-3 md:col-span-2 xl:col-span-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <Sparkles size={17} className="text-primary shrink-0" />
        <h3 className="text-base font-black text-on-surface">Hora de mudar de turma?</h3>
        <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-surface-container-low text-on-surface-variant">Prévia</span>
      </div>
      <p className="text-xs text-on-surface-variant">
        Sugestão feita só pela idade: compara cada criança com a idade das crianças de cada turma. Em breve vai considerar também os relatórios e o desenvolvimento. A decisão é sempre da escola.
      </p>
      {sugestoes.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-on-surface-variant"><CheckCircle2 size={16} className="text-emerald-700" /> Nenhuma criança com idade fora da turma agora.</p>
      ) : (
        <div className="flex flex-col">
          {visiveis.map(sg => (
            <div key={sg.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2.5 border-t border-outline-variant/50">
              <button onClick={() => onOpen(sg.id)} className="flex-1 min-w-0 text-left hover:text-primary">
                <span className="block text-sm font-bold text-on-surface truncate">{sg.name}</span>
                <span className="block text-xs text-on-surface-variant">
                  {formatIdade(sg.idadeMeses)} · {sg.tipo === 'evoluir'
                    ? `${sg.turmaAtual} → ${sg.turma}`
                    : `bem mais nova que ${sg.turmaAtual}; confira a data de nascimento`}
                </span>
              </button>
              {sg.tipo === 'evoluir' ? (
                <button onClick={() => onMudar(sg)} className="self-start sm:self-auto min-h-[40px] text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-zela-md transition whitespace-nowrap">
                  Mudar de turma
                </button>
              ) : (
                <button onClick={() => onOpen(sg.id)} className="self-start sm:self-auto min-h-[40px] text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-zela-md transition whitespace-nowrap">
                  Conferir cadastro
                </button>
              )}
            </div>
          ))}
          {sugestoes.length > 4 && (
            <button onClick={() => setVerTodas(v => !v)} className="self-start mt-1 min-h-[40px] text-sm font-bold text-primary hover:underline">
              {verTodas ? 'Mostrar menos' : `Ver todas (${sugestoes.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// Celular: cada turma é uma sanfona com quem precisa de atenção por cima.
function SanfonaTurma({ turma, open, onToggle, onOpen, onVerTurma }) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg">
      <button onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[60px] text-left">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-black text-on-surface truncate">{turma.nome}</span>
          <span className="block text-xs text-on-surface-variant tabular-nums">{turma.total} {turma.total === 1 ? 'aluno' : 'alunos'} · {turma.emDia} em dia</span>
        </span>
        {turma.atencao.length > 0 && (
          <span className={`min-w-[26px] h-[26px] px-2 rounded-full text-xs font-black flex items-center justify-center ${TONE[turma.tone].num}`}>{turma.atencao.length}</span>
        )}
        <ChevronDown size={20} className={`text-on-surface-variant shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
          <p className="text-xs text-on-surface-variant">{turma.turnos.map(t => `${t.turno} ${t.total}`).join(' · ')}</p>
          <div>{turma.destaque.map(l => <LinhaAluno key={l.id} linha={l} onOpen={onOpen} />)}</div>
          <button onClick={() => onVerTurma(turma.nome)} className="w-full min-h-[44px] rounded-zela-md bg-primary text-white text-sm font-bold">
            Ver {turma.total === 1 ? 'o aluno' : `os ${turma.total} alunos`}
          </button>
        </div>
      )}
    </section>
  );
}

// Secretaria · Alunos · Modelo 2 (Painel por turma, aprovado em 28/09/2026).
// O painel mostra cada turma e quem precisa de atenção (documentos
// obrigatórios, ficha médica, cobranças em atraso; regras em
// src/lib/alunosPainel.js). "Ver os N alunos" abre a lista já filtrada;
// clicar num aluno abre o perfil unificado (GestaoAlunoPerfil.jsx).
// isVisible: o portal mantém esta tela montada (escondida) enquanto o perfil
// está aberto, para voltar no mesmo ponto; ao reaparecer, recarrega os números.
export default function GestaoAlunos({ currentUser, onOpenAluno, onNovaMatricula, isVisible = true }) {
  // Coordenação e Direção (29/09/2026): o painel não considera cobrança.
  const comFinanceiro = recursosDoPerfil(currentUser?.role).financeiro;
  const schoolId = currentUser?.school_id;
  const { turmas: schoolTurmas } = useSchoolConfig(schoolId);

  const [view, setView] = useState('painel');
  const [painelData, setPainelData] = useState(null);
  const [painelError, setPainelError] = useState('');
  const [isLoadingPainel, setIsLoadingPainel] = useState(true);
  const [openTurma, setOpenTurma] = useState(null);
  const [ajuda, setAjuda] = useState(null);

  const loadPainel = useCallback(async () => {
    if (!schoolId) return;
    setIsLoadingPainel(true);
    try {
      setPainelData(await loadPainelData(schoolId, { comFinanceiro }));
      setPainelError('');
    } catch (err) {
      console.error('[GestaoAlunos] Erro ao carregar o painel:', err);
      setPainelError('Não foi possível carregar o painel de alunos.');
    } finally {
      setIsLoadingPainel(false);
    }
  }, [schoolId]);

  useEffect(() => { loadPainel(); }, [loadPainel]);

  const wasVisible = useRef(isVisible);
  useEffect(() => {
    if (isVisible && !wasVisible.current) loadPainel();
    wasVisible.current = isVisible;
  }, [isVisible, loadPainel]);

  const painel = useMemo(
    () => (painelData ? buildPainelAlunos({ ...painelData, turmasConfig: schoolTurmas }) : null),
    [painelData, schoolTurmas],
  );

  const sugestoes = useMemo(() => (painelData ? sugestoesDaEscola(painelData.students) : []), [painelData]);
  const mudarDeTurma = (sg) => onOpenAluno(sg.id, { tab: 'matricula', moveTo: sg.turma });

  // Linha de atenção por aluno, para o ponto colorido da lista.
  const atencaoPorAluno = useMemo(() => {
    const m = new Map();
    for (const t of painel?.turmas || []) for (const l of t.atencao) m.set(l.id, l);
    return m;
  }, [painel]);

  // Celular: abre de início a primeira turma com alguém precisando de atenção.
  useEffect(() => {
    if (painel && openTurma === null) setOpenTurma((painel.turmas.find(t => t.atencao.length) || painel.turmas[0])?.nome || '');
  }, [painel, openTurma]);

  // ---------- Lista ----------
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('todas');
  const [selectedStatus, setSelectedStatus] = useState('todos');
  const [somenteAtencao, setSomenteAtencao] = useState(false);
  const searchRef = useRef(null);

  const turmaOptions = useMemo(() => {
    const nomes = new Set(schoolTurmas);
    for (const t of painel?.turmas || []) if (t.nome !== SEM_TURMA) nomes.add(t.nome);
    return [...nomes];
  }, [schoolTurmas, painel]);

  const atencaoIds = painel?.atencaoIds;
  const fetchPage = useCallback(async (offset, { append } = { append: false }) => {
    if (!schoolId) return;
    if (somenteAtencao && !atencaoIds) return;
    if (append) setIsLoadingMore(true); else setIsLoading(true);
    try {
      if (somenteAtencao && atencaoIds.length === 0) {
        setStudents([]);
        setHasMore(false);
        return;
      }
      let query = supabase
        .from('students')
        .select('id, name, turma, turno, birth_date, enrollment_status, family_id, users:family_id(name)')
        .eq('school_id', schoolId)
        .order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (selectedTurma === SEM_TURMA) query = query.is('turma', null);
      else if (selectedTurma !== 'todas') query = query.eq('turma', selectedTurma);
      if (selectedStatus === 'saidas') query = query.neq('enrollment_status', 'ativo');
      else if (selectedStatus !== 'todos') query = query.eq('enrollment_status', selectedStatus);
      if (somenteAtencao) query = query.in('id', atencaoIds);
      if (searchTerm.trim()) query = query.ilike('name', `%${searchTerm.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;

      setStudents(prev => (append ? [...prev, ...(data || [])] : (data || [])));
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err) {
      console.error('[GestaoAlunos] Erro ao buscar alunos:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [schoolId, selectedTurma, selectedStatus, somenteAtencao, atencaoIds, searchTerm]);

  useEffect(() => {
    if (view !== 'lista') return undefined;
    const timeout = setTimeout(() => fetchPage(0), searchTerm ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [view, fetchPage, searchTerm]);

  const abrirLista = ({ turma = 'todas', status = 'todos', atencao = false, focarBusca = false } = {}) => {
    setSelectedTurma(turma);
    setSelectedStatus(status);
    setSomenteAtencao(atencao);
    setSearchTerm('');
    setView('lista');
    if (focarBusca) setTimeout(() => searchRef.current?.focus(), 0);
  };

  if (view === 'lista') {
    return (
      <div className="h-full flex flex-col bg-surface overflow-hidden">
        <div className="flex flex-col gap-3 px-4 md:px-6 pt-4 md:pt-5 pb-3 border-b border-outline-variant shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button onClick={() => setView('painel')} className="self-start flex items-center gap-1.5 min-h-[40px] text-sm font-bold text-primary hover:underline shrink-0">
              <ArrowLeft size={16} /> Painel por turma
            </button>
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome..."
                aria-label="Buscar aluno por nome"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTurma}
              onChange={e => setSelectedTurma(e.target.value)}
              aria-label="Turma"
              className="text-sm border border-outline-variant rounded-zela-md px-3 py-2 bg-white"
            >
              <option value="todas">Todas as turmas</option>
              {turmaOptions.map(t => <option key={t} value={t}>{t}</option>)}
              {painel?.turmas.some(t => t.nome === SEM_TURMA) && <option value={SEM_TURMA}>{SEM_TURMA}</option>}
            </select>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              aria-label="Situação"
              className="text-sm border border-outline-variant rounded-zela-md px-3 py-2 bg-white"
            >
              <option value="todos">Todas as situações</option>
              {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
              <option value="saidas">Saíram da escola</option>
            </select>
            <label className="flex items-center gap-2 text-sm font-semibold text-on-surface min-h-[40px] px-1 cursor-pointer">
              <input type="checkbox" checked={somenteAtencao} onChange={e => setSomenteAtencao(e.target.checked)} className="w-4 h-4 accent-primary" />
              Só quem precisa de atenção
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isLoading ? (
            <Loading />
          ) : students.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant/70">
              <GraduationCap className="mx-auto h-12 w-12 text-outline-variant mb-3" />
              <p className="text-sm font-semibold text-on-surface-variant">Nenhum aluno encontrado.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {students.map(student => {
                const atencao = atencaoPorAluno.get(student.id);
                return (
                  <button
                    key={student.id}
                    onClick={() => onOpenAluno(student.id)}
                    className="w-full flex items-center gap-3 p-3.5 bg-white border border-outline-variant hover:border-primary/40 hover:bg-primary/5 rounded-zela-lg transition text-left"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${atencao ? TONE[atencao.tone].dot : 'bg-transparent'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-on-surface text-sm truncate">
                        {student.name}
                        <span className="font-normal text-on-surface-variant/70 text-xs"> · {student.birth_date ? formatIdade(idadeEmMeses(student.birth_date)) : 'idade não informada'}</span>
                      </p>
                      <p className="text-on-surface-variant/70 text-xs truncate">
                        {student.turma || SEM_TURMA}{student.turno ? ` · ${student.turno}` : ''} · Responsável: {student.users?.name || '·'}
                      </p>
                      {atencao && <p className={`text-xs truncate ${TONE[atencao.tone].text}`}>{atencao.resumo.charAt(0).toUpperCase() + atencao.resumo.slice(1)}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${ENROLLMENT_STATUS_STYLES[student.enrollment_status] || ENROLLMENT_STATUS_STYLES.ativo}`}>
                      {ENROLLMENT_STATUS_LABELS[student.enrollment_status] || student.enrollment_status}
                    </span>
                    <ChevronRight size={16} className="text-on-surface-variant/50 shrink-0" />
                  </button>
                );
              })}
              {hasMore && (
                <button
                  onClick={() => fetchPage(students.length, { append: true })}
                  disabled={isLoadingMore}
                  className="mt-2 text-sm font-bold text-primary hover:bg-primary/5 py-2.5 rounded-zela-md transition disabled:opacity-60"
                >
                  {isLoadingMore ? 'Carregando...' : 'Carregar mais'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Painel por turma ----------
  const k = painel?.kpis;
  const porTipo = painel?.atencaoPorTipo;
  const saidasHint = painel && Object.entries(painel.saidasPorStatus).map(([s, n]) => `${n} ${SAIDA_LABEL[s] || s}${n > 1 ? 's' : ''}`).join(' · ');

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 pt-4 md:pt-5 pb-3 border-b border-outline-variant shrink-0">
        <p className="hidden sm:block text-small text-on-surface-variant">Os alunos da escola, organizados por turma.</p>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SecondaryButton onClick={() => abrirLista({ focarBusca: true })} className="flex-1 sm:flex-none justify-center min-h-[40px]"><Search size={15} /> Buscar aluno</SecondaryButton>
          {onNovaMatricula && <PrimaryButton onClick={onNovaMatricula} className="flex-1 sm:flex-none justify-center min-h-[40px]"><Plus size={15} /> Nova matrícula</PrimaryButton>}
          <button onClick={loadPainel} aria-label="Atualizar" className="p-2.5 rounded-zela-md text-on-surface-variant hover:bg-surface-container-low shrink-0">
            <RefreshCw size={16} className={isLoadingPainel ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6">
        <Notice>{painelError}</Notice>
        {isLoadingPainel && !painel ? <Loading /> : painel && (
          <div className="flex flex-col gap-4 md:gap-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
              <Kpi label="Alunos ativos" value={k.ativos} hint={`em ${k.turmas} ${k.turmas === 1 ? 'turma' : 'turmas'}`} onClick={() => abrirLista({ status: 'ativo' })} onAjuda={() => setAjuda('ativos')} />
              <Kpi
                label="Precisam de atenção"
                value={k.atencao}
                valueClass={k.atencao ? 'text-amber-800' : 'text-on-surface'}
                hint={comFinanceiro ? 'documentos, ficha médica e financeiro' : 'documentos e ficha médica'}
                onClick={() => abrirLista({ status: 'ativo', atencao: true })}
                onAjuda={() => setAjuda('atencao')}
              />
              <Kpi label="Entradas no ano" value={k.entradas} valueClass={k.entradas ? 'text-emerald-800' : 'text-on-surface'} hint="matrículas novas no ano letivo" onAjuda={() => setAjuda('entradas')} />
              <Kpi label="Saídas no ano" value={k.saidas} hint={saidasHint || 'ninguém saiu neste ano letivo'} onClick={k.saidas ? () => abrirLista({ status: 'saidas' }) : undefined} onAjuda={() => setAjuda('saidas')} />
            </div>

            {painel.turmas.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16">
                <GraduationCap size={36} className="text-outline-variant mb-2" />
                <p className="font-bold text-on-surface">Nenhum aluno ativo ainda.</p>
              </div>
            ) : (
              <>
                {/* Celular: sanfona por turma */}
                <div className="md:hidden flex flex-col gap-2.5">
                  {painel.turmas.map(t => (
                    <SanfonaTurma
                      key={t.nome}
                      turma={t}
                      open={openTurma === t.nome}
                      onToggle={() => setOpenTurma(openTurma === t.nome ? '' : t.nome)}
                      onOpen={onOpenAluno}
                      onVerTurma={nome => abrirLista({ turma: nome })}
                    />
                  ))}
                  <CartaoSugestoes sugestoes={sugestoes} onMudar={mudarDeTurma} onOpen={onOpenAluno} />
                </div>

                {/* Tablet e computador: cartões */}
                <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
                  {painel.turmas.map(t => (
                    <CartaoTurma key={t.nome} turma={t} onOpen={onOpenAluno} onVerTurma={nome => abrirLista({ turma: nome })} />
                  ))}

                  <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      <h3 className="flex-1 text-base font-black text-on-surface">Precisam de atenção</h3>
                      <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${k.atencao ? TONE.warn.chip : 'bg-emerald-50 text-emerald-800'}`}>{k.atencao}</span>
                    </div>
                    {k.atencao === 0 ? (
                      <p className="flex items-center gap-2 text-sm text-on-surface-variant"><CheckCircle2 size={16} className="text-emerald-700" /> Todos os alunos ativos estão em dia.</p>
                    ) : (
                      <div>
                        {[['Documentos faltando', porTipo.documentos], ['Sem ficha médica', porTipo.ficha], ...(comFinanceiro ? [['Cobranças em atraso', porTipo.financeiro]] : [])].map(([label, n]) => (
                          <div key={label} className="flex justify-between gap-3 py-2 border-t border-outline-variant/50 text-[13px]">
                            <span className="text-on-surface">{label}</span>
                            <span className="text-on-surface-variant tabular-nums">{n}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {k.atencao > 0 && <VerMais onClick={() => abrirLista({ status: 'ativo', atencao: true })}>Ver a lista</VerMais>}
                  </section>

                  <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      <h3 className="flex-1 text-base font-black text-on-surface">Saídas no ano</h3>
                      <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-surface-container-low text-on-surface-variant">{k.saidas}</span>
                    </div>
                    {painel.saidas.length === 0 ? (
                      <p className="text-sm text-on-surface-variant">Ninguém saiu neste ano letivo.</p>
                    ) : (
                      <div>
                        {painel.saidas.slice(0, 3).map(s => (
                          <button key={s.id} onClick={() => onOpenAluno(s.id)} className="w-full flex justify-between gap-3 py-2 border-t border-outline-variant/50 text-left text-[13px] hover:text-primary">
                            <span className="truncate text-on-surface">{s.name}</span>
                            <span className="whitespace-nowrap text-on-surface-variant">{SAIDA_LABEL[s.status] || s.status} em {new Date(s.em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                          </button>
                        ))}
                        {painel.saidas.length > 3 && <p className="py-2 border-t border-outline-variant/50 text-[13px] text-on-surface-variant">e mais {painel.saidas.length - 3}</p>}
                      </div>
                    )}
                    <VerMais onClick={() => abrirLista({ status: 'saidas' })}>Ver quem saiu</VerMais>
                  </section>

                  <CartaoSugestoes sugestoes={sugestoes} onMudar={mudarDeTurma} onOpen={onOpenAluno} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {ajuda && <ModalAjuda ajuda={comFinanceiro ? AJUDA[ajuda] : semCobranca(AJUDA[ajuda])} onClose={() => setAjuda(null)} />}
    </div>
  );
}
