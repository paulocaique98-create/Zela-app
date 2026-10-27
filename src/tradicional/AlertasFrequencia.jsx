import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { listarAulas, listarFrequencia, calcularFrequencia, LIMITE_FREQUENCIA } from './lib/frequencia';
import { listar, mensagemDeErro } from './lib/estrutura';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const ROTULO = { abaixo: 'Abaixo do mínimo', atencao: 'Atenção' };

// Fase 3 do Método Tradicional: a gestão vê, por turma, os alunos abaixo ou
// perto do mínimo de frequência em cada disciplina. Alerta em dourado.
export default function AlertasFrequencia({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [turmas, setTurmas] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [atribuicoes, setAtribuicoes] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const turma = turmas.find(t => t.id === turmaId);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [ts, ds, ats] = await Promise.all([
          listar('trad_turmas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_disciplinas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_atribuicoes', schoolId),
        ]);
        if (!ativo) return;
        setTurmas(ts); setDisciplinas(ds); setAtribuicoes(ats);
        setTurmaId(ts[0]?.id || '');
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!turma) { setAlunos([]); setAulas([]); setRegistros([]); return; }
      try {
        const ids = atribuicoes.filter(a => a.turma_id === turma.id).map(a => a.id);
        const [{ data: als, error: errAl }, as] = await Promise.all([
          supabase.from('students').select('id, name').eq('school_id', schoolId).eq('turma', turma.nome)
            .order('name', { ascending: true }).limit(300),
          listarAulas(schoolId, ids),
        ]);
        if (errAl) throw errAl;
        const rs = await listarFrequencia(schoolId, as.map(a => a.id));
        if (!ativo) return;
        setAlunos(als || []); setAulas(as); setRegistros(rs); setErro('');
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      }
    })();
    return () => { ativo = false; };
  }, [turma, atribuicoes, schoolId]);

  // Uma linha por aluno e disciplina que está abaixo ou perto do mínimo.
  const alertas = useMemo(() => {
    const doTurma = atribuicoes.filter(a => a.turma_id === turmaId);
    const linhas = [];
    for (const al of alunos) {
      for (const at of doTurma) {
        const f = calcularFrequencia({ aulas: aulas.filter(a => a.atribuicao_id === at.id), registros, studentId: al.id });
        if (f.situacao === 'abaixo' || f.situacao === 'atencao') {
          linhas.push({
            chave: `${al.id}:${at.id}`, aluno: al.name, f,
            disciplina: disciplinas.find(d => d.id === at.disciplina_id)?.nome || 'Disciplina',
          });
        }
      }
    }
    return linhas.sort((a, b) => a.f.percentual - b.f.percentual);
  }, [alunos, aulas, registros, atribuicoes, disciplinas, turmaId]);

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <UserCheck size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Frequência por disciplina</h2>
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3">{erro}</p>}
      {turmas.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Cadastre as turmas em Estrutura acadêmica primeiro.</p>
      ) : (
        <>
          <select className={`${campo} sm:max-w-xs`} value={turmaId} onChange={e => setTurmaId(e.target.value)} aria-label="Turma">
            {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <p className="text-xs text-on-surface-variant">
            Mostra quem está abaixo de {LIMITE_FREQUENCIA}% (mínimo da LDB) ou perto disso. Falta justificada conta como ausência.
          </p>
          {alertas.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhum aluno em alerta de frequência nesta turma.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-on-surface-variant">
                    <th className="py-2 pr-3">Aluno</th>
                    <th className="py-2 px-1">Disciplina</th>
                    <th className="py-2 px-1">Frequência</th>
                    <th className="py-2 px-1">Faltas</th>
                    <th className="py-2 pl-3">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.map(l => (
                    <tr key={l.chave} className="border-t border-outline-variant/50">
                      <td className="py-1.5 pr-3 text-on-surface">{l.aluno}</td>
                      <td className="py-1.5 px-1 text-on-surface">{l.disciplina}</td>
                      <td className="py-1.5 px-1 font-bold text-brass">{String(l.f.percentual).replace('.', ',')}%</td>
                      <td className="py-1.5 px-1 text-on-surface">{l.f.faltas} de {l.f.total}</td>
                      <td className="py-1.5 pl-3 font-bold text-brass">{ROTULO[l.f.situacao]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
