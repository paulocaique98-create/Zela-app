import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gavel, Loader2, Lock, Unlock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  carregarConfig, listarAvaliacoes, listarNotas, periodosDaConfig, CONFIG_PADRAO,
} from './lib/avaliacao';
import { listarAulas, listarFrequencia } from './lib/frequencia';
import {
  calcularBoletim, listarResultados, fecharResultado, reabrirResultado, rotuloSituacao, SITUACOES_FINAIS,
} from './lib/boletim';
import { listar, mensagemDeErro } from './lib/estrutura';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const formatar = (n) => (Number.isFinite(n) ? String(n).replace('.', ',') : '·');
// Alerta em dourado (brass), nunca vermelho.
const corSituacao = (s) => (s === 'aprovado' ? 'text-primary' : 'text-brass');

// Fase 4A do Método Tradicional: boletim por aluno e fechamento do resultado
// final. Só Coordenação e Direção (a RLS de trad_resultados barra o resto).
export default function ConselhoClasse({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [config, setConfig] = useState({ ...CONFIG_PADRAO });
  const [turmas, setTurmas] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [atribuicoes, setAtribuicoes] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [dados, setDados] = useState({ avaliacoes: [], notas: [], aulas: [], registros: [] });
  const [resultados, setResultados] = useState([]);
  const [aberto, setAberto] = useState('');
  const [form, setForm] = useState({ situacao: '', observacao: '' });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const turma = turmas.find(t => t.id === turmaId);
  const periodos = useMemo(() => periodosDaConfig(config.periodo_tipo), [config.periodo_tipo]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [cfg, ts, ds, ats] = await Promise.all([
          carregarConfig(schoolId),
          listar('trad_turmas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_disciplinas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_atribuicoes', schoolId),
        ]);
        if (!ativo) return;
        setConfig(cfg); setTurmas(ts); setDisciplinas(ds); setAtribuicoes(ats);
        setTurmaId(ts[0]?.id || '');
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId]);

  const carregarTurma = useCallback(async () => {
    if (!turma) { setAlunos([]); setResultados([]); return; }
    const ats = atribuicoes.filter(a => a.turma_id === turma.id);
    const [{ data: als, error: errAl }, avsPorAtrib, aulas, res] = await Promise.all([
      supabase.from('students').select('id, name').eq('school_id', schoolId).eq('turma', turma.nome)
        .order('name', { ascending: true }).limit(300),
      Promise.all(ats.map(a => listarAvaliacoes(schoolId, a.id))),
      listarAulas(schoolId, ats.map(a => a.id)),
      listarResultados(schoolId, turma.id),
    ]);
    if (errAl) throw errAl;
    const avaliacoes = avsPorAtrib.flat();
    const [notas, registros] = await Promise.all([
      listarNotas(schoolId, avaliacoes.map(a => a.id)),
      listarFrequencia(schoolId, aulas.map(a => a.id)),
    ]);
    setAlunos(als || []); setDados({ avaliacoes, notas, aulas, registros }); setResultados(res);
  }, [turma, atribuicoes, schoolId]);

  useEffect(() => {
    let ativo = true;
    carregarTurma().then(() => { if (ativo) setErro(''); }).catch(e => { if (ativo) setErro(mensagemDeErro(e)); });
    return () => { ativo = false; };
  }, [carregarTurma]);

  const boletins = useMemo(() => {
    const doTurma = atribuicoes
      .filter(a => a.turma_id === turmaId)
      .map(a => ({ id: a.id, disciplina: disciplinas.find(d => d.id === a.disciplina_id)?.nome || 'Disciplina' }));
    const mapa = new Map();
    for (const al of alunos) {
      mapa.set(al.id, calcularBoletim({ studentId: al.id, atribuicoes: doTurma, config, ...dados }));
    }
    return mapa;
  }, [alunos, atribuicoes, disciplinas, turmaId, config, dados]);

  const abrir = (aluno) => {
    if (aberto === aluno.id) { setAberto(''); return; }
    const fechado = resultados.find(r => r.student_id === aluno.id);
    const calc = boletins.get(aluno.id)?.situacao;
    setForm({
      situacao: fechado?.situacao || (calc && calc !== 'incompleto' ? calc : ''),
      observacao: fechado?.observacao || '',
    });
    setAberto(aluno.id);
  };

  const fechar = async (aluno) => {
    const b = boletins.get(aluno.id);
    if (!form.situacao) { setErro('Escolha o resultado final.'); return; }
    if (form.situacao !== b.situacao && !form.observacao.trim()) {
      setErro('Resultado diferente do calculado (ou com notas incompletas) exige uma observação.');
      return;
    }
    setSalvando(true);
    try {
      await fecharResultado(schoolId, {
        studentId: aluno.id, turmaId, situacao: form.situacao, situacaoCalculada: b.situacao,
        frequencia: b.frequencia, linhas: b.linhas, observacao: form.observacao, userId: currentUser?.id,
      });
      setResultados(await listarResultados(schoolId, turmaId));
      setErro(''); setAberto('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const reabrir = async (resultado) => {
    setSalvando(true);
    try {
      await reabrirResultado(schoolId, resultado.id);
      setResultados(await listarResultados(schoolId, turmaId));
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Gavel size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Boletim e resultado final</h2>
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3">{erro}</p>}
      {turmas.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Cadastre as turmas em Estrutura acadêmica primeiro.</p>
      ) : (
        <>
          <select className={`${campo} sm:max-w-xs`} value={turmaId} onChange={e => { setTurmaId(e.target.value); setAberto(''); }} aria-label="Turma">
            {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <p className="text-xs text-on-surface-variant">
            Regra da escola: média mínima {formatar(config.media_minima)}
            {config.recuperacao_final && Number.isFinite(config.media_recuperacao) ? `, recuperação final a partir de ${formatar(config.media_recuperacao)}` : ', sem recuperação final'}
            {' '}e frequência mínima de {formatar(config.freq_minima)}%. Ao fechar, a família passa a ver o resultado.
          </p>
          {alunos.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhum aluno nesta turma.</p>
          ) : (
            <ul className="space-y-2">
              {alunos.map(al => {
                const b = boletins.get(al.id);
                const fechado = resultados.find(r => r.student_id === al.id);
                const situacao = fechado?.situacao || b.situacao;
                return (
                  <li key={al.id} className="bg-surface-container-low rounded-zela-md">
                    <button onClick={() => abrir(al)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left">
                      <span className="font-bold text-on-surface flex-1 min-w-[10rem]">{al.name}</span>
                      <span className="text-xs text-on-surface-variant">Frequência {b.frequencia === null ? '·' : `${formatar(b.frequencia)}%`}</span>
                      <span className={`text-sm font-bold ${corSituacao(situacao)}`}>
                        {rotuloSituacao(situacao)}{!fechado && ' (calculado)'}
                      </span>
                      {fechado && <Lock size={14} className="text-primary" aria-label="Resultado fechado" />}
                    </button>
                    {aberto === al.id && (
                      <div className="px-3 pb-3 space-y-3">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-on-surface-variant">
                                <th className="py-1.5 pr-3">Disciplina</th>
                                {periodos.map(p => <th key={p.numero} className="py-1.5 px-1">{p.numero}º</th>)}
                                <th className="py-1.5 px-1">Média anual</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.linhas.map(l => (
                                <tr key={l.disciplina} className="border-t border-outline-variant/50">
                                  <td className="py-1.5 pr-3 text-on-surface">{l.disciplina}</td>
                                  {l.medias.map((m, i) => <td key={i} className="py-1.5 px-1 text-on-surface">{formatar(m)}</td>)}
                                  <td className={`py-1.5 px-1 font-bold ${corSituacao(l.situacao)}`}>{formatar(l.media_anual)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {b.linhas.length === 0 && <p className="text-sm text-on-surface-variant">Esta turma ainda não tem disciplinas atribuídas.</p>}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-sm font-bold text-on-surface">
                            Resultado final
                            <select className={`${campo} mt-1 font-normal`} value={form.situacao}
                              onChange={e => setForm({ ...form, situacao: e.target.value })}>
                              <option value="">Escolha</option>
                              {SITUACOES_FINAIS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </label>
                          <label className="text-sm font-bold text-on-surface sm:col-span-2">
                            Observação do conselho
                            <textarea className={`${campo} mt-1 font-normal`} rows={2} maxLength={2000} value={form.observacao}
                              onChange={e => setForm({ ...form, observacao: e.target.value })} />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => fechar(al)} disabled={salvando}
                            className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60">
                            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                            {fechado ? 'Atualizar resultado' : 'Fechar resultado'}
                          </button>
                          {fechado && (
                            <button onClick={() => reabrir(fechado)} disabled={salvando}
                              className="flex items-center gap-1.5 border border-outline-variant text-on-surface px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60">
                              <Unlock size={16} /> Reabrir
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
