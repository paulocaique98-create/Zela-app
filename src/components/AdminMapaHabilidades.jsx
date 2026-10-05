import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, Send, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { logAction } from '../lib/auditLog';
import { formatIdade, idadeEmMeses } from '../lib/sugestaoTurma';
import { SITUACOES, SITUACAO_LABEL, periodoAtual, mensagemErroMapa } from '../lib/mapaHabilidades';
import ConfirmModal from './ConfirmModal';
import MapaHabilidadesCatalogo from './MapaHabilidadesCatalogo';

// Coordenação e Direção Pedagógica revisam, corrigem e publicam. Nunca criam
// registro do zero (a professora cria) e a RLS garante isso no banco.
const DEPARTAMENTOS_EDITORES = ['coordenacao', 'diretoria_pedagogica'];
const ROLES_EDITORES = ['admin', 'gestao_pedagogica'];

const COLUNAS_REGISTRO = 'id, student_id, habilidade_id, ano, semestre, situacao, status';

export default function AdminMapaHabilidades({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const podeEditarRegistros = ROLES_EDITORES.includes(currentUser?.role) && DEPARTAMENTOS_EDITORES.includes(currentUser?.departamento);
  const podeCatalogo = podeEditarRegistros || currentUser?.role === 'gestao';
  const inicial = periodoAtual();

  const [aba, setAba] = useState('acompanhamento');
  const [ano, setAno] = useState(inicial.ano);
  const [semestre, setSemestre] = useState(inicial.semestre);
  const [alunos, setAlunos] = useState([]);
  const [habilidades, setHabilidades] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [turma, setTurma] = useState('');
  const [aberto, setAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const carregar = useCallback(async () => {
    if (!schoolId) return;
    setCarregando(true);
    setErro('');
    try {
      const [alu, hab, regs] = await Promise.all([
        buscarTodos(() => supabase.from('students').select('id, name, turma, birth_date')
          .eq('school_id', schoolId).eq('enrollment_status', 'ativo').order('id', { ascending: true })),
        buscarTodos(() => supabase.from('mapa_habilidades').select('id, area, descricao')
          .eq('school_id', schoolId).order('id', { ascending: true })),
        buscarTodos(() => supabase.from('mapa_habilidades_registros').select(COLUNAS_REGISTRO)
          .eq('school_id', schoolId).eq('ano', ano).eq('semestre', semestre).order('id', { ascending: true })),
      ]);
      setAlunos(alu);
      setHabilidades(hab);
      setRegistros(regs);
    } catch (e) {
      console.error('[AdminMapaHabilidades] Erro ao carregar:', e);
      setErro(mensagemErroMapa(e, 'Não foi possível carregar o Mapa de Habilidades.'));
    } finally {
      setCarregando(false);
    }
  }, [schoolId, ano, semestre]);

  useEffect(() => { if (aba === 'acompanhamento') carregar(); }, [carregar, aba]);

  const turmas = useMemo(() => [...new Set(alunos.map(a => a.turma).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [alunos]);
  useEffect(() => { if (!turma && turmas.length) setTurma(turmas[0]); }, [turmas, turma]);

  const habPorId = useMemo(() => new Map(habilidades.map(h => [h.id, h])), [habilidades]);
  const alunosDaTurma = useMemo(() => alunos.filter(a => a.turma === turma).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [alunos, turma]);
  const regsPorAluno = useMemo(() => {
    const mapa = new Map();
    for (const r of registros) mapa.set(r.student_id, [...(mapa.get(r.student_id) || []), r]);
    return mapa;
  }, [registros]);

  const idsTurma = alunosDaTurma.map(a => a.id);
  const rascunhosTurma = registros.filter(r => idsTurma.includes(r.student_id) && r.status === 'RASCUNHO').length;
  const publicadosTurma = registros.filter(r => idsTurma.includes(r.student_id) && r.status === 'PUBLICADO').length;

  const corrigir = async (registro, situacao) => {
    if (!podeEditarRegistros || registro.situacao === situacao) return;
    setErro('');
    const { data, error } = await supabase.from('mapa_habilidades_registros')
      .update({ situacao }).eq('id', registro.id).eq('school_id', schoolId).select(COLUNAS_REGISTRO).single();
    if (error) { setErro('Não foi possível salvar a correção.'); return; }
    setRegistros(prev => prev.map(r => (r.id === data.id ? data : r)));
  };

  // Publica (ou volta para rascunho) todos os registros da turma no semestre.
  const mudarStatus = async ({ de, para }) => {
    setProcessando(true);
    setErro('');
    try {
      const { data, error } = await supabase.from('mapa_habilidades_registros')
        .update({ status: para })
        .eq('school_id', schoolId).eq('ano', ano).eq('semestre', semestre).eq('status', de)
        .in('student_id', idsTurma)
        .select('id');
      if (error) throw error;
      await logAction({
        schoolId, actorId: currentUser.id,
        action: para === 'PUBLICADO' ? 'mapa_habilidades_publicar' : 'mapa_habilidades_despublicar',
        entityType: 'mapa_habilidades', details: { turma, ano, semestre, quantidade: data?.length || 0 },
      });
      await carregar();
    } catch (e) {
      console.error('[AdminMapaHabilidades] Erro ao mudar status:', e);
      setErro(mensagemErroMapa(e, 'Não foi possível concluir a ação.'));
    } finally {
      setProcessando(false);
      setConfirmar(null);
    }
  };

  const campo = 'border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-white text-on-surface';
  const anos = [inicial.ano - 1, inicial.ano];

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 rounded-none sm:rounded-zela-xl border-0 sm:border sm:border-outline-variant overflow-hidden">
      <div className="flex gap-1 p-3 border-b border-outline-variant shrink-0">
        {[['acompanhamento', 'Acompanhamento'], ['catalogo', 'Habilidades']].map(([id, rotulo]) => (
          <button key={id} type="button" onClick={() => setAba(id)}
            className={`px-4 py-2 rounded-zela-md text-sm font-bold ${aba === id ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {erro && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium mb-3">{erro}</div>}

        {aba === 'catalogo' ? (
          <MapaHabilidadesCatalogo currentUser={currentUser} schoolId={schoolId} podeEditar={podeCatalogo} />
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={ano} onChange={e => setAno(Number(e.target.value))} className={campo} aria-label="Ano">
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={semestre} onChange={e => setSemestre(Number(e.target.value))} className={campo} aria-label="Semestre">
                <option value={1}>1º Semestre</option>
                <option value={2}>2º Semestre</option>
              </select>
              <select value={turma} onChange={e => { setTurma(e.target.value); setAberto(null); }} className={`${campo} flex-1`} aria-label="Turma">
                {turmas.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {podeEditarRegistros && turma && (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between rounded-zela-lg border border-outline-variant p-3">
                <p className="text-xs text-on-surface-variant">
                  {rascunhosTurma} em rascunho e {publicadosTurma} publicados nesta turma. A família só vê o que for publicado.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button type="button" disabled={rascunhosTurma === 0 || processando}
                    onClick={() => setConfirmar({ de: 'RASCUNHO', para: 'PUBLICADO' })}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-zela-md font-bold text-sm disabled:bg-slate-300 disabled:text-on-surface-variant">
                    <Send size={15} /> Publicar para a família
                  </button>
                  <button type="button" disabled={publicadosTurma === 0 || processando}
                    onClick={() => setConfirmar({ de: 'PUBLICADO', para: 'RASCUNHO' })}
                    className="flex items-center gap-2 border border-outline-variant px-3 py-2 rounded-zela-md font-bold text-sm text-on-surface disabled:opacity-40">
                    <Undo2 size={15} /> Despublicar
                  </button>
                </div>
              </div>
            )}

            {carregando ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : alunosDaTurma.length === 0 ? (
              <p className="text-center text-sm text-on-surface-variant py-12">Nenhum aluno nesta turma.</p>
            ) : (
              <ul className="space-y-2">
                {alunosDaTurma.map(aluno => {
                  const regs = regsPorAluno.get(aluno.id) || [];
                  const rasc = regs.filter(r => r.status === 'RASCUNHO').length;
                  const pub = regs.length - rasc;
                  const expandido = aberto === aluno.id;
                  const porArea = new Map();
                  for (const r of regs) {
                    const h = habPorId.get(r.habilidade_id);
                    const a = h?.area || 'Sem área';
                    porArea.set(a, [...(porArea.get(a) || []), { r, h }]);
                  }
                  return (
                    <li key={aluno.id} className="rounded-zela-md border border-outline-variant">
                      <button type="button" onClick={() => setAberto(expandido ? null : aluno.id)} className="w-full flex items-center gap-3 p-3 text-left">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-on-surface truncate">{aluno.name}</p>
                          <p className="text-[11px] text-on-surface-variant">
                            {formatIdade(idadeEmMeses(aluno.birth_date))} · {regs.length} habilidades marcadas
                            {rasc > 0 && ` · ${rasc} em rascunho`}{pub > 0 && ` · ${pub} publicadas`}
                          </p>
                        </div>
                        {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {expandido && (
                        <div className="border-t border-outline-variant p-3 space-y-3">
                          {regs.length === 0 && <p className="text-xs text-on-surface-variant">A professora ainda não marcou nada neste semestre.</p>}
                          {[...porArea.entries()].map(([nomeArea, linhas]) => (
                            <div key={nomeArea}>
                              <p className="text-[10px] font-extrabold uppercase text-primary mb-1">{nomeArea}</p>
                              <ul className="space-y-1.5">
                                {linhas.map(({ r, h }) => (
                                  <li key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-sm">
                                    <span className="flex-1 text-on-surface">{h?.descricao || 'Habilidade removida'}</span>
                                    {podeEditarRegistros ? (
                                      <select value={r.situacao} onChange={e => corrigir(r, e.target.value)} className={`${campo} py-1 text-xs`} aria-label="Situação">
                                        {SITUACOES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                      </select>
                                    ) : (
                                      <span className="text-xs font-bold text-on-surface-variant">{SITUACAO_LABEL[r.situacao]}</span>
                                    )}
                                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border w-fit ${r.status === 'PUBLICADO' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
                                      {r.status === 'PUBLICADO' ? 'Publicado' : 'Rascunho'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {confirmar && (
        <ConfirmModal
          title={confirmar.para === 'PUBLICADO' ? 'Publicar para a família' : 'Voltar para rascunho'}
          message={confirmar.para === 'PUBLICADO'
            ? `Publicar o Mapa de Habilidades da turma ${turma} (${semestre}º semestre de ${ano})? As famílias passam a ver as habilidades marcadas.`
            : `Tirar da vista das famílias o mapa da turma ${turma} (${semestre}º semestre de ${ano})? Os registros voltam a ser rascunho.`}
          confirmLabel={confirmar.para === 'PUBLICADO' ? 'Publicar' : 'Despublicar'}
          danger={false}
          isLoading={processando}
          onConfirm={() => mudarStatus(confirmar)}
          onCancel={() => setConfirmar(null)}
        />
      )}
    </div>
  );
}
