import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Changelog do PRODUTO inteiro (não é um dado por escola -- ver
// system_updates na migração 20260921c) escrito em linguagem simples, pra
// qualquer pessoa leiga entender o que mudou. Ao abrir esta tela, marca
// tudo como lido -- é o que apaga o indicador (badge) do menu lateral (ver
// AdminPortal.jsx > hasUnreadSystemUpdates).
export default function AdminSystemUpdates({ currentUser, onRead }) {
  const [updates, setUpdates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Minimizado por padrão -- só título + data à vista; expande pra ler o
  // texto. Mais recente já entra aberto, pra quem acabou de ver o "•" no
  // menu não precisar de mais um clique pra ler a novidade.
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('system_updates')
          .select('id, title, summary, created_at')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        if (cancelled) return;
        setUpdates(data || []);
        if (data && data.length > 0) setExpandedIds(new Set([data[0].id]));

        // Marca tudo como lido -- best-effort, nunca trava a leitura da
        // tela se falhar. ON CONFLICT porque abrir a tela de novo (ou em
        // duas abas) não pode duplicar a linha (chave primária composta).
        if ((data || []).length > 0 && currentUser?.id) {
          const rows = data.map(u => ({ update_id: u.id, user_id: currentUser.id }));
          supabase.from('system_update_reads').upsert(rows, { onConflict: 'update_id,user_id', ignoreDuplicates: true })
            .then(() => onRead?.(), () => {});
        }
      } catch (err) {
        console.error('[AdminSystemUpdates] Erro ao buscar atualizações:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Título removido (o Header do app já mostra o nome da tela
          dinamicamente); ícone + descrição numa linha compacta (descrição
          sempre visível, mantém o ícone). */}
      <div className="flex items-center gap-2.5 mb-6 shrink-0">
        <div className="bg-primary/10 p-2 rounded-zela-md text-primary shrink-0">
          <Sparkles size={18} />
        </div>
        <p className="text-small text-on-surface-variant">Novidades e melhorias do sistema Zela.</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant/70">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : updates.length === 0 ? (
          <div className="text-center py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
            <Sparkles className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-on-surface-variant font-medium">Nenhuma atualização publicada ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map(u => {
              const isExpanded = expandedIds.has(u.id);
              return (
                <div key={u.id} className="border border-outline-variant rounded-zela-lg bg-surface-container-low overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(u.id)}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <p className="text-sm font-bold text-on-surface">{u.title}</p>
                      <span className="text-[11px] text-on-surface-variant/70 shrink-0">{formatDate(u.created_at)}</span>
                    </div>
                    <ChevronDown size={16} className={`text-on-surface-variant/70 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <p className="text-sm text-on-surface-variant px-4 pb-4 leading-relaxed">{u.summary}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
