import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, Send, Undo2, Sprout } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { logAction } from '../lib/auditLog';
import { formatIdade, idadeEmMeses } from '../lib/sugestaoTurma';
import { SITUACOES, SITUACAO_LABEL, periodoAtual, mensagemErroMapa } from '../lib/mapaHabilidades';
import ConfirmModal from './ConfirmModal';
import { PageShell, Tabs } from './GestaoShared';
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

  const campo = 'border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary';
  const campoLista = `${campo} w-full h-10 appearance-none pr-8 truncate`;
  const seta = <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />;
  const anos = [inicial.ano - 1, inicial.ano];

  return (
    <PageShell>
      <div className="space-y-4">
        <Tabs
          equalOnMobile
          tabs={[{ id: 'acompanhamento', label: 'Acompanhamento' }, { id: 'catalogo', label: 'Habilidades' }]}
          active={aba}
          onChange={setAba}
        />
        {erro && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium mb-3">{erro}</div>}

        {aba === 'catalogo' ? (
          <MapaHabilidadesCatalogo currentUser={currentUser} schoolId={schoolId} podeEditar={podeCatalogo} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:flex gap-2">
              <div className="relative sm:w-28">
                <select value={ano} onChange={e => setAno(Number(e.target.value))} className={campoLista} aria-label="Ano">
                  {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>{seta}
              </div>
              <div className="relative sm:w-40">
                <select value={semestre} onChange={e => setSemestre(Number(e.target.value))} className={campoLista} aria-label="Semestre">
                  <option value={1}>1º Semestre</option>
                  <option value={2}>2º Semestre</option>
                </select>{seta}
              </div>
              <div className="relative col-span-2 sm:col-span-1 sm:flex-1">
                <select value={turma} onChange={e => { setTurma(e.target.value); setAberto(null); }} className={campoLista} aria-label="Turma">
                  {turmas.map(t => <option key={t} value={t}>{t}</option>)}
                </select>{seta}
              </div>
            </div>

            {podeEditarRegistros && turma && (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between rounded-zela-lg border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-xs text-on-surface-variant">
                  {rascunhosTurma} em rascunho e {publicadosTurma} publicados nesta turma. A família só vê o que for publicado.
                </p>
                <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                  <button type="button" disabled={rascunhosTurma === 0 || processando}
                    onClick={() => setConfirmar({ de: 'RASCUNHO', para: 'PUBLICADO' })}
                    className="flex items-center justify-center gap-2 h-10 bg-primary text-white px-3 sm:px-4 rounded-zela-md font-bold text-sm whitespace-nowrap disabled:bg-slate-300 disabled:text-on-surface-variant">
                    <Send size={15} className="shrink-0" /> <span className="sm:hidden">Publicar</span><span className="hidden sm:inline">Publicar para a família</span>
                  </button>
                  <button type="button" disabled={publicadosTurma === 0 || processando}
                    onClick={() => setConfirmar({ de: 'PUBLICADO', para: 'RASCUNHO' })}
                    className="flex items-center justify-center gap-2 h-10 border border-outline-variant px-3 rounded-zela-md font-bold text-sm text-on-surface disabled:opacity-40">
                    <Undo2 size={15} /> Despublicar
                  </button>
                </div>
              </div>
            )}

            {carregando ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
            ) : alunosDaTurma.length === 0 ? (
              <div className="flex flex-col items-center text-center py-14 bg-surface-container-lowest rounded-zela-xl border border-dashed border-outline-variant">
                <Sprout size={30} className="text-outline-variant mb-2" />
                <p className="text-sm font-semibold text-on-surface-variant">Nenhum aluno nesta turma.</p>
              </div>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2 items-start">
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
                    <li key={aluno.id} className={`rounded-zela-lg border bg-surface-container-lowest transition ${expandido ? 'border-primary/40 shadow-sm' : 'border-outline-variant'}`}>
                      <button type="button" onClick={() => setAberto(expandido ? null : aluno.id)} className="w-full flex items-center gap-3 p-3 text-left">
                        <span className="hidden sm:flex w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm items-center justify-center shrink-0">{(aluno.name || '?').trim().charAt(0).toUpperCase()}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-on-surface truncate">{aluno.name}</p>
                          <p className="text-xs text-on-surface-variant mt-0.5">{formatIdade(idadeEmMeses(aluno.birth_date))}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant">{regs.length} habilidade{regs.length !== 1 ? 's' : ''}</span>
                            {rasc > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">{rasc} em rascunho</span>}
                            {pub > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-success/10 text-success">{pub} publicada{pub !== 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                        {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {expandido && (
                        <div className="border-t border-outline-variant p-3 space-y-3">
                          {regs.length === 0 && <p className="text-xs text-on-surface-variant">A professora ainda não marcou nada neste semestre.</p>}
                          {[...porArea.entries()].map(([nomeArea, linhas]) => (
                            <div key={nomeArea}>
                              <p className="text-xs font-bold text-primary mb-1.5">{nomeArea}</p>
                              <ul className="space-y-1.5">
                                {linhas.map(({ r, h }) => (
                                  <li key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-sm bg-surface-container-low rounded-zela-md p-2.5">
                                    <span className="flex-1 text-on-surface">{h?.descricao || 'Habilidade removida'}</span>
                                    {podeEditarRegistros ? (
                                      <select value={r.situacao} onChange={e => corrigir(r, e.target.value)} className={`${campo} py-1 text-xs`} aria-label="Situação">
                                        {SITUACOES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                      </select>
                                    ) : (
                                      <span className="text-xs font-bold text-on-surface-variant">{SITUACAO_LABEL[r.situacao]}</span>
                                    )}
                                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${r.status === 'PUBLICADO' ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning'}`}>
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
    </PageShell>
  );
}
