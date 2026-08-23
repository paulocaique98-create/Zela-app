import React, { useEffect, useState } from 'react';
import { ScrollText, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ACTION_LABELS = {
  publish: 'Publicou',
  archive: 'Arquivou',
  delete: 'Excluiu',
};

const ENTITY_LABELS = {
  mitigacao_report: 'Relatório de Mitigação',
};

function formatWhen(iso) {
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAuditLog({ currentUser, currentSchool }) {
  const [logs, setLogs] = useState([]);
  const [actorNames, setActorNames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('school_id', currentSchool.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      const rows = data || [];
      setLogs(rows);

      const actorIds = [...new Set(rows.map(r => r.actor_id).filter(Boolean))];
      if (actorIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, name').in('id', actorIds);
        if (!cancelled) {
          const map = {};
          (users || []).forEach(u => { map[u.id] = u.name; });
          setActorNames(map);
        }
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [currentSchool?.id]);

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <ScrollText size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Auditoria</h2>
          <p className="text-small text-on-surface-variant">Ações sensíveis registradas por administradores da escola.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant/70">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
            <ScrollText className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-on-surface-variant font-medium">Nenhuma ação registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="p-3 border border-outline-variant rounded-zela-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-on-surface">
                    {ACTION_LABELS[log.action] || log.action} {ENTITY_LABELS[log.entity_type] || log.entity_type}
                    {log.details?.student_name ? ` — ${log.details.student_name}` : ''}
                  </p>
                  <p className="text-xs text-on-surface-variant/70">
                    por {actorNames[log.actor_id] || 'Usuário'}
                  </p>
                </div>
                <span className="text-xs text-on-surface-variant/70 shrink-0">{formatWhen(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
