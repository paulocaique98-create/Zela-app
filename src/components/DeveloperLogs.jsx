import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Trash2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function DeveloperLogs() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('client_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (fetchError) throw fetchError;
      setLogs(data || []);
    } catch (err) {
      console.error('[DeveloperLogs] Erro ao buscar logs:', err);
      setError('Não foi possível carregar os logs de erro.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleDelete = async (id) => {
    try {
      const { error: deleteError } = await supabase.from('client_error_logs').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error('[DeveloperLogs] Erro ao excluir log:', err);
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const { error: deleteError } = await supabase.from('client_error_logs').delete().not('id', 'is', null);
      if (deleteError) throw deleteError;
      setLogs([]);
    } catch (err) {
      console.error('[DeveloperLogs] Erro ao limpar logs:', err);
    } finally {
      setIsClearing(false);
      setConfirmClearAll(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-dev-surface rounded-zela-xl border border-dev-border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-dev-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-dev-primary-container p-2.5 rounded-zela-md text-dev-primary">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-dev-text">Logs de erro</h2>
            <p className="text-dev-text-muted text-small hidden sm:block">Erros de JavaScript capturados nos apps de todas as escolas.</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={fetchLogs} className="p-2.5 text-dev-text-muted hover:text-dev-primary hover:bg-dev-primary-container rounded-zela-md transition" title="Atualizar">
            <RefreshCw size={18} />
          </button>
          {logs.length > 0 && (
            <button onClick={() => setConfirmClearAll(true)} className="flex items-center gap-2 bg-error/10 hover:bg-error/20 text-error px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm">
              <Trash2 size={16} /> <span className="hidden sm:inline">Limpar tudo</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {error && <div className="bg-error/10 border border-error/20 text-error p-3 rounded-zela-md text-sm font-medium">{error}</div>}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-dev-primary animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-dev-text-muted">
            <FileText className="mx-auto h-12 w-12 opacity-40 mb-3" />
            <p className="text-sm font-semibold">Nenhum erro registrado. 🎉</p>
          </div>
        ) : (
          logs.map(log => {
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="bg-dev-bg border border-dev-border rounded-zela-md overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-dev-surface-high transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-dev-text truncate">{log.message}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-dev-text-muted">
                      <span>{formatDate(log.created_at)}</span>
                      {log.role && <span>role: {log.role}</span>}
                      {log.school_id && <span>escola: {log.school_id.slice(0, 8)}…</span>}
                      {log.url && <span className="truncate max-w-[240px]">{log.url}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }}
                      className="p-1.5 text-dev-text-muted hover:text-error hover:bg-error/10 rounded-lg transition cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="text-dev-text-muted" /> : <ChevronDown size={16} className="text-dev-text-muted" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-dev-border p-3.5 space-y-2 bg-dev-surface-high/40">
                    {log.stack && (
                      <div>
                        <p className="text-[10px] font-bold text-dev-text-muted uppercase tracking-wide mb-1">Stack</p>
                        <pre className="text-[11px] text-dev-text-muted whitespace-pre-wrap break-all bg-dev-bg p-2.5 rounded-lg max-h-64 overflow-y-auto">{log.stack}</pre>
                      </div>
                    )}
                    {log.component_stack && (
                      <div>
                        <p className="text-[10px] font-bold text-dev-text-muted uppercase tracking-wide mb-1">Component Stack</p>
                        <pre className="text-[11px] text-dev-text-muted whitespace-pre-wrap break-all bg-dev-bg p-2.5 rounded-lg max-h-64 overflow-y-auto">{log.component_stack}</pre>
                      </div>
                    )}
                    {log.user_agent && (
                      <p className="text-[11px] text-dev-text-muted">{log.user_agent}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {confirmClearAll && (
        <ConfirmModal
          title="Limpar todos os logs"
          message={`Excluir ${logs.length} log(s) de erro? Essa ação não pode ser desfeita.`}
          isLoading={isClearing}
          onConfirm={handleClearAll}
          onCancel={() => setConfirmClearAll(false)}
        />
      )}
    </div>
  );
}
