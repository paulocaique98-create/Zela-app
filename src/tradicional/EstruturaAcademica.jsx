import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from '../components/ConfirmModal';
import { PageShell } from '../components/GestaoShared';
import {
  listar, inserir, atualizar, remover, listarProfessores, mensagemDeErro, professorOcupado,
  horarioSobreposto, ordemRepetida, ordemLivreParaIntervalo,
  SEGMENTOS_PADRAO, SERIES_FUNDAMENTAL_I, DISCIPLINAS_FUNDAMENTAL_I, TURNOS, DIAS_SEMANA,
} from './lib/estrutura';

const ABAS = [
  { id: 'series', label: '1. Séries' },
  { id: 'turmas', label: '2. Turmas' },
  { id: 'disciplinas', label: '3. Disciplinas' },
  { id: 'grade', label: '4. Grade curricular' },
  { id: 'professores', label: '5. Professores' },
  { id: 'horarios', label: '6. Horários' },
];

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const botao = 'flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60';
const botaoLixo = 'p-2 text-on-surface-variant/70 hover:text-error hover:bg-error/10 rounded-zela-md transition shrink-0';

// Fase 1 do Método Tradicional: séries, turmas, disciplinas, grade,
// professores por turma e quadro de horários. Tudo em tabelas trad_*.
export default function EstruturaAcademica({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [aba, setAba] = useState('series');
  const [dados, setDados] = useState({ segmentos: [], series: [], turmas: [], disciplinas: [], grade: [], atribuicoes: [], horarios: [] });
  const [anos, setAnos] = useState([]);
  const [professores, setProfessores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [apagar, setApagar] = useState(null); // { tabela, id, texto }

  const carregar = useCallback(async () => {
    if (!schoolId) return;
    // Só a primeira carga mostra o carregando: recarregar depois de salvar não pode
    // desmontar a aba, senão a turma e os campos escolhidos voltam ao padrão.
    try {
      const [segmentos, series, turmas, disciplinas, grade, atribuicoes, horarios, profs, anosRes] = await Promise.all([
        listar('trad_segmentos', schoolId, { ordenarPor: 'ordem' }),
        listar('trad_series', schoolId, { ordenarPor: 'ordem' }),
        listar('trad_turmas', schoolId, { ordenarPor: 'nome' }),
        listar('trad_disciplinas', schoolId, { ordenarPor: 'nome' }),
        listar('trad_grade', schoolId),
        listar('trad_atribuicoes', schoolId),
        listar('trad_horarios', schoolId),
        listarProfessores(schoolId),
        supabase.from('school_years').select('id, name, status').eq('school_id', schoolId)
          .order('starts_on', { ascending: false }).limit(10),
      ]);
      setDados({ segmentos, series, turmas, disciplinas, grade, atribuicoes, horarios });
      setProfessores(profs);
      setAnos(anosRes.data || []);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [schoolId]);

  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (fn) => {
    setSalvando(true);
    try { await fn(); await carregar(); setErro(''); } catch (e) { setErro(mensagemDeErro(e)); } finally { setSalvando(false); }
  };

  const confirmarApagar = () => {
    const alvo = apagar;
    setApagar(null);
    return executar(() => remover(alvo.tabela, schoolId, alvo.id));
  };

  const nomeSerie = (id) => dados.series.find(s => s.id === id)?.nome || '';
  const nomeTurma = (id) => dados.turmas.find(t => t.id === id)?.nome || '';
  const nomeDisc = (id) => dados.disciplinas.find(d => d.id === id)?.nome || '';
  const nomeProf = (id) => professores.find(p => p.id === id)?.name || 'Professor removido';

  const props = { schoolId, dados, anos, professores, salvando, executar, setApagar, nomeSerie, nomeTurma, nomeDisc, nomeProf };

  return (
    <PageShell>
    <div className="h-full flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5 shrink-0">
        {ABAS.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`px-3 py-1.5 rounded-zela-md text-sm font-bold transition ${aba === a.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
            {a.label}
          </button>
        ))}
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3 shrink-0">{erro}</p>}
      <div className="flex-1 min-h-0">
        {carregando ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : (
          <>
            {aba === 'series' && <AbaSeries {...props} />}
            {aba === 'turmas' && <AbaTurmas {...props} />}
            {aba === 'disciplinas' && <AbaDisciplinas {...props} />}
            {aba === 'grade' && <AbaGrade {...props} />}
            {aba === 'professores' && <AbaProfessores {...props} />}
            {aba === 'horarios' && <AbaHorarios {...props} />}
          </>
        )}
      </div>
      {apagar && (
        <ConfirmModal title="Excluir" message={apagar.texto} confirmLabel="Excluir"
          onConfirm={confirmarApagar} onCancel={() => setApagar(null)} />
      )}
    </div>
    </PageShell>
  );
}

const modeloColunas = (colunas) => `${colunas.map(c => c.largura || 'minmax(0,1fr)').join(' ')} 2.5rem`;

// Linha de títulos das colunas (some no celular, onde cada valor traz o próprio rótulo).
function CabecalhoColunas({ colunas }) {
  return (
    <div className="hidden sm:grid gap-2 px-3 text-[11px] font-bold uppercase text-on-surface-variant sm:[grid-template-columns:var(--cols)]"
      style={{ '--cols': modeloColunas(colunas) }}>
      {colunas.map(c => <span key={c.rotulo} title={c.dica}>{c.rotulo}</span>)}
      <span />
    </div>
  );
}

// Uma linha de dados alinhada às colunas do cabeçalho. `celulas` segue a ordem de `colunas`.
function LinhaColunas({ colunas, celulas, onApagar, borda = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:grid sm:gap-2 bg-surface-container-low rounded-zela-md ${borda ? `border-l-4 ${borda}` : ''} px-3 py-2 text-sm text-on-surface sm:[grid-template-columns:var(--cols)]`}
      style={{ '--cols': modeloColunas(colunas) }}>
      {celulas.map((valor, i) => (
        <span key={colunas[i].rotulo} className="min-w-0 truncate">
          <span className="sm:hidden text-xs text-on-surface-variant">{colunas[i].rotulo}: </span>{valor}
        </span>
      ))}
      {onApagar ? <button onClick={onApagar} className={`${botaoLixo} ml-auto sm:ml-0`} aria-label="Excluir"><Trash2 size={16} /></button> : <span />}
    </div>
  );
}

// Campo de formulário com o nome acima: a pessoa sabe o que está preenchendo.
// A dica aparece ao passar o mouse; explicações longas ficam em texto único no cartão.
function Campo({ rotulo, dica, className = '', children }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`} title={dica}>
      <span className="text-xs font-bold text-on-surface-variant">{rotulo}</span>
      {children}
    </label>
  );
}

// Formulário de adicionar dentro de um cartão com título, separado da lista.
const formCartao = 'flex flex-wrap items-end gap-3 rounded-zela-md border border-outline-variant bg-surface p-4 mt-2';
const tituloForm = 'w-full text-sm font-bold text-on-surface';

const COLUNAS_SERIES = [
  { rotulo: 'Série' },
  { rotulo: 'Turmas', dica: 'Quantas turmas existem nesta série', largura: '6rem' },
  { rotulo: 'Disciplinas na grade', dica: 'Disciplinas já definidas na grade desta série', largura: '11rem' },
];
const COLUNAS_TURMAS = [{ rotulo: 'Turma', dica: 'Nome da turma' }, { rotulo: 'Série' }, { rotulo: 'Turno', dica: 'Período em que a turma estuda' }];
const COLUNAS_DISCIPLINAS = [{ rotulo: 'Disciplina' }, { rotulo: 'Sigla', dica: 'Abreviação usada nos quadros', largura: '6rem' }];
const COLUNAS_GRADE = [{ rotulo: 'Disciplina' }, { rotulo: 'Aulas por semana', dica: 'Quantas aulas a série tem dessa disciplina por semana', largura: '10rem' }];
const COLUNAS_PROFESSORES = [{ rotulo: 'Disciplina' }, { rotulo: 'Professor responsável', dica: 'Quem leciona a disciplina nesta turma' }];

function AbaSeries({ schoolId, dados, salvando, executar, setApagar }) {
  const [nome, setNome] = useState('');
  const [segmentoId, setSegmentoId] = useState('');
  const segmentoAtual = segmentoId || dados.segmentos[0]?.id || '';

  const prepararFundamentalI = () => executar(async () => {
    let seg = dados.segmentos.find(s => s.nome === SEGMENTOS_PADRAO[0]);
    if (!seg) [seg] = await inserir('trad_segmentos', schoolId, { nome: SEGMENTOS_PADRAO[0], ordem: 1 });
    const existentes = new Set(dados.series.map(s => s.nome));
    const novas = SERIES_FUNDAMENTAL_I.filter(n => !existentes.has(n))
      .map(n => ({ segmento_id: seg.id, nome: n, ordem: SERIES_FUNDAMENTAL_I.indexOf(n) + 1 }));
    if (novas.length) await inserir('trad_series', schoolId, novas);
  });

  const adicionar = (e) => {
    e.preventDefault();
    if (!nome.trim() || !segmentoAtual) return;
    executar(async () => {
      await inserir('trad_series', schoolId, { segmento_id: segmentoAtual, nome: nome.trim(), ordem: dados.series.length + 1 });
      setNome('');
    });
  };

  return (
    <div className="space-y-3">
      {dados.series.length === 0 && (
        <button onClick={prepararFundamentalI} disabled={salvando} className={botao}><Plus size={16} /> Criar Fundamental I (1º ao 5º ano)</button>
      )}
      {dados.segmentos.length > 0 && (
        <form onSubmit={adicionar} className={formCartao}>
          <p className={tituloForm}>Adicionar série</p>
          <Campo rotulo="Segmento" dica="Etapa de ensino da série" className="sm:w-48">
            <select value={segmentoAtual} onChange={e => setSegmentoId(e.target.value)} className={campo}>
              {dados.segmentos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Nome da série" className="flex-1 min-w-40">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: 6º ano" className={campo} />
          </Campo>
          <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
        </form>
      )}
      {dados.segmentos.map(seg => {
        const series = dados.series.filter(s => s.segmento_id === seg.id);
        const semGrade = series.filter(s => !dados.grade.some(g => g.serie_id === s.id)).length;
        return (
          <div key={seg.id} className="space-y-1.5">
            <p className="text-xs font-bold uppercase text-on-surface-variant">Segmento: {seg.nome}</p>
            {series.length > 0 && (
              <p className={`text-xs font-bold ${semGrade === 0 ? 'text-success' : 'text-brass'}`}>
                {semGrade === 0 ? 'Todas as séries têm grade' : `${series.length - semGrade} de ${series.length} séries com grade`}
              </p>
            )}
            <CabecalhoColunas colunas={COLUNAS_SERIES} />
            {series.map(s => {
              const turmas = dados.turmas.filter(t => t.serie_id === s.id).length;
              const disciplinas = dados.grade.filter(g => g.serie_id === s.id).length;
              return (
                <LinhaColunas key={s.id} colunas={COLUNAS_SERIES} borda={disciplinas ? 'border-primary' : 'border-brass'}
                  celulas={[<b key="n">{s.nome}</b>, turmas, disciplinas]}
                  onApagar={() => setApagar({ tabela: 'trad_series', id: s.id, texto: `Excluir a série "${s.nome}"?` })} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function AbaTurmas({ schoolId, dados, anos, salvando, executar, setApagar, nomeSerie }) {
  const [nome, setNome] = useState('');
  const [serieId, setSerieId] = useState('');
  const [turno, setTurno] = useState('manha');
  const anoAberto = anos.find(a => a.status === 'aberto');
  const serieAtual = serieId || dados.series[0]?.id || '';

  if (!anoAberto) return <p className="text-sm text-on-surface-variant">Abra um ano letivo em Acadêmico › Ano Letivo para criar turmas.</p>;
  if (dados.series.length === 0) return <p className="text-sm text-on-surface-variant">Crie as séries primeiro.</p>;

  const adicionar = (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    executar(async () => {
      await inserir('trad_turmas', schoolId, { school_year_id: anoAberto.id, serie_id: serieAtual, nome: nome.trim(), turno });
      setNome('');
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-on-surface-variant">Ano letivo: {anoAberto.name}</p>
      <form onSubmit={adicionar} className={formCartao}>
        <p className={tituloForm}>Adicionar turma</p>
        <Campo rotulo="Nome da turma" dica="Série mais a letra da turma" className="flex-1 min-w-40">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: 3º ano A" className={campo} />
        </Campo>
        <Campo rotulo="Série" className="sm:w-40">
          <select value={serieAtual} onChange={e => setSerieId(e.target.value)} className={campo}>
            {dados.series.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Turno" className="sm:w-36">
          <select value={turno} onChange={e => setTurno(e.target.value)} className={campo}>
            {TURNOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Campo>
        <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
      </form>
      <CabecalhoColunas colunas={COLUNAS_TURMAS} />
      {dados.turmas.filter(t => t.school_year_id === anoAberto.id).map(t => (
        <LinhaColunas key={t.id} colunas={COLUNAS_TURMAS}
          celulas={[<b key="n">{t.nome}</b>, nomeSerie(t.serie_id), TURNOS.find(x => x.value === t.turno)?.label]}
          onApagar={() => setApagar({ tabela: 'trad_turmas', id: t.id, texto: `Excluir a turma "${t.nome}"? Atribuições e horários dela também saem.` })} />
      ))}
    </div>
  );
}

function AbaDisciplinas({ schoolId, dados, salvando, executar, setApagar }) {
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState('');

  const criarPadrao = () => executar(async () => {
    const existentes = new Set(dados.disciplinas.map(d => d.nome));
    const novas = DISCIPLINAS_FUNDAMENTAL_I.filter(([n]) => !existentes.has(n)).map(([n, s]) => ({ nome: n, sigla: s }));
    if (novas.length) await inserir('trad_disciplinas', schoolId, novas);
  });

  const adicionar = (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    executar(async () => {
      await inserir('trad_disciplinas', schoolId, { nome: nome.trim(), sigla: sigla.trim() || null });
      setNome(''); setSigla('');
    });
  };

  return (
    <div className="space-y-3">
      {dados.disciplinas.length === 0 && (
        <button onClick={criarPadrao} disabled={salvando} className={botao}><Plus size={16} /> Criar disciplinas do Fundamental I</button>
      )}
      <form onSubmit={adicionar} className={formCartao}>
        <p className={tituloForm}>Adicionar disciplina</p>
        <Campo rotulo="Nome da disciplina" className="flex-1 min-w-40">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Matemática" className={campo} />
        </Campo>
        <Campo rotulo="Sigla (opcional)" dica="Até 6 letras" className="sm:w-32">
          <input value={sigla} onChange={e => setSigla(e.target.value)} placeholder="Ex: MAT" maxLength={6} className={campo} />
        </Campo>
        <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
      </form>
      <CabecalhoColunas colunas={COLUNAS_DISCIPLINAS} />
      {dados.disciplinas.map(d => (
        <LinhaColunas key={d.id} colunas={COLUNAS_DISCIPLINAS} celulas={[d.nome, d.sigla || '']}
          onApagar={() => setApagar({ tabela: 'trad_disciplinas', id: d.id, texto: `Excluir "${d.nome}"? Ela sai da grade e das atribuições.` })} />
      ))}
    </div>
  );
}

function AbaGrade({ schoolId, dados, salvando, executar, setApagar, nomeDisc }) {
  const [serieId, setSerieId] = useState('');
  const [disciplinaId, setDisciplinaId] = useState('');
  const [carga, setCarga] = useState(4);
  const serieAtual = serieId || dados.series[0]?.id || '';
  const daSerie = dados.grade.filter(g => g.serie_id === serieAtual);
  const livres = dados.disciplinas.filter(d => !daSerie.some(g => g.disciplina_id === d.id));

  if (dados.series.length === 0 || dados.disciplinas.length === 0) {
    return <p className="text-sm text-on-surface-variant">Crie séries e disciplinas primeiro.</p>;
  }

  const adicionar = (e) => {
    e.preventDefault();
    const disc = disciplinaId || livres[0]?.id;
    if (!disc) return;
    executar(async () => {
      await inserir('trad_grade', schoolId, { serie_id: serieAtual, disciplina_id: disc, carga_semanal: Number(carga) || 1 });
      setDisciplinaId('');
    });
  };

  return (
    <div className="space-y-3">
      <Campo rotulo="Série" dica="Escolha a série para ver e editar as disciplinas dela" className="sm:w-56">
        <select value={serieAtual} onChange={e => setSerieId(e.target.value)} className={campo}>
          {dados.series.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </Campo>
      {livres.length > 0 && (
        <form onSubmit={adicionar} className={formCartao}>
          <p className={tituloForm}>Adicionar disciplina à grade desta série</p>
          <Campo rotulo="Disciplina" className="flex-1 min-w-40">
            <select value={disciplinaId || livres[0].id} onChange={e => setDisciplinaId(e.target.value)} className={campo}>
              {livres.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Aulas por semana" className="sm:w-36">
            <input type="number" min={1} max={20} value={carga} onChange={e => setCarga(e.target.value)} className={campo} />
          </Campo>
          <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
        </form>
      )}
      <CabecalhoColunas colunas={COLUNAS_GRADE} />
      {daSerie.map(g => (
        <LinhaColunas key={g.id} colunas={COLUNAS_GRADE} celulas={[nomeDisc(g.disciplina_id), g.carga_semanal]}
          onApagar={() => setApagar({ tabela: 'trad_grade', id: g.id, texto: `Tirar "${nomeDisc(g.disciplina_id)}" da grade desta série?` })} />
      ))}
    </div>
  );
}

function AbaProfessores({ schoolId, dados, professores, salvando, executar, nomeDisc, nomeProf }) {
  const [turmaId, setTurmaId] = useState('');
  const turmaAtual = dados.turmas.find(t => t.id === (turmaId || dados.turmas[0]?.id));
  if (!turmaAtual) return <p className="text-sm text-on-surface-variant">Crie turmas primeiro.</p>;

  const grade = dados.grade.filter(g => g.serie_id === turmaAtual.serie_id);
  const atribuicoes = dados.atribuicoes.filter(a => a.turma_id === turmaAtual.id);
  const definidas = grade.filter(g => atribuicoes.some(a => a.disciplina_id === g.disciplina_id)).length;

  const definir = (disciplinaId, professorId) => executar(async () => {
    const atual = atribuicoes.find(a => a.disciplina_id === disciplinaId);
    if (!professorId) { if (atual) await remover('trad_atribuicoes', schoolId, atual.id); return; }
    if (atual) await atualizar('trad_atribuicoes', schoolId, atual.id, { professor_id: professorId });
    else await inserir('trad_atribuicoes', schoolId, { turma_id: turmaAtual.id, disciplina_id: disciplinaId, professor_id: professorId });
  });

  return (
    <div className="space-y-3">
      <Campo rotulo="Turma" dica="Escolha a turma para definir o professor de cada disciplina" className="sm:w-56">
        <select value={turmaAtual.id} onChange={e => setTurmaId(e.target.value)} className={campo}>
          {dados.turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </Campo>
      {grade.length === 0 && <p className="text-sm text-on-surface-variant">A série dessa turma ainda não tem disciplinas na grade.</p>}
      {grade.length > 0 && (
        <>
          <p className={`text-xs font-bold ${definidas === grade.length ? 'text-success' : 'text-brass'}`}>
            {definidas} de {grade.length} disciplinas com professor
          </p>
          <CabecalhoColunas colunas={COLUNAS_PROFESSORES} />
        </>
      )}
      {grade.map(g => {
        const atual = atribuicoes.find(a => a.disciplina_id === g.disciplina_id);
        return (
          <div key={g.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:gap-2 rounded-zela-md px-3 py-2 text-sm text-on-surface sm:[grid-template-columns:var(--cols)] border-l-4 ${atual ? 'bg-surface-container-low border-primary' : 'bg-surface-container-low border-brass'}`}
            style={{ '--cols': modeloColunas(COLUNAS_PROFESSORES) }}>
            <span className="min-w-32 font-semibold truncate">{nomeDisc(g.disciplina_id)}</span>
            <select disabled={salvando} aria-label="Professor responsável" value={atual?.professor_id || ''} onChange={e => definir(g.disciplina_id, e.target.value)} className={`${campo} w-full sm:w-auto`}>
              <option value="">Sem professor</option>
              {professores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              {atual && !professores.some(p => p.id === atual.professor_id) && <option value={atual.professor_id}>{nomeProf(atual.professor_id)}</option>}
            </select>
            <span />
          </div>
        );
      })}
    </div>
  );
}

// Valor da opção "Intervalo" no seletor: no banco é uma linha de horário sem atribuição.
const INTERVALO = '__intervalo__';

function AbaHorarios({ schoolId, dados, salvando, executar, setApagar, nomeDisc, nomeProf }) {
  const [turmaId, setTurmaId] = useState('');
  const turmaAtual = dados.turmas.find(t => t.id === (turmaId || dados.turmas[0]?.id));
  const [form, setForm] = useState({ dia: 1, ordem: 1, inicio: '07:30', fim: '08:20', atribuicaoId: '' });
  const [aviso, setAviso] = useState('');
  const [editandoId, setEditandoId] = useState(null); // horário em edição (null = adicionando)
  const atribuicoes = useMemo(() => dados.atribuicoes.filter(a => a.turma_id === turmaAtual?.id), [dados.atribuicoes, turmaAtual]);

  if (!turmaAtual) return <p className="text-sm text-on-surface-variant">Crie turmas primeiro.</p>;

  const semProfessores = atribuicoes.length === 0; // sem professor atribuído só dá para cadastrar intervalo
  const horarios = dados.horarios.filter(h => h.turma_id === turmaAtual.id);
  // Ao trocar de turma o id guardado pode ser de outra turma: cai na primeira atribuição da turma atual.
  const atribuicaoAtual = (semProfessores || form.atribuicaoId === INTERVALO) ? INTERVALO
    : atribuicoes.some(a => a.id === form.atribuicaoId) ? form.atribuicaoId : atribuicoes[0].id;
  const ehIntervalo = atribuicaoAtual === INTERVALO;

  const escolherTurma = (id) => { setTurmaId(id); setEditandoId(null); setAviso(''); };

  const comecarEdicao = (h) => {
    setEditandoId(h.id);
    setAviso('');
    setForm({ dia: h.dia_semana, ordem: h.ordem, inicio: h.inicio.slice(0, 5), fim: h.fim.slice(0, 5), atribuicaoId: h.atribuicao_id || INTERVALO });
  };

  const cancelarEdicao = () => { setEditandoId(null); setAviso(''); };

  const salvar = (e) => {
    e.preventDefault();
    const dia = Number(form.dia);
    let ordem = Number(form.ordem);
    if (ehIntervalo) {
      // Editando um intervalo que continua intervalo, mantém o número que ele já tinha.
      const atual = dados.horarios.find(h => h.id === editandoId);
      ordem = atual && !atual.atribuicao_id ? atual.ordem : ordemLivreParaIntervalo({ horarios: dados.horarios, turmaId: turmaAtual.id, dia, ignorarHorarioId: editandoId });
    } else {
      if (ordemRepetida({ horarios: dados.horarios, turmaId: turmaAtual.id, dia, ordem, ignorarHorarioId: editandoId })) {
        setAviso(`Esta turma já tem a ${ordem}ª aula nesse dia. Escolha outro número ou edite a aula existente.`);
        return;
      }
      const atrib = atribuicoes.find(a => a.id === atribuicaoAtual);
      if (professorOcupado({ horarios: dados.horarios, atribuicoes: dados.atribuicoes, professorId: atrib.professor_id, dia, ordem, ignorarHorarioId: editandoId })) {
        setAviso(`${nomeProf(atrib.professor_id)} já tem aula nesse dia e horário em outra turma.`);
        return;
      }
    }
    if (form.fim <= form.inicio) {
      setAviso('O horário de fim precisa ser depois do início.');
      return;
    }
    const choque = horarioSobreposto({ horarios: dados.horarios, turmaId: turmaAtual.id, dia, inicio: form.inicio, fim: form.fim, ignorarHorarioId: editandoId });
    if (choque) {
      setAviso(`Esse horário cruza com ${choque.atribuicao_id ? `a ${choque.ordem}ª aula` : 'o intervalo'} (${choque.inicio.slice(0, 5)} às ${choque.fim.slice(0, 5)}) desse dia.`);
      return;
    }
    setAviso('');
    const valores = { atribuicao_id: ehIntervalo ? null : atribuicaoAtual, dia_semana: dia, ordem, inicio: form.inicio, fim: form.fim };
    if (editandoId) {
      executar(async () => { await atualizar('trad_horarios', schoolId, editandoId, valores); setEditandoId(null); });
    } else {
      executar(() => inserir('trad_horarios', schoolId, { turma_id: turmaAtual.id, ...valores }));
    }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="h-full flex flex-col gap-3">
      <form onSubmit={salvar} className={`${formCartao} !mt-0 shrink-0 !p-3`}>
        <p className={tituloForm}>{editandoId ? 'Editar aula' : 'Adicionar aula'}</p>
        <Campo rotulo="Turma" dica="Escolha a turma para montar o quadro de horários dela" className="sm:w-40">
          <select value={turmaAtual.id} onChange={e => escolherTurma(e.target.value)} disabled={!!editandoId} className={campo}>
            {dados.turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Dia da semana" className="sm:w-32">
          <select value={form.dia} onChange={set('dia')} className={campo}>
            {DIAS_SEMANA.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Campo>
        {!ehIntervalo && (
          <Campo rotulo="Nº da aula" dica="1 = primeira aula do dia" className="sm:w-24">
            <input type="number" min={1} max={12} value={form.ordem} onChange={set('ordem')} className={campo} />
          </Campo>
        )}
        <Campo rotulo="Início" className="sm:w-28">
          <input type="time" value={form.inicio} onChange={set('inicio')} className={campo} />
        </Campo>
        <Campo rotulo="Fim" className="sm:w-28">
          <input type="time" value={form.fim} onChange={set('fim')} className={campo} />
        </Campo>
        <Campo rotulo="Disciplina e professor" className="flex-1 min-w-40">
          <select value={atribuicaoAtual} onChange={set('atribuicaoId')} className={campo}>
            {atribuicoes.map(a => <option key={a.id} value={a.id}>{nomeDisc(a.disciplina_id)} · {nomeProf(a.professor_id)}</option>)}
            <option value={INTERVALO}>Intervalo</option>
          </select>
        </Campo>
        <button type="submit" disabled={salvando} className={botao}>
          {editandoId ? <><Check size={16} /> Salvar</> : <><Plus size={16} /> Adicionar</>}
        </button>
        {editandoId && (
          <button type="button" onClick={cancelarEdicao} disabled={salvando}
            className="px-4 py-2 rounded-zela-md font-bold border border-outline-variant text-on-surface-variant hover:bg-surface-container transition">Cancelar</button>
        )}
      </form>
      {aviso && <p className="text-sm text-error shrink-0">{aviso}</p>}
      {semProfessores && <p className="text-sm text-on-surface-variant shrink-0">Para cadastrar aulas, atribua professores às disciplinas desta turma na aba Professores. Por enquanto só dá para cadastrar o intervalo.</p>}
      <p className="text-sm font-bold text-on-surface shrink-0">Horários configurados</p>
      {/* Uma coluna por dia: no desktop os cinco dias cabem lado a lado, sem rolagem da página. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 lg:grid-rows-1 gap-3 lg:flex-1 lg:min-h-0">
        {DIAS_SEMANA.map(dia => {
          const doDia = horarios.filter(h => h.dia_semana === dia.value)
            .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.ordem - b.ordem);
          return (
            <section key={dia.value} className="flex flex-col min-h-0 min-w-0 rounded-zela-md border border-outline-variant bg-surface-container-low">
              <h3 className="px-3 py-2 text-xs font-bold uppercase text-primary border-b border-outline-variant shrink-0">{dia.label}</h3>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
                {doDia.length === 0 && <p className="px-1 py-2 text-xs text-on-surface-variant">Nenhuma aula cadastrada</p>}
                {doDia.map(h => {
                  const a = dados.atribuicoes.find(x => x.id === h.atribuicao_id);
                  const intervalo = !h.atribuicao_id;
                  return (
                    <div key={h.id} className={`flex items-start gap-1 rounded-zela-md px-2 py-1.5 ${intervalo ? 'border border-dashed border-outline-variant bg-surface-container' : 'bg-surface'}`}>
                      <div className="min-w-0 flex-1 leading-tight">
                        {intervalo ? (
                          <>
                            <p className="text-[11px] font-bold text-on-surface-variant">{h.inicio.slice(0, 5)} às {h.fim.slice(0, 5)}</p>
                            <p className="text-sm font-semibold text-on-surface">Intervalo</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] font-bold text-on-surface-variant">{h.ordem}ª aula · {h.inicio.slice(0, 5)} às {h.fim.slice(0, 5)}</p>
                            <p className="text-sm font-semibold text-on-surface truncate" title={nomeDisc(a?.disciplina_id)}>{nomeDisc(a?.disciplina_id)}</p>
                            <p className="text-xs text-on-surface-variant truncate" title={nomeProf(a?.professor_id)}>{nomeProf(a?.professor_id)}</p>
                          </>
                        )}
                      </div>
                      <button onClick={() => comecarEdicao(h)} disabled={salvando}
                        className="p-1 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-zela-md transition shrink-0" aria-label="Editar" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => setApagar({ tabela: 'trad_horarios', id: h.id, texto: 'Excluir este horário?' })}
                        className={`${botaoLixo} !p-1`} aria-label="Excluir" title="Excluir"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
