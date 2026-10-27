import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from '../components/ConfirmModal';
import {
  listarAulas, criarAula, atualizarAula, removerAula, listarFrequencia, salvarFrequencia,
  calcularFrequencia, STATUS_FREQUENCIA, LIMITE_FREQUENCIA,
} from './lib/frequencia';
import { listar, mensagemDeErro } from './lib/estrutura';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const hoje = () => new Date().toLocaleDateString('en-CA');
const formatarData = (iso) => iso.split('-').reverse().join('/');
const corSituacao = { abaixo: 'text-brass font-bold', atencao: 'text-brass', ok: 'text-on-surface', sem_dados: 'text-on-surface-variant' };

// Fase 3 do Método Tradicional: o professor registra a aula dada (conteúdo) e
// a chamada por disciplina, só nas turmas que a gestão atribuiu a ele (a RLS
// barra o resto).
export default function DiarioClasse({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [atribuicoes, setAtribuicoes] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [atribId, setAtribId] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [novo, setNovo] = useState({ data: hoje(), qtd_aulas: '1', conteudo: '' });
  const [aulaId, setAulaId] = useState('');
  const [chamada, setChamada] = useState({}); // { studentId: status }
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });
  const [apagar, setApagar] = useState(null);

  const atrib = atribuicoes.find(a => a.id === atribId);
  const turma = turmas.find(t => t.id === atrib?.turma_id);
  const aula = aulas.find(a => a.id === aulaId);
  const erro = (e) => setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [ats, ts, ds] = await Promise.all([
          listar('trad_atribuicoes', schoolId),
          listar('trad_turmas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_disciplinas', schoolId, { ordenarPor: 'nome' }),
        ]);
        if (!ativo) return;
        const minhas = ats.filter(a => a.professor_id === currentUser?.id);
        setAtribuicoes(minhas); setTurmas(ts); setDisciplinas(ds);
        setAtribId(minhas[0]?.id || '');
      } catch (e) {
        if (ativo) erro(e);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId, currentUser?.id]);

  const carregarAtribuicao = useCallback(async () => {
    setAulaId('');
    if (!atrib || !turma) { setAlunos([]); setAulas([]); setRegistros([]); return; }
    try {
      const [{ data: als, error: errAl }, as] = await Promise.all([
        supabase.from('students').select('id, name').eq('school_id', schoolId).eq('turma', turma.nome)
          .order('name', { ascending: true }).limit(300),
        listarAulas(schoolId, [atrib.id]),
      ]);
      if (errAl) throw errAl;
      setAlunos(als || []);
      setAulas(as);
      setRegistros(await listarFrequencia(schoolId, as.map(a => a.id)));
      setMsg({ tipo: '', texto: '' });
    } catch (e) {
      erro(e);
    }
  }, [atrib, turma, schoolId]);

  useEffect(() => { carregarAtribuicao(); }, [carregarAtribuicao]);

  // Abrir uma aula carrega a chamada gravada; quem ainda não tem registro vem Presente.
  const abrirAula = (id) => {
    setAulaId(id);
    const gravada = Object.fromEntries(registros.filter(r => r.aula_id === id).map(r => [r.student_id, r.status]));
    setChamada(Object.fromEntries(alunos.map(al => [al.id, gravada[al.id] || 'presente'])));
  };

  const registrarAula = async () => {
    const qtd = Number(novo.qtd_aulas);
    if (!novo.data) { setMsg({ tipo: 'erro', texto: 'Informe a data da aula.' }); return; }
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 6) { setMsg({ tipo: 'erro', texto: 'A quantidade de aulas vai de 1 a 6.' }); return; }
    try {
      const criada = await criarAula(schoolId, {
        atribuicao_id: atrib.id, data: novo.data, qtd_aulas: qtd, conteudo: novo.conteudo.trim(), userId: currentUser?.id,
      });
      setNovo({ data: hoje(), qtd_aulas: '1', conteudo: '' });
      setAulas(as => [criada, ...as].sort((a, b) => b.data.localeCompare(a.data)));
      setAulaId(criada.id);
      setChamada(Object.fromEntries(alunos.map(al => [al.id, 'presente'])));
      setMsg({ tipo: '', texto: '' });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e?.code === '23505' ? 'Já existe uma aula registrada nesta data para esta disciplina.' : mensagemDeErro(e) });
    }
  };

  const gravarChamada = async () => {
    setSalvando(true);
    try {
      const linhas = alunos.map(al => ({ studentId: al.id, status: chamada[al.id] || 'presente' }));
      await salvarFrequencia(schoolId, aula.id, linhas);
      setRegistros(rs => [
        ...rs.filter(r => r.aula_id !== aula.id),
        ...linhas.map(l => ({ aula_id: aula.id, student_id: l.studentId, status: l.status })),
      ]);
      setMsg({ tipo: 'ok', texto: 'Chamada salva.' });
    } catch (e) {
      erro(e);
    } finally {
      setSalvando(false);
    }
  };

  const gravarConteudo = async (conteudo) => {
    if (!aula || conteudo === aula.conteudo) return;
    try {
      await atualizarAula(schoolId, aula.id, { conteudo });
      setAulas(as => as.map(a => (a.id === aula.id ? { ...a, conteudo } : a)));
    } catch (e) {
      erro(e);
    }
  };

  const confirmarApagar = async () => {
    const alvo = apagar;
    setApagar(null);
    try { await removerAula(schoolId, alvo.id); await carregarAtribuicao(); } catch (e) { erro(e); }
  };

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <BookOpen size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Diário de classe</h2>
      </div>
      {msg.texto && (
        <p className={`text-sm rounded-zela-md p-3 ${msg.tipo === 'erro' ? 'text-error bg-error/10' : 'text-on-surface bg-surface-container-low'}`}>{msg.texto}</p>
      )}
      {atribuicoes.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Você ainda não tem turmas e disciplinas atribuídas. Fale com a gestão da escola.</p>
      ) : (
        <>
          <select className={campo} value={atribId} onChange={e => setAtribId(e.target.value)} aria-label="Turma e disciplina">
            {atribuicoes.map(a => (
              <option key={a.id} value={a.id}>
                {turmas.find(t => t.id === a.turma_id)?.nome || 'Turma'} · {disciplinas.find(d => d.id === a.disciplina_id)?.nome || 'Disciplina'}
              </option>
            ))}
          </select>

          <div className="bg-surface-container-low rounded-zela-md p-3 space-y-2">
            <p className="text-sm font-bold text-on-surface">Registrar aula dada</p>
            <div className="grid gap-2 sm:grid-cols-[10rem_7rem_1fr_auto]">
              <input type="date" className={campo} value={novo.data} max={hoje()} onChange={e => setNovo({ ...novo, data: e.target.value })} aria-label="Data" />
              <input className={campo} inputMode="numeric" placeholder="Aulas" value={novo.qtd_aulas}
                onChange={e => setNovo({ ...novo, qtd_aulas: e.target.value })} aria-label="Quantidade de aulas no dia" />
              <input className={campo} placeholder="Conteúdo da aula" maxLength={2000} value={novo.conteudo}
                onChange={e => setNovo({ ...novo, conteudo: e.target.value })} />
              <button onClick={registrarAula}
                className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95">
                <Plus size={16} /> Registrar
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">Quantidade de aulas no dia: use 2 para aulas geminadas. A frequência mínima é de {LIMITE_FREQUENCIA}%.</p>
          </div>

          {aulas.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhuma aula registrada nesta disciplina ainda.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
              <ul className="space-y-1.5">
                {aulas.map(a => (
                  <li key={a.id}>
                    <button onClick={() => abrirAula(a.id)}
                      className={`w-full text-left p-2.5 rounded-zela-md border ${a.id === aulaId ? 'border-primary bg-primary/5' : 'border-outline-variant'}`}>
                      <span className="font-bold text-sm text-on-surface">{formatarData(a.data)}</span>
                      <span className="text-xs text-on-surface-variant"> · {a.qtd_aulas} {a.qtd_aulas === 1 ? 'aula' : 'aulas'}</span>
                      {a.conteudo && <span className="block text-xs text-on-surface-variant truncate">{a.conteudo}</span>}
                    </button>
                  </li>
                ))}
              </ul>

              {aula ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input key={aula.id} className={campo} placeholder="Conteúdo da aula" maxLength={2000} defaultValue={aula.conteudo}
                      onBlur={e => gravarConteudo(e.target.value.trim())} aria-label="Conteúdo da aula" />
                    <button onClick={() => setApagar({ id: aula.id, texto: `Excluir a aula de ${formatarData(aula.data)} e a chamada dela?` })}
                      className="p-2 text-on-surface-variant/70 hover:text-error" aria-label="Excluir aula"><Trash2 size={16} /></button>
                  </div>
                  {alunos.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">Nenhum aluno na turma {turma?.nome}.</p>
                  ) : (
                    <>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-on-surface-variant">
                            <th className="py-2 pr-3">Aluno</th>
                            <th className="py-2 px-1">Chamada</th>
                            <th className="py-2 pl-3">Frequência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alunos.map(al => {
                            const f = calcularFrequencia({ aulas, registros, studentId: al.id });
                            return (
                              <tr key={al.id} className="border-t border-outline-variant/50">
                                <td className="py-1.5 pr-3 text-on-surface">{al.name}</td>
                                <td className="py-1.5 px-1">
                                  <select className="p-1.5 border border-outline-variant rounded-zela-md bg-surface" value={chamada[al.id] || 'presente'}
                                    onChange={e => setChamada({ ...chamada, [al.id]: e.target.value })} aria-label={`Chamada de ${al.name}`}>
                                    {STATUS_FREQUENCIA.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                </td>
                                <td className={`py-1.5 pl-3 ${corSituacao[f.situacao]}`}>
                                  {f.percentual === null ? '' : `${String(f.percentual).replace('.', ',')}%`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <button onClick={gravarChamada} disabled={salvando}
                        className="bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60">
                        {salvando ? 'Salvando...' : 'Salvar chamada'}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">Escolha uma aula para fazer a chamada.</p>
              )}
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
