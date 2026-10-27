import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from '../components/ConfirmModal';
import {
  listar, inserir, atualizar, remover, listarProfessores, mensagemDeErro, professorOcupado,
  SEGMENTOS_PADRAO, SERIES_FUNDAMENTAL_I, DISCIPLINAS_FUNDAMENTAL_I, TURNOS, DIAS_SEMANA,
} from './lib/estrutura';

const ABAS = [
  { id: 'series', label: 'Séries' },
  { id: 'turmas', label: 'Turmas' },
  { id: 'disciplinas', label: 'Disciplinas' },
  { id: 'grade', label: 'Grade curricular' },
  { id: 'professores', label: 'Professores' },
  { id: 'horarios', label: 'Horários' },
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
    setCarregando(true);
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GraduationCap size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Estrutura acadêmica</h2>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ABAS.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`px-3 py-1.5 rounded-zela-md text-sm font-bold transition ${aba === a.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
            {a.label}
          </button>
        ))}
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3">{erro}</p>}
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
      {apagar && (
        <ConfirmModal title="Excluir" message={apagar.texto} confirmLabel="Excluir"
          onConfirm={confirmarApagar} onCancel={() => setApagar(null)} />
      )}
    </div>
  );
}

function Linha({ children, onApagar }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-surface-container-low rounded-zela-md px-3 py-2">
      <div className="min-w-0 flex-1 text-sm text-on-surface">{children}</div>
      {onApagar && <button onClick={onApagar} className={botaoLixo} aria-label="Excluir"><Trash2 size={16} /></button>}
    </div>
  );
}

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
      {dados.segmentos.map(seg => (
        <div key={seg.id} className="space-y-1.5">
          <p className="text-xs font-bold uppercase text-on-surface-variant">{seg.nome}</p>
          {dados.series.filter(s => s.segmento_id === seg.id).map(s => (
            <Linha key={s.id} onApagar={() => setApagar({ tabela: 'trad_series', id: s.id, texto: `Excluir a série "${s.nome}"?` })}>{s.nome}</Linha>
          ))}
        </div>
      ))}
      {dados.segmentos.length > 0 && (
        <form onSubmit={adicionar} className="flex flex-wrap gap-2">
          <select value={segmentoAtual} onChange={e => setSegmentoId(e.target.value)} className={`${campo} sm:w-48`}>
            {dados.segmentos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da série" className={`${campo} flex-1 min-w-40`} />
          <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
        </form>
      )}
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
      {dados.turmas.filter(t => t.school_year_id === anoAberto.id).map(t => (
        <Linha key={t.id} onApagar={() => setApagar({ tabela: 'trad_turmas', id: t.id, texto: `Excluir a turma "${t.nome}"? Atribuições e horários dela também saem.` })}>
          <b>{t.nome}</b> · {nomeSerie(t.serie_id)} · {TURNOS.find(x => x.value === t.turno)?.label}
        </Linha>
      ))}
      <form onSubmit={adicionar} className="flex flex-wrap gap-2">
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: 3º ano A" className={`${campo} flex-1 min-w-40`} />
        <select value={serieAtual} onChange={e => setSerieId(e.target.value)} className={`${campo} sm:w-40`}>
          {dados.series.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <select value={turno} onChange={e => setTurno(e.target.value)} className={`${campo} sm:w-36`}>
          {TURNOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
      </form>
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
      {dados.disciplinas.map(d => (
        <Linha key={d.id} onApagar={() => setApagar({ tabela: 'trad_disciplinas', id: d.id, texto: `Excluir "${d.nome}"? Ela sai da grade e das atribuições.` })}>
          {d.nome}{d.sigla ? ` (${d.sigla})` : ''}
        </Linha>
      ))}
      <form onSubmit={adicionar} className="flex flex-wrap gap-2">
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da disciplina" className={`${campo} flex-1 min-w-40`} />
        <input value={sigla} onChange={e => setSigla(e.target.value)} placeholder="Sigla" maxLength={6} className={`${campo} sm:w-28`} />
        <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
      </form>
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
      <select value={serieAtual} onChange={e => setSerieId(e.target.value)} className={`${campo} sm:w-56`}>
        {dados.series.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      {daSerie.map(g => (
        <Linha key={g.id} onApagar={() => setApagar({ tabela: 'trad_grade', id: g.id, texto: `Tirar "${nomeDisc(g.disciplina_id)}" da grade desta série?` })}>
          {nomeDisc(g.disciplina_id)} · {g.carga_semanal} aula(s) por semana
        </Linha>
      ))}
      {livres.length > 0 && (
        <form onSubmit={adicionar} className="flex flex-wrap gap-2">
          <select value={disciplinaId || livres[0].id} onChange={e => setDisciplinaId(e.target.value)} className={`${campo} flex-1 min-w-40`}>
            {livres.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
          <input type="number" min={1} max={20} value={carga} onChange={e => setCarga(e.target.value)} className={`${campo} sm:w-24`} aria-label="Aulas por semana" />
          <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
        </form>
      )}
    </div>
  );
}

function AbaProfessores({ schoolId, dados, professores, salvando, executar, nomeDisc, nomeProf }) {
  const [turmaId, setTurmaId] = useState('');
  const turmaAtual = dados.turmas.find(t => t.id === (turmaId || dados.turmas[0]?.id));
  if (!turmaAtual) return <p className="text-sm text-on-surface-variant">Crie turmas primeiro.</p>;

  const grade = dados.grade.filter(g => g.serie_id === turmaAtual.serie_id);
  const atribuicoes = dados.atribuicoes.filter(a => a.turma_id === turmaAtual.id);

  const definir = (disciplinaId, professorId) => executar(async () => {
    const atual = atribuicoes.find(a => a.disciplina_id === disciplinaId);
    if (!professorId) { if (atual) await remover('trad_atribuicoes', schoolId, atual.id); return; }
    if (atual) await atualizar('trad_atribuicoes', schoolId, atual.id, { professor_id: professorId });
    else await inserir('trad_atribuicoes', schoolId, { turma_id: turmaAtual.id, disciplina_id: disciplinaId, professor_id: professorId });
  });

  return (
    <div className="space-y-3">
      <select value={turmaAtual.id} onChange={e => setTurmaId(e.target.value)} className={`${campo} sm:w-56`}>
        {dados.turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>
      {grade.length === 0 && <p className="text-sm text-on-surface-variant">A série dessa turma ainda não tem disciplinas na grade.</p>}
      {grade.map(g => {
        const atual = atribuicoes.find(a => a.disciplina_id === g.disciplina_id);
        return (
          <div key={g.id} className="flex items-center gap-2 bg-surface-container-low rounded-zela-md px-3 py-2">
            <span className="flex-1 text-sm">{nomeDisc(g.disciplina_id)}</span>
            <select disabled={salvando} value={atual?.professor_id || ''} onChange={e => definir(g.disciplina_id, e.target.value)} className={`${campo} sm:w-64`}>
              <option value="">Sem professor</option>
              {professores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              {atual && !professores.some(p => p.id === atual.professor_id) && <option value={atual.professor_id}>{nomeProf(atual.professor_id)}</option>}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function AbaHorarios({ schoolId, dados, salvando, executar, setApagar, nomeDisc, nomeProf }) {
  const [turmaId, setTurmaId] = useState('');
  const turmaAtual = dados.turmas.find(t => t.id === (turmaId || dados.turmas[0]?.id));
  const [form, setForm] = useState({ dia: 1, ordem: 1, inicio: '07:30', fim: '08:20', atribuicaoId: '' });
  const [aviso, setAviso] = useState('');
  const atribuicoes = useMemo(() => dados.atribuicoes.filter(a => a.turma_id === turmaAtual?.id), [dados.atribuicoes, turmaAtual]);

  if (!turmaAtual) return <p className="text-sm text-on-surface-variant">Crie turmas primeiro.</p>;
  if (atribuicoes.length === 0) return <p className="text-sm text-on-surface-variant">Atribua professores às disciplinas dessa turma primeiro.</p>;

  const horarios = dados.horarios.filter(h => h.turma_id === turmaAtual.id)
    .sort((a, b) => a.dia_semana - b.dia_semana || a.ordem - b.ordem);
  const atribuicaoAtual = form.atribuicaoId || atribuicoes[0].id;

  const adicionar = (e) => {
    e.preventDefault();
    const atrib = atribuicoes.find(a => a.id === atribuicaoAtual);
    const dia = Number(form.dia); const ordem = Number(form.ordem);
    if (professorOcupado({ horarios: dados.horarios, atribuicoes: dados.atribuicoes, professorId: atrib.professor_id, dia, ordem })) {
      setAviso(`${nomeProf(atrib.professor_id)} já tem aula nesse dia e horário em outra turma.`);
      return;
    }
    setAviso('');
    executar(() => inserir('trad_horarios', schoolId, {
      turma_id: turmaAtual.id, atribuicao_id: atribuicaoAtual, dia_semana: dia, ordem, inicio: form.inicio, fim: form.fim,
    }));
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <select value={turmaAtual.id} onChange={e => setTurmaId(e.target.value)} className={`${campo} sm:w-56`}>
        {dados.turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>
      {horarios.map(h => {
        const a = dados.atribuicoes.find(x => x.id === h.atribuicao_id);
        return (
          <Linha key={h.id} onApagar={() => setApagar({ tabela: 'trad_horarios', id: h.id, texto: 'Excluir este horário?' })}>
            {DIAS_SEMANA.find(d => d.value === h.dia_semana)?.label} · {h.ordem}ª aula · {h.inicio.slice(0, 5)} até {h.fim.slice(0, 5)} · {nomeDisc(a?.disciplina_id)} · {nomeProf(a?.professor_id)}
          </Linha>
        );
      })}
      {aviso && <p className="text-sm text-error">{aviso}</p>}
      <form onSubmit={adicionar} className="flex flex-wrap gap-2">
        <select value={form.dia} onChange={set('dia')} className={`${campo} sm:w-36`}>
          {DIAS_SEMANA.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <input type="number" min={1} max={12} value={form.ordem} onChange={set('ordem')} className={`${campo} sm:w-20`} aria-label="Número da aula" />
        <input type="time" value={form.inicio} onChange={set('inicio')} className={`${campo} sm:w-32`} />
        <input type="time" value={form.fim} onChange={set('fim')} className={`${campo} sm:w-32`} />
        <select value={atribuicaoAtual} onChange={set('atribuicaoId')} className={`${campo} flex-1 min-w-48`}>
          {atribuicoes.map(a => <option key={a.id} value={a.id}>{nomeDisc(a.disciplina_id)} · {nomeProf(a.professor_id)}</option>)}
        </select>
        <button type="submit" disabled={salvando} className={botao}><Plus size={16} /> Adicionar</button>
      </form>
    </div>
  );
}
