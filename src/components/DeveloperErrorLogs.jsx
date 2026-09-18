import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, CheckCircle2, RotateCcw, History, Bug } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DeveloperLogs from './DeveloperLogs';

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

// Fase D do PLANO_LOGGING_ERROS_PORTAL_DEV.md — tela unificada lendo
// error_logs (Fase A/B1). Cada linha já é 1 fingerprint (a deduplicação
// acontece na própria RPC log_error, não aqui), então "agrupar" é só listar
// -- ordenado por mais frequente por padrão, não por mais recente, pra um
// erro raro-mas-crítico não ficar escondido atrás de ruído recente.
// client_error_logs/edge_function_logs/cron_job_logs continuam existindo
// como estavam (nada foi migrado ainda -- Fase F do plano, opcional); o
// visualizador antigo (DeveloperLogs.jsx, só client_error_logs) fica
// acessível numa aba "Legado" dentro desta mesma tela.
export default function DeveloperErrorLogs({ currentUser }) {
  const [activeView, setActiveView] = useState('unified'); // 'unified' | 'legacy'

  const [logs, setLogs] = useState([]);
  const [schools, setSchools] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [resolutionNoteDraft, setResolutionNoteDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [source, setSource] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [schoolId, setSchoolId] = useState('all');
  const [period, setPeriod] = useState('7days');
  const [showResolved, setShowResolved] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('occurrences'); // 'occurrences' | 'last_seen_at'

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
    if (activeView !== 'unified') return;
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, source, severity, schoolId, period, showResolved, sortBy]);

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

  return (
    <div className="h-full flex flex-col bg-dev-surface rounded-zela-xl border border-dev-border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-dev-border shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-dev-primary-container p-2.5 rounded-zela-md text-dev-primary">
            <Bug size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-dev-text">Logs de erro</h2>
            <p className="text-dev-text-muted text-small hidden sm:block">Frontend, edge functions, cron e reconhecimento facial, num só lugar.</p>
          </div>
        </div>
        <div className="flex gap-1 bg-dev-bg border border-dev-border rounded-zela-md p-1 shrink-0">
          <button
            onClick={() => setActiveView('unified')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeView === 'unified' ? 'bg-dev-primary-container text-dev-primary' : 'text-dev-text-muted hover:text-dev-text'}`}
          >
            <Bug size={13} /> Unificado
          </button>
          <button
            onClick={() => setActiveView('legacy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeView === 'legacy' ? 'bg-dev-primary-container text-dev-primary' : 'text-dev-text-muted hover:text-dev-text'}`}
          >
            <History size={13} /> Legado
          </button>
        </div>
      </div>

      {activeView === 'legacy' ? (
        <div className="flex-1 min-h-0">
          <DeveloperLogs />
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div className="p-4 sm:p-5 border-b border-dev-border shrink-0 space-y-3">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {PERIOD_OPTIONS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${period === p.id ? 'bg-dev-primary text-white' : 'bg-dev-bg text-dev-text-muted hover:text-dev-text border border-dev-border'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <select value={source} onChange={e => setSource(e.target.value)} className="px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                <option value="all">Todas as fontes</option>
                {Object.entries(SOURCE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>

              <select value={severity} onChange={e => setSeverity(e.target.value)} className="px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                <option value="all">Toda severidade</option>
                <option value="warn">Aviso</option>
                <option value="error">Erro</option>
                <option value="critical">Crítico</option>
              </select>

              <select value={schoolId} onChange={e => setSchoolId(e.target.value)} className="px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none max-w-[180px]">
                <option value="all">Todas as escolas</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name || s.school_code}</option>)}
              </select>

              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text outline-none">
                <option value="occurrences">Mais frequentes</option>
                <option value="last_seen_at">Mais recentes</option>
              </select>

              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-dev-bg border border-dev-border rounded-xl text-xs font-bold text-dev-text-muted cursor-pointer">
                <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
                Ver resolvidos
              </label>

              <button onClick={fetchLogs} className="ml-auto p-2 text-dev-text-muted hover:text-dev-primary hover:bg-dev-primary-container rounded-xl transition" title="Atualizar">
                <RefreshCw size={16} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Buscar por mensagem ou categoria..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-dev-bg border border-dev-border rounded-xl text-xs font-medium text-dev-text outline-none focus:ring-2 focus:ring-dev-primary"
            />

            {categoryCounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {categoryCounts.map(([category, count]) => (
                  <span key={category} className="text-[10px] font-bold px-2 py-1 rounded-full bg-dev-bg border border-dev-border text-dev-text-muted">
                    {category} <span className="text-dev-text">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
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
                            <pre className="text-[11px] text-dev-text-muted whitespace-pre-wrap break-all bg-dev-bg p-2.5 rounded-lg max-h-56 overflow-y-auto">{JSON.stringify(log.context, null, 2)}</pre>
                          </div>
                        )}
                        {log.stack && (
                          <div>
                            <p className="text-[10px] font-bold text-dev-text-muted uppercase tracking-wide mb-1">Stack</p>
                            <pre className="text-[11px] text-dev-text-muted whitespace-pre-wrap break-all bg-dev-bg p-2.5 rounded-lg max-h-56 overflow-y-auto">{log.stack}</pre>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-dev-text-muted">
                          {log.url && <span className="truncate max-w-full">{log.url}</span>}
                          {log.role && <span>role: {log.role}</span>}
                          {log.user_agent && <span className="truncate max-w-full">{log.user_agent}</span>}
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
        </>
      )}
    </div>
  );
}
