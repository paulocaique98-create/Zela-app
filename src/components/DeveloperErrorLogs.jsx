import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, CheckCircle2, RotateCcw, Bug, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

const SOURCE_LABELS = {
  client: 'Frontend',
  edge_function: 'Edge Function',
  cron: 'Cron',
  business: 'Negócio',
  face_recognition: 'Reconhecimento Facial',
};

const SEVERITY_CLS = {
  warn: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  error: 'bg-error/15 text-error border-error/30',
  critical: 'bg-error/25 text-error border-error/50',
};

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Hoje' },
  { id: '7days', label: 'Semana' },
  { id: '30days', label: 'Mês' },
  { id: 'all', label: 'Tudo' },
];

// Fase E do PLANO_TELA_DE_ORIGEM_NOS_LOGS.md — id técnico da aba (ver
// adminTab/familyTab/teacherTab em App.jsx e activeTab em
// DeveloperLayout.jsx, prefixado 'dev-') → rótulo amigável pro log. Ids sem
// entrada aqui mostram o id cru (fallback, nunca quebra por aba nova sem
// mapear ainda).
const SCREEN_LABELS = {
  // Admin
  home: 'Início', register: 'Cadastro de Usuário', 'cadastro-funcionarios': 'Cadastro de Funcionário',
  users: 'Gestão de Usuários', students: 'Alunos', 'gerenciar-funcionarios': 'Gestão de Funcionários',
  matriculas: 'Matrículas', 'ficha-medica': 'Ficha Médica',
  monitor: 'Monitor', kiosk: 'Autoatendimento', presence: 'Presença Diária', history: 'Histórico Geral',
  'horas-extras': 'Horas Extras', 'attendance-corrections': 'Correções de Presença',
  calendario: 'Calendário', 'mural-fotos': 'Mural de Fotos', cardapio: 'Cardápio', diario: 'Diário',
  materias: 'Matérias/Disciplinas', frequencia: 'Frequência', 'cadastro-comunicados': 'Comunicados',
  financeiro: 'Financeiro', auditoria: 'Auditoria', 'duplicidade-biometrica': 'Duplicidade Facial',
  settings: 'Configurações',
  // Family (alguns ids coincidem com o Admin acima, mesmo rótulo serve)
  acompanhamento: 'Acompanhamento', authorized: 'Autorizados', 'gerenciar-responsaveis': 'Responsáveis',
  registration: 'Dados Cadastrais', comunicados: 'Comunicados',
  // Developer (prefixo 'dev-' -- estado isolado do DeveloperLayout.jsx)
  'dev-schools': 'Gestão de Escolas', 'dev-logs': 'Logs de Erro', 'dev-support': 'Suporte',
  'dev-settings': 'Configurações (Dev)', 'dev-billing': 'Faturamento',
};

function screenLabel(screen) {
  if (!screen) return null;
  return SCREEN_LABELS[screen] || screen;
}

// Fase D do PLANO_LOGGING_ERROS_PORTAL_DEV.md — tela unificada lendo
// error_logs (Fase A/B1). Cada linha já é 1 fingerprint (a deduplicação
// acontece na própria RPC log_error, não aqui), então "agrupar" é só listar
// -- ordenado por mais frequente por padrão, não por mais recente, pra um
// erro raro-mas-crítico não ficar escondido atrás de ruído recente.
// A aba "Legado" (client_error_logs, DeveloperLogs.jsx) foi removida depois
// da Fase F (migração adiantada, ver errorLogger.js > logClientError):
// crash de tela/promise rejeitada agora grava direto em error_logs
// (source='client'), então essa tela sozinha já cobre tudo. A tabela
// client_error_logs em si não foi apagada, só parou de receber linha nova
// -- histórico antigo continua consultável via SQL Editor se precisar.
// edge_function_logs/cron_job_logs também continuam existindo à parte
// (cron_job_logs é heartbeat de sucesso E falha, semântica diferente).
export default function DeveloperErrorLogs({ currentUser }) {
  const [logs, setLogs] = useState([]);
  const [schools, setSchools] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [resolutionNoteDraft, setResolutionNoteDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Fase D do PLANO_IA_RESUMO_ERROS.md — id do log com pedido de explicação
  // por IA em andamento (só 1 por vez, é sob demanda/manual).
  const [explainingId, setExplainingId] = useState(null);
  const [explainError, setExplainError] = useState('');

  const [source, setSource] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [schoolId, setSchoolId] = useState('all');
  const [screenFilter, setScreenFilter] = useState('all');
  const [period, setPeriod] = useState('today');
  const [showResolved, setShowResolved] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('occurrences'); // 'occurrences' | 'last_seen_at'

  // Modelo 10 (período dentro do título) validado com o usuário (proposta
  // com 10 layouts, 18/09) -- período vira parte do cabeçalho, clicável
  // (menu pequeno em vez de barra de chips própria); o resto dos filtros
  // fica atrás de um único botão "Filtros", igual ao Modelo 01 (já usado em
  // Horas Extras/Histórico) -- juntos, devolvem 3 linhas inteiras de altura
  // pra lista de logs, que era a reclamação original.
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const periodMenuRef = useRef(null);
  const filtersRef = useRef(null);

  useEffect(() => {
    if (!periodMenuOpen) return;
    const onClick = (e) => { if (periodMenuRef.current && !periodMenuRef.current.contains(e.target)) setPeriodMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [periodMenuOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onClick = (e) => { if (filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [filtersOpen]);

  const activeFilterCount = [
    source !== 'all', severity !== 'all', schoolId !== 'all', screenFilter !== 'all',
    sortBy !== 'occurrences', showResolved, searchTerm.trim().length > 0,
  ].filter(Boolean).length;

  const schoolNameById = useMemo(() => {
    const map = {};
    schools.forEach(s => { map[s.id] = s.name || s.school_code; });
    return map;
  }, [schools]);

  useEffect(() => {
    supabase.from('schools').select('id, name, school_code').then(({ data }) => setSchools(data || []));
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      let query = supabase.from('error_logs').select('*').limit(300);

      if (source !== 'all') query = query.eq('source', source);
      if (severity !== 'all') query = query.eq('severity', severity);
      if (schoolId !== 'all') query = query.eq('school_id', schoolId);
      if (screenFilter !== 'all') query = query.eq('screen', screenFilter);
      if (!showResolved) query = query.eq('resolved', false);

      if (period !== 'all') {
        const now = new Date();
        const start = new Date(now);
        if (period === 'today') start.setHours(0, 0, 0, 0);
        else if (period === '7days') start.setDate(start.getDate() - 6);
        else if (period === '30days') start.setDate(start.getDate() - 29);
        query = query.gte('last_seen_at', start.toISOString());
      }

      query = query.order(sortBy, { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('[DeveloperErrorLogs] Erro ao buscar logs:', err);
      setErrorMsg('Não foi possível carregar os logs de erro.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, severity, schoolId, screenFilter, period, showResolved, sortBy]);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return logs;
    return logs.filter(l =>
      l.message.toLowerCase().includes(term) ||
      l.category.toLowerCase().includes(term)
    );
  }, [logs, searchTerm]);

  // Resumo rápido por categoria -- especialmente útil filtrando por
  // Reconhecimento Facial: responde de cara "a maioria das falhas é
  // below_threshold (sugere afrouxar o limiar) ou frame_position_rejected
  // (sugere problema de enquadramento/hardware)?" sem abrir cada linha.
  const categoryCounts = useMemo(() => {
    const counts = new Map();
    for (const l of filtered) {
      counts.set(l.category, (counts.get(l.category) || 0) + l.occurrences);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // Fase E do PLANO_TELA_DE_ORIGEM_NOS_LOGS.md — só oferece no filtro as
  // telas que de fato têm log no momento (baseado em `logs`, não em
  // `filtered`, pra não sumir a opção assim que o usuário aplica ela).
  const screensInLogs = useMemo(() => {
    const set = new Set(logs.map(l => l.screen).filter(Boolean));
    return Array.from(set).sort((a, b) => screenLabel(a).localeCompare(screenLabel(b)));
  }, [logs]);

  const handleResolve = async (log) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('error_logs').update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: currentUser?.id || null,
        resolution_note: resolutionNoteDraft || null,
      }).eq('id', log.id);
      if (error) throw error;
      setLogs(prev => showResolved ? prev.map(l => l.id === log.id ? { ...l, resolved: true } : l) : prev.filter(l => l.id !== log.id));
      setExpandedId(null);
      setResolutionNoteDraft('');
    } catch (err) {
      console.error('[DeveloperErrorLogs] Erro ao resolver log:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReopen = async (log) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('error_logs').update({
        resolved: false, resolved_at: null, resolved_by: null, resolution_note: null,
      }).eq('id', log.id);
      if (error) throw error;
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, resolved: false } : l));
    } catch (err) {
      console.error('[DeveloperErrorLogs] Erro ao reabrir log:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Fase D do PLANO_IA_RESUMO_ERROS.md — chama a edge function sob demanda.
  // `force`: ignora o cache e gera de novo (botão "Gerar de novo"), conta
  // pro rate limit; sem force, a function já retorna o valor cacheado se
  // já existir, sem gastar chamada nova de IA.
  const handleExplainWithAI = async (log, force = false) => {
    setExplainingId(log.id);
    setExplainError('');
    try {
      const { data, error } = await supabase.functions.invoke('explain-error-log', {
        body: { log_id: log.id, force },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, ai_summary: data.ai_summary } : l));
    } catch (err) {
      console.error('[DeveloperErrorLogs] Erro ao pedir explicação por IA:', err);
      setExplainError(err.message || 'Não foi possível gerar a explicação agora.');
    } finally {
      setExplainingId(null);
    }
  };

  const periodLabel = PERIOD_OPTIONS.find(p => p.id === period)?.label || 'Período';

  return (
    <div className="h-full flex flex-col bg-dev-surface rounded-zela-xl border border-dev-border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-dev-border shrink-0 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-dev-primary-container p-2.5 rounded-zela-md text-dev-primary shrink-0">
            <Bug size={20} />
          </div>
          <div className="min-w-0 relative" ref={periodMenuRef}>
            <button
              onClick={() => setPeriodMenuOpen(o => !o)}
              className="text-h3 text-dev-text flex items-center gap-1.5 hover:text-dev-primary transition"
            >
              <span className="truncate">Logs de erro</span>
              <span className="text-dev-primary whitespace-nowrap">— {periodLabel}</span>
              <ChevronDown size={14} className={`text-dev-primary transition-transform shrink-0 ${periodMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {periodMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-40 bg-dev-surface border border-dev-border rounded-zela-md shadow-lg z-20 p-1">
                {PERIOD_OPTIONS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setPeriod(p.id); setPeriodMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition ${period === p.id ? 'bg-dev-primary-container text-dev-primary' : 'text-dev-text-muted hover:bg-dev-surface-high'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative" ref={filtersRef}>
                <button
                  onClick={() => setFiltersOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filtersOpen ? 'bg-dev-primary-container text-dev-primary border-dev-primary/40' : 'bg-dev-bg text-dev-text-muted border-dev-border hover:text-dev-text'}`}
                >
                  <SlidersHorizontal size={13} /> Filtros
                  {activeFilterCount > 0 && (
                    <span className="bg-dev-primary text-dev-bg text-[9px] font-black rounded-full px-1.5">{activeFilterCount}</span>
                  )}
                </button>
                {filtersOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 max-w-[calc(100vw-2.5rem)] bg-dev-surface border border-dev-border rounded-zela-md shadow-lg z-20 p-3 space-y-2.5">
                    <input
                      type="text"
                      placeholder="Buscar por mensagem ou categoria..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 bg-dev-bg border border-dev-border rounded-xl text-xs font-medium text-dev-text outline-none focus:ring-2 focus:ring-dev-primary"
                    />
                    <select value={source} onChange={e => setSource(e.target.value)} className="w-full px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                      <option value="all">Todas as fontes</option>
                      {Object.entries(SOURCE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                    <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                      <option value="all">Toda severidade</option>
                      <option value="warn">Aviso</option>
                      <option value="error">Erro</option>
                      <option value="critical">Crítico</option>
                    </select>
                    <select value={schoolId} onChange={e => setSchoolId(e.target.value)} className="w-full px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                      <option value="all">Todas as escolas</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name || s.school_code}</option>)}
                    </select>
                    <select value={screenFilter} onChange={e => setScreenFilter(e.target.value)} className="w-full px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                      <option value="all">Todas as telas</option>
                      {screensInLogs.map(s => <option key={s} value={s}>{screenLabel(s)}</option>)}
                    </select>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                      <option value="occurrences">Mais frequentes</option>
                      <option value="last_seen_at">Mais recentes</option>
                    </select>
                    <label className="flex items-center gap-1.5 px-1 py-1 text-xs font-bold text-dev-text-muted cursor-pointer">
                      <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
                      Ver resolvidos
                    </label>
                    {categoryCounts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-dev-border">
                        {categoryCounts.map(([category, count]) => (
                          <span key={category} className="text-[9.5px] font-bold px-2 py-1 rounded-full bg-dev-bg border border-dev-border text-dev-text-muted">
                            {category} <span className="text-dev-text">{count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
          <button onClick={fetchLogs} className="p-2 text-dev-text-muted hover:text-dev-primary hover:bg-dev-primary-container rounded-lg transition" title="Atualizar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-5 sm:p-6 space-y-2">
        {errorMsg && <div className="bg-error/10 border border-error/20 text-error p-3 rounded-zela-md text-sm font-medium">{errorMsg}</div>}

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dev-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-dev-text-muted">
                <CheckCircle2 className="mx-auto h-12 w-12 opacity-40 mb-3" />
                <p className="text-sm font-semibold">Nenhum erro no filtro atual. 🎉</p>
              </div>
            ) : (
              filtered.map(log => {
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id} className={`bg-dev-bg border rounded-zela-md overflow-hidden ${log.resolved ? 'border-dev-border opacity-60' : 'border-dev-border'}`}>
                    <button
                      onClick={() => { setExpandedId(isExpanded ? null : log.id); setResolutionNoteDraft(''); }}
                      className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-dev-surface-high transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${SEVERITY_CLS[log.severity] || SEVERITY_CLS.error}`}>{log.severity}</span>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-dev-surface-high text-dev-text-muted">{SOURCE_LABELS[log.source] || log.source}</span>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-dev-surface-high text-dev-text-muted">{log.category}</span>
                          {screenLabel(log.screen) && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-dev-primary-container text-dev-primary">📍 {screenLabel(log.screen)}</span>
                          )}
                          {log.occurrences > 1 && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-dev-primary-container text-dev-primary">{log.occurrences}x</span>
                          )}
                          {log.resolved && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">Resolvido</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-dev-text truncate">{log.message}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-dev-text-muted">
                          <span>1ª vez: {formatDate(log.first_seen_at)}</span>
                          <span>última: {formatDate(log.last_seen_at)}</span>
                          {log.school_id && <span>escola: {schoolNameById[log.school_id] || log.school_id.slice(0, 8) + '…'}</span>}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-dev-text-muted shrink-0" /> : <ChevronDown size={16} className="text-dev-text-muted shrink-0" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-dev-border p-3.5 space-y-3 bg-dev-surface-high/40">
                        {log.context && (
                          <div>
                            <p className="text-[10px] font-bold text-dev-text-muted uppercase tracking-wide mb-1">Contexto</p>
                            <pre className="text-[11px] text-dev-text-muted whitespace-pre-wrap break-all bg-dev-bg p-2.5 rounded-lg max-h-56 overflow-y-auto scrollbar-none">{JSON.stringify(log.context, null, 2)}</pre>
                          </div>
                        )}
                        {log.stack && (
                          <div>
                            <p className="text-[10px] font-bold text-dev-text-muted uppercase tracking-wide mb-1">Stack</p>
                            <pre className="text-[11px] text-dev-text-muted whitespace-pre-wrap break-all bg-dev-bg p-2.5 rounded-lg max-h-56 overflow-y-auto scrollbar-none">{log.stack}</pre>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-dev-text-muted">
                          {log.url && <span className="truncate max-w-full">{log.url}</span>}
                          {log.role && <span>role: {log.role}</span>}
                          {log.user_agent && <span className="truncate max-w-full">{log.user_agent}</span>}
                        </div>

                        {/* Fase D do PLANO_IA_RESUMO_ERROS.md — explicação
                            sob demanda, sempre marcada como palpite da IA,
                            nunca como fato confirmado. */}
                        <div className="border border-dashed border-dev-border rounded-lg p-3">
                            {log.ai_summary ? (
                              <>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400 mb-1">🤖 Palpite da IA — pode estar incompleto ou errado</p>
                                <p className="text-xs text-dev-text leading-relaxed">{log.ai_summary}</p>
                                <button
                                  onClick={() => handleExplainWithAI(log, true)}
                                  disabled={explainingId === log.id}
                                  className="mt-2 text-[11px] font-bold text-dev-text-muted hover:text-dev-text underline disabled:opacity-50"
                                >
                                  {explainingId === log.id ? 'Gerando...' : 'Gerar de novo'}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleExplainWithAI(log, false)}
                                disabled={explainingId === log.id}
                                className="flex items-center gap-1.5 text-xs font-bold text-dev-text bg-dev-bg border border-dev-border hover:bg-dev-surface-high px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                              >
                                {explainingId === log.id ? 'Gerando explicação...' : '✨ Explicar com IA'}
                              </button>
                            )}
                            {explainError && explainingId === null && (
                              <p className="text-[11px] text-error mt-1.5">{explainError}</p>
                            )}
                        </div>

                        {log.resolved ? (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <p className="text-[11px] text-dev-text-muted">
                              {log.resolution_note ? `Nota: ${log.resolution_note}` : 'Sem nota de resolução.'}
                            </p>
                            <button
                              onClick={() => handleReopen(log)}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 shrink-0 text-xs font-bold text-dev-text-muted hover:text-dev-text bg-dev-bg border border-dev-border px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              <RotateCcw size={13} /> Reabrir
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="Nota de resolução (opcional)"
                              value={resolutionNoteDraft}
                              onChange={e => setResolutionNoteDraft(e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-dev-bg border border-dev-border rounded-lg text-xs text-dev-text outline-none focus:ring-2 focus:ring-dev-primary"
                            />
                            <button
                              onClick={() => handleResolve(log)}
                              disabled={isSaving}
                              className="flex items-center justify-center gap-1.5 shrink-0 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} /> Marcar como resolvido
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
      </div>
    </div>
  );
}
