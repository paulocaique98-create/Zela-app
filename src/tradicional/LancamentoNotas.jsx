import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from '../components/ConfirmModal';
import {
  carregarConfig, listarAvaliacoes, criarAvaliacao, removerAvaliacao, listarNotas, salvarNota, limparNota,
  calcularPeriodo, periodosDaConfig, lerNota, TIPOS_AVALIACAO, CONFIG_PADRAO,
} from './lib/avaliacao';
import { listar, mensagemDeErro } from './lib/estrutura';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const formatar = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

// Fase 2 do Método Tradicional: o professor cria provas e trabalhos e lança
// notas só nas turmas e disciplinas que a gestão atribuiu a ele (a RLS barra
// o resto).
export default function LancamentoNotas({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [config, setConfig] = useState({ ...CONFIG_PADRAO });
  const [atribuicoes, setAtribuicoes] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [atribId, setAtribId] = useState('');
  const [periodo, setPeriodo] = useState(1);
  const [alunos, setAlunos] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [notas, setNotas] = useState({}); // { `${avaliacaoId}:${studentId}`: number }
  const [rascunho, setRascunho] = useState({});
  const [novo, setNovo] = useState({ nome: '', tipo: 'prova', peso: '1' });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [apagar, setApagar] = useState(null);

  const periodos = useMemo(() => periodosDaConfig(config.periodo_tipo), [config.periodo_tipo]);
  const atrib = atribuicoes.find(a => a.id === atribId);
  const turma = turmas.find(t => t.id === atrib?.turma_id);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [cfg, ats, ts, ds] = await Promise.all([
          carregarConfig(schoolId),
          listar('trad_atribuicoes', schoolId),
          listar('trad_turmas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_disciplinas', schoolId, { ordenarPor: 'nome' }),
        ]);
        if (!ativo) return;
        const minhas = ats.filter(a => a.professor_id === currentUser?.id);
        setConfig(cfg); setAtribuicoes(minhas); setTurmas(ts); setDisciplinas(ds);
        setAtribId(minhas[0]?.id || '');
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId, currentUser?.id]);

  const carregarAtribuicao = useCallback(async () => {
    if (!atrib || !turma) { setAlunos([]); setAvaliacoes([]); setNotas({}); return; }
    try {
      const [{ data: als, error: errAl }, avs] = await Promise.all([
        supabase.from('students').select('id, name').eq('school_id', schoolId).eq('turma', turma.nome)
          .order('name', { ascending: true }).limit(300),
        listarAvaliacoes(schoolId, atrib.id),
      ]);
      if (errAl) throw errAl;
      const ns = await listarNotas(schoolId, avs.map(a => a.id));
      setAlunos(als || []);
      setAvaliacoes(avs);
      setNotas(Object.fromEntries(ns.map(n => [`${n.avaliacao_id}:${n.student_id}`, n.nota])));
      setRascunho({});
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }, [atrib, turma, schoolId]);

  useEffect(() => { carregarAtribuicao(); }, [carregarAtribuicao]);

  const doPeriodo = avaliacoes.filter(a => a.periodo === periodo);

  const adicionar = async () => {
    const peso = Number(String(novo.peso).replace(',', '.'));
    if (!novo.nome.trim()) { setErro('Informe o nome da avaliação.'); return; }
    if (!Number.isFinite(peso) || peso <= 0 || peso > 10) { setErro('O peso precisa ser maior que 0 e até 10.'); return; }
    try {
      await criarAvaliacao(schoolId, {
        atribuicao_id: atrib.id, periodo, nome: novo.nome.trim(), tipo: novo.tipo,
        peso: novo.tipo === 'recuperacao' ? 1 : peso,
      });
      setNovo({ nome: '', tipo: 'prova', peso: '1' });
      await carregarAtribuicao();
    } catch (e) {
      setErro(e?.code === '23505' ? 'Este período já tem uma recuperação.' : mensagemDeErro(e));
    }
  };

  const confirmarApagar = async () => {
    const alvo = apagar;
    setApagar(null);
    try { await removerAvaliacao(schoolId, alvo.id); await carregarAtribuicao(); } catch (e) { setErro(mensagemDeErro(e)); }
  };

  const gravar = async (avaliacaoId, studentId) => {
    const chave = `${avaliacaoId}:${studentId}`;
    if (!(chave in rascunho)) return;
    const lida = lerNota(rascunho[chave]);
    const { [chave]: _descartado, ...resto } = rascunho;
    try {
      if (lida.vazio) {
        await limparNota(schoolId, avaliacaoId, studentId);
        setNotas(({ [chave]: _x, ...n }) => n);
      } else if (lida.ok) {
        await salvarNota(schoolId, { avaliacaoId, studentId, nota: lida.valor, userId: currentUser?.id });
        setNotas(n => ({ ...n, [chave]: lida.valor }));
      } else {
        setErro('Nota inválida. Use um valor de 0 a 10.');
        return;
      }
      setRascunho(resto);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const notasDoAluno = (studentId) => Object.fromEntries(
    avaliacoes.map(a => [a.id, notas[`${a.id}:${studentId}`]]).filter(([, v]) => v !== undefined),
  );

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Notas</h2>
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3">{erro}</p>}
      {atribuicoes.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Você ainda não tem turmas e disciplinas atribuídas. Fale com a gestão da escola.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className={campo} value={atribId} onChange={e => setAtribId(e.target.value)} aria-label="Turma e disciplina">
              {atribuicoes.map(a => (
                <option key={a.id} value={a.id}>
                  {turmas.find(t => t.id === a.turma_id)?.nome || 'Turma'} · {disciplinas.find(d => d.id === a.disciplina_id)?.nome || 'Disciplina'}
                </option>
              ))}
            </select>
            <select className={campo} value={periodo} onChange={e => setPeriodo(Number(e.target.value))} aria-label="Período">
              {periodos.map(p => <option key={p.numero} value={p.numero}>{p.label}</option>)}
            </select>
          </div>

          <div className="bg-surface-container-low rounded-zela-md p-3 space-y-2">
            <p className="text-sm font-bold text-on-surface">Nova avaliação neste período</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem_6rem_auto]">
              <input className={campo} placeholder="Nome (ex.: Prova 1)" value={novo.nome}
                onChange={e => setNovo({ ...novo, nome: e.target.value })} />
              <select className={campo} value={novo.tipo} onChange={e => setNovo({ ...novo, tipo: e.target.value })}>
                {TIPOS_AVALIACAO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input className={campo} placeholder="Peso" inputMode="decimal" value={novo.tipo === 'recuperacao' ? '1' : novo.peso}
                disabled={novo.tipo === 'recuperacao'} onChange={e => setNovo({ ...novo, peso: e.target.value })} />
              <button onClick={adicionar}
                className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95">
                <Plus size={16} /> Adicionar
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">A recuperação substitui a nota do período. Média mínima da escola: {formatar(config.media_minima)}.</p>
          </div>

          {doPeriodo.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhuma avaliação neste período ainda.</p>
          ) : alunos.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhum aluno na turma {turma?.nome}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-on-surface-variant">
                    <th className="py-2 pr-3">Aluno</th>
                    {doPeriodo.map(a => (
                      <th key={a.id} className="py-2 px-1 font-bold">
                        <div className="flex items-center gap-1">
                          <span>{a.nome}</span>
                          <span className="text-xs font-normal">({a.tipo === 'recuperacao' ? 'Rec.' : `peso ${formatar(a.peso)}`})</span>
                          <button onClick={() => setApagar({ id: a.id, texto: `Excluir "${a.nome}" e todas as notas lançadas nela?` })}
                            className="p-1 text-on-surface-variant/70 hover:text-error" aria-label="Excluir avaliação"><Trash2 size={14} /></button>
                        </div>
                      </th>
                    ))}
                    <th className="py-2 pl-3">Nota do período</th>
                  </tr>
                </thead>
                <tbody>
                  {alunos.map(al => {
                    const calc = calcularPeriodo({ avaliacoes, notas: notasDoAluno(al.id), periodo, mediaMinima: config.media_minima });
                    return (
                      <tr key={al.id} className="border-t border-outline-variant/50">
                        <td className="py-1.5 pr-3 text-on-surface">{al.name}</td>
                        {doPeriodo.map(a => {
                          const chave = `${a.id}:${al.id}`;
                          return (
                            <td key={a.id} className="py-1.5 px-1">
                              <input className="w-20 p-1.5 border border-outline-variant rounded-zela-md bg-surface" inputMode="decimal"
                                value={chave in rascunho ? rascunho[chave] : formatar(notas[chave])}
                                onChange={e => setRascunho({ ...rascunho, [chave]: e.target.value })}
                                onBlur={() => gravar(a.id, al.id)}
                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                            </td>
                          );
                        })}
                        <td className={`py-1.5 pl-3 font-bold ${calc.situacao === 'abaixo' ? 'text-brass' : 'text-on-surface'}`}>
                          {calc.nota === null ? '' : formatar(calc.nota)}{calc.recuperada ? ' (rec.)' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {apagar && (
        <ConfirmModal title="Excluir" message={apagar.texto} confirmLabel="Excluir"
          onConfirm={confirmarApagar} onCancel={() => setApagar(null)} />
      )}
    </div>
  );
}
