import React, { useState } from 'react';
import { Sparkles, Send, Trash2, Loader2, ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Lista os rascunhos gerados pela Importação com IA (status='draft' em
// matricula_import_drafts). "Enviar" chama send-matricula-draft (cria/
// reaproveita a conta e gera a solicitação pendente de verdade, passando
// pelo mesmo fluxo de aprovação de Formulários > Matrículas). "Descartar"
// só marca o rascunho como descartado, sem tocar em nada oficial.
export default function AdminMatriculaDrafts({ drafts, onRefresh }) {
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  if (!drafts || drafts.length === 0) return null;

  const handleEnviar = async (draftId) => {
    setBusyId(draftId);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('send-matricula-draft', { body: { draft_id: draftId } });
      if (fnError || !data) throw new Error(fnError?.message || 'Erro ao enviar rascunho.');
      if (data.error) throw new Error(data.error);
      onRefresh();
    } catch (err) {
      setError(err.message || 'Erro ao enviar rascunho.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDescartar = async (draftId) => {
    setBusyId(draftId);
    setError('');
    try {
      const { error: updateError } = await supabase.from('matricula_import_drafts').update({ status: 'discarded' }).eq('id', draftId);
      if (updateError) throw new Error(updateError.message);
      onRefresh();
    } catch (err) {
      setError(err.message || 'Erro ao descartar rascunho.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-6 border border-violet-200 bg-violet-50/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-2.5 border-b border-violet-100">
        <div className="bg-violet-100 p-2 rounded-xl text-violet-600"><Sparkles size={16} /></div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Rascunhos (IA)</h3>
          <p className="text-xs text-slate-400">{drafts.length} família(s) aguardando revisão antes de virar solicitação</p>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="divide-y divide-violet-100">
        {drafts.map((d) => {
          const isOpen = openId === d.id;
          const isBusy = busyId === d.id;
          const resp = d.payload?.responsavel || {};
          const criancas = d.payload?.criancas || [];
          return (
            <div key={d.id} className="px-5 py-3">
              <button
                onClick={() => setOpenId(isOpen ? null : d.id)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{resp.nome || 'Responsável não identificado'}</div>
                  <div className="text-[11px] text-slate-400 truncate">{criancas.map((c) => c.nome).join(', ') || 'Nenhuma criança identificada'}</div>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="mt-3 space-y-3">
                  {d.resumo_ia && (
                    <div className="text-xs text-slate-600 leading-relaxed bg-white border border-slate-200 rounded-xl p-3">{d.resumo_ia}</div>
                  )}
                  <div className="text-xs text-slate-500 space-y-1">
                    <div><span className="font-semibold text-slate-600">E-mail:</span> {resp.email || 'não identificado'}</div>
                    <div><span className="font-semibold text-slate-600">Telefone:</span> {resp.telefone || 'não identificado'}</div>
                    <div><span className="font-semibold text-slate-600">Crianças:</span> {criancas.length}</div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleEnviar(d.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition"
                    >
                      {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar
                    </button>
                    <button
                      onClick={() => handleDescartar(d.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-semibold rounded-xl transition"
                    >
                      <Trash2 size={13} /> Descartar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
