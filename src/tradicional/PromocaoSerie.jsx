import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { listar, mensagemDeErro } from './lib/estrutura';
import { listarResultados, rotuloSituacao } from './lib/boletim';
import { ACOES, promoverAluno, proporPromocao } from './lib/promocao';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
// Alerta em dourado (brass), nunca vermelho.
const corAcao = (a) => (a === 'sobe' || a === 'concluinte' ? 'text-primary' : 'text-brass');

// Fase 5A do Método Tradicional: promoção de série a partir do resultado
// fechado. Só Coordenação e Direção (RLS de trad_resultados e de students).
export default function PromocaoSerie({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [turmas, setTurmas] = useState([]);
  const [series, setSeries] = useState([]);
  const [segmentos, setSegmentos] = useState([]);
  const [anos, setAnos] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [anoDestinoId, setAnoDestinoId] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [resultados, setResultados] = useState([]);
  const [escolhas, setEscolhas] = useState({}); // studentId -> turma destino id
  const [marcados, setMarcados] = useState({});
  const [confirmando, setConfirmando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const turma = turmas.find(t => t.id === turmaId);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [ts, ss, sgs, { data: anosData, error: errAnos }] = await Promise.all([
          listar('trad_turmas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_series', schoolId, { ordenarPor: 'ordem' }),
          listar('trad_segmentos', schoolId, { ordenarPor: 'ordem' }),
          supabase.from('school_years').select('id, name, starts_on').eq('school_id', schoolId)
            .order('starts_on', { ascending: false }).limit(50),
        ]);
        if (errAnos) throw errAnos;
        if (!ativo) return;
        setTurmas(ts); setSeries(ss); setSegmentos(sgs); setAnos(anosData || []);
        setTurmaId(ts[0]?.id || '');
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId]);

  // Ano de destino: o mais recente diferente do ano da turma de origem.
  useEffect(() => {
    if (!turma) return;
    setAnoDestinoId(atual => (atual && atual !== turma.school_year_id ? atual
      : anos.find(a => a.id !== turma.school_year_id)?.id || ''));
  }, [turma, anos]);

  const carregarTurma = useCallback(async () => {
    if (!turma) { setAlunos([]); setResultados([]); return; }
    const [{ data: als, error }, res] = await Promise.all([
      supabase.from('students').select('id, name').eq('school_id', schoolId).eq('turma', turma.nome)
        .order('name', { ascending: true }).limit(300),
      listarResultados(schoolId, turma.id),
    ]);
    if (error) throw error;
    setAlunos(als || []); setResultados(res); setEscolhas({}); setMarcados({});
  }, [turma, schoolId]);

  useEffect(() => {
    let ativo = true;
    carregarTurma().then(() => { if (ativo) setErro(''); }).catch(e => { if (ativo) setErro(mensagemDeErro(e)); });
    return () => { ativo = false; };
  }, [carregarTurma]);

  const propostas = useMemo(() => {
    if (!turma) return [];
    const turmasDestinoAno = turmas.filter(t => t.school_year_id === anoDestinoId);
    return alunos.map(al => {
      const resultado = resultados.find(r => r.student_id === al.id) || null;
      return { aluno: al, resultado, ...proporPromocao({ resultado, turmaOrigem: turma, series, segmentos, turmasDestinoAno }) };
    });
  }, [alunos, resultados, turma, turmas, series, segmentos, anoDestinoId]);

  const destinoDe = (p) => escolhas[p.aluno.id] || p.turmaSugerida?.id || '';
  const promovivel = (p) => (p.acao === 'sobe' || p.acao === 'repete') && p.turmasDestino.length > 0;
  const selecionados = propostas.filter(p => promovivel(p) && marcados[p.aluno.id] !== false && destinoDe(p));

  const promover = async () => {
    setSalvando(true); setErro(''); setAviso('');
    let feitos = 0; let falhas = 0;
    for (const p of selecionados) {
      const destino = turmas.find(t => t.id === destinoDe(p));
      try {
        if (await promoverAluno(schoolId, { studentId: p.aluno.id, turmaOrigemNome: turma.nome, turmaDestinoNome: destino.nome })) feitos++;
        else falhas++;
      } catch { falhas++; }
    }
    setConfirmando(false);
    try { await carregarTurma(); } catch (e) { setErro(mensagemDeErro(e)); }
    setAviso(`${feitos} aluno(s) promovido(s)${falhas ? `, ${falhas} não puderam ser movidos` : ''}.`);
    setSalvando(false);
  };

  if (carregando) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-on-surface flex items-center gap-2"><ArrowUpCircle size={20} className="text-primary" /> Promoção de série</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Parte do resultado final fechado. Aprovado sobe de série, reprovado repete, e quem está em recuperação final
          só entra depois que o resultado for fechado como aprovado ou reprovado em Boletim e resultado.
        </p>
      </div>

      {erro && <p className="text-sm text-brass">{erro}</p>}
      {aviso && <p className="text-sm text-primary">{aviso}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-on-surface">Turma de origem
          <select className={`${campo} mt-1`} value={turmaId} onChange={e => { setTurmaId(e.target.value); setConfirmando(false); }}>
            {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-on-surface">Ano letivo de destino
          <select className={`${campo} mt-1`} value={anoDestinoId} onChange={e => setAnoDestinoId(e.target.value)}>
            <option value="">Escolha o ano</option>
            {anos.filter(a => a.id !== turma?.school_year_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>

      {!anoDestinoId && <p className="text-sm text-brass">Crie o ano letivo e as turmas de destino em Estrutura acadêmica antes de promover.</p>}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-on-surface-variant border-b border-outline-variant">
              <th className="p-3 w-10"></th>
              <th className="p-3">Aluno</th>
              <th className="p-3">Resultado</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Turma de destino</th>
            </tr>
          </thead>
          <tbody>
            {propostas.length === 0 && <tr><td colSpan={5} className="p-4 text-on-surface-variant">Nenhum aluno nesta turma.</td></tr>}
            {propostas.map(p => (
              <tr key={p.aluno.id} className="border-b border-outline-variant last:border-0">
                <td className="p-3">
                  <input type="checkbox" disabled={!promovivel(p)} checked={promovivel(p) && marcados[p.aluno.id] !== false}
                    onChange={e => setMarcados(m => ({ ...m, [p.aluno.id]: e.target.checked }))} aria-label={`Promover ${p.aluno.name}`} />
                </td>
                <td className="p-3 font-medium text-on-surface">{p.aluno.name}</td>
                <td className="p-3">{p.resultado ? rotuloSituacao(p.resultado.situacao) : 'Sem resultado'}</td>
                <td className={`p-3 ${corAcao(p.acao)}`}>{ACOES[p.acao]}</td>
                <td className="p-3">
                  {promovivel(p) ? (
                    <select className={campo} value={destinoDe(p)} onChange={e => setEscolhas(s => ({ ...s, [p.aluno.id]: e.target.value }))}>
                      {p.turmasDestino.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  ) : (p.acao === 'sobe' || p.acao === 'repete')
                    ? <span className="text-brass">{anoDestinoId ? `Sem turma de ${p.serieDestino?.nome || 'destino'} neste ano` : '·'}</span>
                    : '·'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!confirmando ? (
          <button type="button" disabled={!selecionados.length || salvando} onClick={() => setConfirmando(true)}
            className="px-4 py-2.5 rounded-zela-md bg-primary text-on-primary font-medium disabled:opacity-50">
            Promover {selecionados.length} aluno(s)
          </button>
        ) : (
          <>
            <span className="text-sm text-on-surface">Confirma mover {selecionados.length} aluno(s) para as turmas escolhidas? O histórico e os resultados do ano atual não são apagados.</span>
            <button type="button" disabled={salvando} onClick={promover}
              className="px-4 py-2.5 rounded-zela-md bg-primary text-on-primary font-medium disabled:opacity-50">
              {salvando ? 'Promovendo...' : 'Confirmar'}
            </button>
            <button type="button" disabled={salvando} onClick={() => setConfirmando(false)}
              className="px-4 py-2.5 rounded-zela-md border border-outline-variant text-on-surface">Cancelar</button>
          </>
        )}
      </div>
    </div>
  );
}
