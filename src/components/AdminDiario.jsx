import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Loader2, Minus, Plus, Search, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { REFEICOES } from '../lib/constants';
import { splitCardapioItens, mealAsksComeuTudo, normalizeItemServido } from '../lib/diarioUtils';
import { notifyFamilies } from '../lib/notifyFamilies';
import { useSchoolConfig } from '../lib/schoolConfig';

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Monta os "slots" de refeição do dia a partir do cardápio (itens do
// cardápio de hoje), na ordem canônica de REFEICOES, numerados
// sequencialmente só com o que existe naquele dia — se a escola não lançou
// "Café da Manhã" hoje, a primeira vira "1ª Refeição: Lanche da Manhã".
function buildSlotsFromCardapio(cardapioItens) {
  const byRefeicao = new Map(cardapioItens.map(i => [i.refeicao, i]));
  return REFEICOES
    .filter(r => byRefeicao.has(r))
    .map(r => ({
      refeicao: r,
      itensDisponiveis: splitCardapioItens(byRefeicao.get(r).descricao),
    }));
}

function emptyRefeicaoState(slot, saved) {
  return {
    refeicao: slot.refeicao,
    itensDisponiveis: slot.itensDisponiveis,
    itensSelecionados: (saved?.itens_servidos || []).map(normalizeItemServido),
    comeuTudo: saved?.comeu_tudo ?? null,
    observacaoRecusa: saved?.observacao_recusa || '',
    repetiu: saved?.repetiu ?? false,
    vezesRepetiu: saved?.vezes_repetiu || 1,
    observacaoRepeticao: saved?.observacao_repeticao || '',
  };
}

const segCls = (active) =>
  `flex-1 text-center py-2.5 rounded-zela-md text-xs font-bold border-2 transition-all ${active ? 'bg-primary text-white border-indigo-600' : 'bg-white text-on-surface-variant border-outline-variant hover:border-indigo-300'}`;

export default function AdminDiario({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const { turmas: schoolTurmas } = useSchoolConfig(schoolId);

  // Busca os alunos por conta própria (mesmo padrão de AdminStudentList.jsx)
  // em vez de usar o `students` que o AdminPortal repassa — aquele é uma
  // versão enxuta pro fluxo de check-in (id/name/status/contractedHours...)
  // e não inclui `turma`, o que quebraria o filtro por turma aqui.
  const [alunos, setAlunos] = useState([]);
  const [isLoadingAlunos, setIsLoadingAlunos] = useState(true);
  useEffect(() => {
    if (!schoolId) return;
    setIsLoadingAlunos(true);
    supabase
      .from('students')
      .select('id, name, turma, family_id')
      .eq('school_id', schoolId)
      .order('name', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          console.error('[AdminDiario] Erro ao buscar alunos:', fetchError);
        } else {
          setAlunos(data || []);
        }
        setIsLoadingAlunos(false);
      });
  }, [schoolId]);

  const [turmaFiltro, setTurmaFiltro] = useState('');
  // Texto de busca ativo (só usado enquanto o dropdown está aberto/sendo
  // digitado) — separado do nome do aluno já selecionado, pra trocar de
  // turma não deixar um nome antigo "preso" filtrando a lista escondida.
  const [buscaQuery, setBuscaQuery] = useState('');
  const [isAlunoDropdownOpen, setIsAlunoDropdownOpen] = useState(false);
  const alunosFiltrados = useMemo(() => {
    const termo = buscaQuery.trim().toLowerCase();
    return alunos.filter(s =>
      (!turmaFiltro || s.turma === turmaFiltro) &&
      (!termo || s.name.toLowerCase().includes(termo))
    );
  }, [alunos, turmaFiltro, buscaQuery]);

  // Começa sempre vazio — a pessoa precisa escolher o aluno explicitamente
  // antes de qualquer lançamento aparecer (evita editar o aluno errado por
  // engano, já que a lista tem muitos nomes parecidos).
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const selectedStudentName = alunos.find(a => a.id === selectedStudentId)?.name || '';
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const [refeicoesState, setRefeicoesState] = useState([]);
  const [sonoInicio, setSonoInicio] = useState('');
  const [sonoFim, setSonoFim] = useState('');
  const [evacuou, setEvacuou] = useState(null);
  const [aparenciaEvacuacao, setAparenciaEvacuacao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [existingId, setExistingId] = useState(null);
  const [existingCreatedBy, setExistingCreatedBy] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const selecionarAluno = (student) => {
    setSelectedStudentId(student.id);
    setIsAlunoDropdownOpen(false);
  };

  const abrirDropdownAluno = () => {
    setBuscaQuery('');
    setIsAlunoDropdownOpen(true);
  };

  useEffect(() => {
    const load = async () => {
      if (!selectedStudentId || !selectedDate || !schoolId) return;
      setIsLoading(true);
      setError('');
      setSuccessMsg('');
      try {
        const [cardapioRes, entryRes] = await Promise.all([
          supabase
            .from('cardapio_itens')
            .select('refeicao, descricao, cardapios!inner(school_id)')
            .eq('event_date', selectedDate)
            .eq('cardapios.school_id', schoolId),
          supabase
            .from('diario_entries')
            .select('*')
            .eq('student_id', selectedStudentId)
            .eq('entry_date', selectedDate)
            .maybeSingle(),
        ]);
        if (cardapioRes.error) throw cardapioRes.error;
        if (entryRes.error) throw entryRes.error;

        const slots = buildSlotsFromCardapio(cardapioRes.data || []);
        const savedByRefeicao = new Map((entryRes.data?.refeicoes || []).map(r => [r.refeicao, r]));
        setRefeicoesState(slots.map(slot => emptyRefeicaoState(slot, savedByRefeicao.get(slot.refeicao))));

        setSonoInicio(entryRes.data?.sono_inicio?.slice(0, 5) || '');
        setSonoFim(entryRes.data?.sono_fim?.slice(0, 5) || '');
        setEvacuou(entryRes.data?.evacuou ?? null);
        setAparenciaEvacuacao(entryRes.data?.aparencia_evacuacao || '');
        setObservacoes(entryRes.data?.observacoes || '');
        setExistingId(entryRes.data?.id || null);
        setExistingCreatedBy(entryRes.data?.created_by || null);
      } catch (err) {
        console.error('[AdminDiario] Erro ao carregar:', err);
        setError('Não foi possível carregar o diário desse dia.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedStudentId, selectedDate, schoolId]);

  const toggleItem = (idx, nome) => {
    setRefeicoesState(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const has = r.itensSelecionados.some(x => x.nome === nome);
      return {
        ...r,
        itensSelecionados: has
          ? r.itensSelecionados.filter(x => x.nome !== nome)
          : [...r.itensSelecionados, { nome, quantidade: '' }],
      };
    }));
  };

  const setItemQuantidade = (idx, nome, quantidade) => {
    setRefeicoesState(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      return { ...r, itensSelecionados: r.itensSelecionados.map(x => (x.nome === nome ? { ...x, quantidade } : x)) };
    }));
  };

  const patchRefeicao = (idx, patch) => {
    setRefeicoesState(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    if (!selectedStudentId) return;
    setIsSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const payload = {
        school_id: schoolId,
        student_id: selectedStudentId,
        entry_date: selectedDate,
        refeicoes: refeicoesState.map(r => ({
          refeicao: r.refeicao,
          itens_servidos: r.itensSelecionados,
          comeu_tudo: mealAsksComeuTudo(r.refeicao) ? r.comeuTudo : null,
          observacao_recusa: mealAsksComeuTudo(r.refeicao) && r.comeuTudo === false ? (r.observacaoRecusa.trim() || null) : null,
          repetiu: r.repetiu,
          vezes_repetiu: r.repetiu ? r.vezesRepetiu : 0,
          observacao_repeticao: r.repetiu ? (r.observacaoRepeticao.trim() || null) : null,
        })),
        sono_inicio: sonoInicio || null,
        sono_fim: sonoFim || null,
        evacuou,
        aparencia_evacuacao: evacuou === true ? (aparenciaEvacuacao.trim() || null) : null,
        observacoes: observacoes.trim() || null,
        created_by: existingCreatedBy || currentUser.id,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString(),
      };
      const { data, error: upsertError } = await supabase
        .from('diario_entries')
        .upsert(payload, { onConflict: 'student_id,entry_date' })
        .select('id, created_by')
        .single();
      if (upsertError) throw upsertError;
      setExistingId(data.id);
      setExistingCreatedBy(data.created_by);
      setSuccessMsg('Diário salvo com sucesso!');
      setTimeout(() => setSuccessMsg(''), 4000);

      // Notifica só os responsáveis desse aluno (titular via family_id +
      // eventual 2º responsável via student_guardians) — não é um aviso
      // geral da escola como cardápio/mural, é específico do filho deles.
      const aluno = alunos.find(a => a.id === selectedStudentId);
      const familyIdSet = new Set();
      if (aluno?.family_id) familyIdSet.add(aluno.family_id);
      const { data: guardianRows } = await supabase
        .from('student_guardians')
        .select('guardian_id')
        .eq('student_id', selectedStudentId);
      (guardianRows || []).forEach(g => familyIdSet.add(g.guardian_id));

      if (familyIdSet.size > 0) {
        notifyFamilies({
          type: 'diario',
          title: `Diário atualizado — ${aluno?.name || 'seu filho(a)'}`,
          message: 'Um novo lançamento no Diário está disponível.',
          url: '/?tab=diario',
          familyIds: Array.from(familyIdSet),
        });
      }
    } catch (err) {
      console.error('[AdminDiario] Erro ao salvar:', err);
      setError('Não foi possível salvar o diário.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <BookOpen size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Diário</h2>
          <p className="text-on-surface-variant text-small hidden sm:block">Lance refeições, sono, evacuação e observações do dia.</p>
        </div>
      </div>

      {isLoadingAlunos ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : alunos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-on-surface-variant/70">
          <BookOpen className="mx-auto h-12 w-12 text-outline-variant mb-3" />
          <p className="text-sm font-semibold text-on-surface-variant">Nenhum aluno cadastrado ainda.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Data</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                max={todayStr()}
                className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Turma</label>
              <select
                value={turmaFiltro}
                onChange={e => { setTurmaFiltro(e.target.value); setBuscaQuery(''); }}
                className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm"
              >
                <option value="">Todas as turmas</option>
                {schoolTurmas.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 relative">
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><User size={12} /> Aluno</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={16} />
                <input
                  type="text"
                  value={isAlunoDropdownOpen ? buscaQuery : selectedStudentName}
                  onChange={e => setBuscaQuery(e.target.value)}
                  onFocus={abrirDropdownAluno}
                  onBlur={() => setTimeout(() => setIsAlunoDropdownOpen(false), 150)}
                  placeholder="Digite o nome do aluno..."
                  className="w-full pl-9 pr-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-bold text-on-surface text-sm"
                />
              </div>
              {isAlunoDropdownOpen && (
                <div className="absolute z-10 mt-1.5 w-full max-h-64 overflow-y-auto bg-white border border-outline-variant rounded-zela-md shadow-lg">
                  {alunosFiltrados.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-on-surface-variant/70">Nenhum aluno encontrado.</div>
                  ) : (
                    alunosFiltrados.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={() => selecionarAluno(s)}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 transition ${s.id === selectedStudentId ? 'bg-primary/10 font-bold text-primary' : 'text-on-surface'}`}
                      >
                        {s.name}{s.turma ? <span className="text-on-surface-variant/70 font-normal"> — {s.turma}</span> : ''}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>}
          {successMsg && <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-zela-md text-sm font-medium">{successMsg}</div>}

          {!selectedStudentId ? (
            <div className="flex flex-col items-center justify-center text-center py-16 text-on-surface-variant/70">
              <User className="mx-auto h-12 w-12 text-outline-variant mb-3" />
              <p className="text-sm font-semibold text-on-surface-variant">Selecione um aluno acima para começar o lançamento.</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <>
              {refeicoesState.length === 0 ? (
                <div className="bg-surface-container-low border border-dashed border-outline-variant rounded-zela-lg p-4 text-sm text-on-surface-variant/70">
                  Nenhum cardápio lançado para {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR')} — só é possível preencher Sono, Evacuação e Observações.
                </div>
              ) : (
                refeicoesState.map((r, idx) => {
                  const pedeComeuTudo = mealAsksComeuTudo(r.refeicao);
                  return (
                  <div key={r.refeicao} className="border border-outline-variant rounded-zela-lg p-5 space-y-4">
                    <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{idx + 1}ª Refeição — {r.refeicao}</span>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface mb-2">Cardápio de hoje — o que a criança se serviu?</label>
                      <div className="flex flex-wrap gap-2">
                        {r.itensDisponiveis.map(item => {
                          const active = r.itensSelecionados.some(x => x.nome === item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleItem(idx, item)}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-zela-md text-xs font-bold border-2 transition-all ${active ? 'bg-primary text-white border-indigo-600' : 'bg-white text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}
                            >
                              {active && <Check size={13} />} {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {!pedeComeuTudo && r.itensSelecionados.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-on-surface">Quantidade por item (opcional)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {r.itensSelecionados.map(item => (
                            <div key={item.nome} className="flex items-center gap-2">
                              <span className="text-xs text-on-surface-variant flex-1 min-w-0 truncate">{item.nome}</span>
                              <input
                                type="text"
                                value={item.quantidade}
                                onChange={e => setItemQuantidade(idx, item.nome, e.target.value)}
                                placeholder="Ex: 1 unidade, meio prato..."
                                className="w-40 px-2.5 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={`grid grid-cols-1 ${pedeComeuTudo ? 'sm:grid-cols-2' : ''} gap-4`}>
                      {pedeComeuTudo && (
                        <div>
                          <label className="block text-xs font-semibold text-on-surface mb-2">Comeu tudo que serviu?</label>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => patchRefeicao(idx, { comeuTudo: true })} className={segCls(r.comeuTudo === true)}>Sim</button>
                            <button type="button" onClick={() => patchRefeicao(idx, { comeuTudo: false })} className={segCls(r.comeuTudo === false)}>Não</button>
                          </div>
                          {r.comeuTudo === false && (
                            <textarea
                              value={r.observacaoRecusa}
                              onChange={e => patchRefeicao(idx, { observacaoRecusa: e.target.value })}
                              rows={2}
                              placeholder="Ex.: O que a criança recusou?"
                              className="w-full mt-2 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-xs text-on-surface resize-none"
                            />
                          )}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-on-surface mb-2">Repetiu?</label>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => patchRefeicao(idx, { repetiu: true })} className={segCls(r.repetiu === true)}>Sim</button>
                          <button type="button" onClick={() => patchRefeicao(idx, { repetiu: false })} className={segCls(r.repetiu === false)}>Não</button>
                        </div>
                      </div>
                    </div>

                    {r.repetiu && (
                      <div className="space-y-2">
                        <div className="max-w-[220px]">
                          <label className="block text-xs font-semibold text-on-surface mb-2">Quantas vezes repetiu?</label>
                          <div className="flex items-center gap-3 p-2 rounded-zela-md bg-surface-container-low border border-outline-variant w-fit">
                            <button type="button" onClick={() => patchRefeicao(idx, { vezesRepetiu: Math.max(1, r.vezesRepetiu - 1) })} className="w-8 h-8 rounded-lg bg-white border border-outline-variant flex items-center justify-center text-primary hover:bg-primary/10 transition"><Minus size={14} /></button>
                            <span className="text-sm font-bold text-on-surface w-4 text-center">{r.vezesRepetiu}</span>
                            <button type="button" onClick={() => patchRefeicao(idx, { vezesRepetiu: r.vezesRepetiu + 1 })} className="w-8 h-8 rounded-lg bg-white border border-outline-variant flex items-center justify-center text-primary hover:bg-primary/10 transition"><Plus size={14} /></button>
                          </div>
                        </div>
                        <textarea
                          value={r.observacaoRepeticao}
                          onChange={e => patchRefeicao(idx, { observacaoRepeticao: e.target.value })}
                          rows={2}
                          placeholder="Ex.: O que a criança repetiu?"
                          className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-xs text-on-surface resize-none"
                        />
                      </div>
                    )}
                  </div>
                  );
                })
              )}

              <div className="border border-outline-variant rounded-zela-lg p-5">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Sono</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface mb-1.5">Dormiu das</label>
                    <input type="time" value={sonoInicio} onChange={e => setSonoInicio(e.target.value)} className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface mb-1.5">Até</label>
                    <input type="time" value={sonoFim} onChange={e => setSonoFim(e.target.value)} className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm" />
                  </div>
                </div>
              </div>

              <div className="border border-outline-variant rounded-zela-lg p-5">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Evacuação</span>
                <div className="flex gap-2 mt-3 max-w-[320px]">
                  <button type="button" onClick={() => setEvacuou(true)} className={segCls(evacuou === true)}>Sim</button>
                  <button type="button" onClick={() => { setEvacuou(false); setAparenciaEvacuacao(''); }} className={segCls(evacuou === false)}>Não</button>
                </div>
                {evacuou === true && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-on-surface mb-1.5">Aparência da evacuação</label>
                    <input
                      type="text"
                      value={aparenciaEvacuacao}
                      onChange={e => setAparenciaEvacuacao(e.target.value)}
                      placeholder="Ex.: Normal, pastosa, líquida..."
                      className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm text-on-surface"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-2">Observações</label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  rows={3}
                  placeholder="Observações livres sobre o dia da criança..."
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm text-on-surface resize-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:opacity-70 text-white px-6 py-3 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {existingId ? 'Salvar Alterações' : 'Salvar Lançamento'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
