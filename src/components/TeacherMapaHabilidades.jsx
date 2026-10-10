import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, Lock, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { formatIdade, idadeEmMeses } from '../lib/sugestaoTurma';
import {
  SITUACOES, TODAS_AREAS, periodoAtual, montarFila, progressoDaFila, indiceInicial, podeAvancar, formatFaixa, mensagemErroMapa,
} from '../lib/mapaHabilidades';

const COLUNAS_HABILIDADE = 'id, school_id, area, descricao, idade_min_meses, idade_max_meses, ordem, ativa';
const COLUNAS_REGISTRO = 'id, school_id, student_id, habilidade_id, ano, semestre, situacao, status, author_id';

const BOTAO_SITUACAO = {
  sem_interesse: 'data-[on=true]:bg-on-surface-variant data-[on=true]:text-white data-[on=true]:border-outline',
  adquirindo: 'data-[on=true]:bg-warning data-[on=true]:text-white data-[on=true]:border-warning',
  adquirido: 'data-[on=true]:bg-success data-[on=true]:text-white data-[on=true]:border-success',
};

export default function TeacherMapaHabilidades({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const turmas = currentUser?.turmas || [];
  const turmasChave = JSON.stringify(turmas);
  const hojeRef = useMemo(() => new Date(), []);
  const inicial = periodoAtual(hojeRef);

  const [habilidades, setHabilidades] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvandoId, setSalvandoId] = useState(null);

  const [ano, setAno] = useState(inicial.ano);
  const [semestre, setSemestre] = useState(inicial.semestre);
  const [area, setArea] = useState(TODAS_AREAS);
  const [indice, setIndice] = useState(0);
  const [pronto, setPronto] = useState(false);

  const periodo = useMemo(() => ({ ano, semestre }), [ano, semestre]);

  const carregar = useCallback(async () => {
    if (!schoolId || turmas.length === 0) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const [hab, alu] = await Promise.all([
        buscarTodos(() => supabase.from('mapa_habilidades').select(COLUNAS_HABILIDADE)
          .eq('school_id', schoolId).eq('ativa', true).order('id', { ascending: true })),
        buscarTodos(() => supabase.from('students').select('id, name, turma, birth_date')
          .eq('school_id', schoolId).in('turma', turmas).eq('enrollment_status', 'ativo').order('id', { ascending: true })),
      ]);
      const ids = alu.map(a => a.id);
      const regs = ids.length === 0 ? [] : await buscarTodos(() => supabase.from('mapa_habilidades_registros')
        .select(COLUNAS_REGISTRO).eq('school_id', schoolId).in('student_id', ids).order('id', { ascending: true }));
      setHabilidades(hab);
      setAlunos(alu);
      setRegistros(regs);
      setPronto(false);
    } catch (e) {
      console.error('[TeacherMapaHabilidades] Erro ao carregar:', e);
      setErro(mensagemErroMapa(e, 'Não foi possível carregar o Mapa de Habilidades.'));
    } finally {
      setCarregando(false);
    }
  }, [schoolId, turmasChave]);

  useEffect(() => { carregar(); }, [carregar]);

  const areas = useMemo(() => [...new Set(habilidades.map(h => h.area))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [habilidades]);

  const fila = useMemo(() => montarFila({
    habilidades, alunos, registros, periodo, area, semente: currentUser?.id || '', hoje: hojeRef,
  }), [habilidades, alunos, registros, periodo, area, currentUser?.id, hojeRef]);

  const progresso = useMemo(() => progressoDaFila(fila), [fila]);

  // Abre na primeira habilidade que falta quando os dados ou os filtros mudam.
  useEffect(() => {
    if (carregando) return;
    setIndice(indiceInicial(fila));
    setPronto(true);
    // fila muda a cada clique; só reposiciona quando carrega ou troca filtro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, area, ano, semestre, habilidades, alunos]);

  const passo = fila[Math.min(indice, Math.max(fila.length - 1, 0))] || null;
  const indiceAtual = passo ? fila.indexOf(passo) : 0;

  const marcar = async (item, situacao) => {
    if (!passo || salvandoId) return;
    if (item.registro?.status === 'PUBLICADO') return;
    if (item.registro?.situacao === situacao) return;
    setSalvandoId(item.aluno.id);
    setErro('');
    try {
      if (item.registro) {
        const { data, error } = await supabase.from('mapa_habilidades_registros')
          .update({ situacao }).eq('id', item.registro.id).select(COLUNAS_REGISTRO).single();
        if (error) throw error;
        setRegistros(prev => prev.map(r => (r.id === data.id ? data : r)));
      } else {
        const { data, error } = await supabase.from('mapa_habilidades_registros').insert({
          school_id: schoolId,
          student_id: item.aluno.id,
          habilidade_id: passo.habilidade.id,
          ano,
          semestre,
          situacao,
          status: 'RASCUNHO',
          author_id: currentUser.id,
        }).select(COLUNAS_REGISTRO).single();
        if (error) throw error;
        setRegistros(prev => [...prev, data]);
      }
    } catch (e) {
      console.error('[TeacherMapaHabilidades] Erro ao salvar:', e);
      setErro(mensagemErroMapa(e, 'Não foi possível salvar. Confira a conexão e tente de novo.'));
      // 23505: outra professora marcou ao mesmo tempo; recarrega o que está salvo.
      if (e?.code === '23505') carregar();
    } finally {
      setSalvandoId(null);
    }
  };

  if (turmas.length === 0 && !carregando) {
    return <div className="p-6 text-center text-sm text-on-surface-variant">Você ainda não tem turmas vinculadas.</div>;
  }

  const anos = [inicial.ano - 1, inicial.ano];
  const podeVoltar = indiceAtual > 0;
  const podeSeguir = passo ? podeAvancar(fila, indiceAtual) : false;

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 rounded-none sm:rounded-zela-xl border-0 sm:border sm:border-outline-variant overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-outline-variant shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1 text-xs font-bold text-on-surface-variant">
            Período
            <div className="flex gap-2 mt-1">
              <select value={ano} onChange={e => setAno(Number(e.target.value))} className="flex-1 border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-white text-on-surface">
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={semestre} onChange={e => setSemestre(Number(e.target.value))} className="flex-1 border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-white text-on-surface">
                <option value={1}>1º Semestre</option>
                <option value={2}>2º Semestre</option>
              </select>
            </div>
          </label>
          <label className="flex-1 text-xs font-bold text-on-surface-variant">
            Área de conhecimento
            <select value={area} onChange={e => setArea(e.target.value)} className="mt-1 w-full border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-white text-on-surface">
              <option value={TODAS_AREAS}>Todas (em ordem variada)</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-bold text-on-surface-variant mb-1">
            <span>{progresso.preenchidos} de {progresso.total} preenchidos</span>
            <span>{progresso.percentual}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-container overflow-hidden" role="progressbar" aria-valuenow={progresso.percentual} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-all" style={{ width: `${progresso.percentual}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {erro && <div className="bg-error/10 border border-error/30 text-error p-3 rounded-zela-md text-sm font-medium mb-3">{erro}</div>}

        {carregando || !pronto ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : habilidades.length === 0 ? (
          <div className="text-center py-16 text-sm text-on-surface-variant">
            A escola ainda não cadastrou as habilidades. Peça à Coordenação para cadastrar o catálogo.
          </div>
        ) : !passo ? (
          <div className="text-center py-16">
            <Target className="mx-auto h-10 w-10 text-primary mb-3" aria-hidden="true" />
            <p className="text-sm font-bold text-on-surface">Nada para preencher neste filtro.</p>
            <p className="text-xs text-on-surface-variant mt-1">Nenhuma criança da sua turma está na faixa de idade das habilidades desta área.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="rounded-zela-lg border border-outline-variant p-4 bg-surface-container-lowest">
              <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase text-primary">
                <span>{passo.habilidade.area}</span>
                <span className="text-on-surface-variant">Habilidade {indiceAtual + 1} de {fila.length}</span>
              </div>
              <p className="text-base sm:text-lg font-bold text-on-surface mt-2">{passo.habilidade.descricao}</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Esperada {formatFaixa(passo.habilidade.idade_min_meses, passo.habilidade.idade_max_meses)}.
              </p>
            </div>

            <ul className="space-y-2">
              {passo.itens.map(item => {
                const travado = item.registro?.status === 'PUBLICADO';
                const meses = idadeEmMeses(item.aluno.birth_date, hojeRef);
                return (
                  <li key={item.aluno.id} className="rounded-zela-md border border-outline-variant p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-on-surface truncate">{item.aluno.name}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        {formatIdade(meses)}
                        {travado && <span className="ml-2 inline-flex items-center gap-1 font-bold text-success"><Lock size={11} /> Publicado</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label={`Situação de ${item.aluno.name}`}>
                      {SITUACOES.map(s => {
                        const ligado = item.registro?.situacao === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            role="radio"
                            aria-checked={ligado}
                            data-on={ligado}
                            disabled={travado || salvandoId === item.aluno.id}
                            onClick={() => marcar(item, s.value)}
                            className={`px-3 py-2 rounded-zela-md border border-outline-variant text-xs font-bold text-on-surface-variant bg-white transition active:scale-95 disabled:opacity-60 ${BOTAO_SITUACAO[s.value]}`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIndice(indiceAtual - 1)}
                disabled={!podeVoltar}
                className="flex items-center gap-1 px-4 py-2.5 rounded-zela-md border border-outline-variant text-sm font-bold text-on-surface disabled:opacity-40"
              >
                <ChevronLeft size={18} /> Anterior
              </button>
              {passo.completa ? (
                <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-success"><CheckCircle2 size={14} /> Habilidade preenchida</span>
              ) : (
                <span className="text-xs text-on-surface-variant text-center">Marque todas as crianças para seguir</span>
              )}
              <button
                type="button"
                onClick={() => setIndice(indiceAtual + 1)}
                disabled={!podeSeguir}
                className="flex items-center gap-1 px-4 py-2.5 rounded-zela-md bg-primary text-white text-sm font-bold disabled:bg-outline-variant disabled:text-on-surface-variant"
              >
                Próxima <ChevronRight size={18} />
              </button>
            </div>
            <p className="text-[11px] text-on-surface-variant text-center">
              Cada marcação fica salva como rascunho. A família só vê depois que a Coordenação ou a Direção publicar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
