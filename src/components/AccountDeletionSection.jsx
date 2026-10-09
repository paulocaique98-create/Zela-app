import React, { useCallback, useEffect, useState } from 'react';
import { UserX, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';

// "Excluir minha conta" (LGPD, direito de eliminação; exigência da Apple
// para o app). O pedido vai para a Gestão da escola, que conclui a
// exclusão. Dados que a lei obriga a escola a guardar (ex.: financeiro)
// seguem as regras de retenção.
export default function AccountDeletionSection({ className = '' } = {}) {
  const [pending, setPending] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    const { data } = await supabase.from('account_deletion_requests')
      .select('id, requested_at').eq('status', 'pendente').maybeSingle();
    setPending(data || null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const request = async () => {
    setIsSaving(true);
    setMsg({ type: '', text: '' });
    const { error } = await supabase.rpc('request_account_deletion', { p_reason: reason });
    setIsSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setOpen(false);
    setReason('');
    setMsg({ type: 'success', text: 'Pedido enviado. A escola conclui a exclusão em até 30 dias e você recebe a confirmação.' });
    load();
  };

  const cancel = async () => {
    setConfirmCancel(false);
    const { error } = await supabase.rpc('cancel_account_deletion_request');
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setMsg({ type: 'success', text: 'Pedido de exclusão cancelado.' });
    load();
  };

  return (
    <div className={`bg-white p-5 rounded-zela-xl shadow-sm border border-outline-variant ${className}`}>
      <h3 className="font-bold text-base text-on-surface flex items-center gap-2 mb-2">
        <UserX className="text-primary" size={18} /> Excluir minha conta
      </h3>
      {msg.text && (
        <p className={`text-sm mb-2 ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{msg.text}</p>
      )}
      {pending === undefined ? (
        <Loader2 size={16} className="animate-spin text-on-surface-variant" />
      ) : pending ? (
        <div className="space-y-2">
          <p className="text-sm text-on-surface-variant">
            Pedido enviado em {new Date(pending.requested_at).toLocaleDateString('pt-BR')}. A escola conclui em até 30 dias.
          </p>
          <button onClick={() => setConfirmCancel(true)} className="text-sm font-bold text-primary hover:underline">
            Cancelar pedido
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant mb-3">
            Você pode pedir a exclusão da sua conta e dos seus dados pessoais. Informações que a escola é obrigada por lei a guardar (como registros financeiros) são mantidas pelo prazo legal.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="w-full border border-red-200 text-red-600 font-bold py-2.5 rounded-zela-md hover:bg-red-50 text-sm transition"
          >
            Solicitar exclusão da conta
          </button>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-zela-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-on-surface">Solicitar exclusão da conta</h3>
            <p className="text-sm text-on-surface-variant">
              Depois de concluída, você perde o acesso ao Zela Escola e não recebe mais avisos da escola. Se ainda tiver filho matriculado, converse com a escola antes: outro responsável pode precisar assumir o acompanhamento.
            </p>
            <label htmlFor="deletion-reason" className="block text-xs font-bold text-on-surface-variant">
              Motivo (opcional)
              <textarea id="deletion-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full px-3 py-2 border border-outline-variant rounded-zela-md text-sm" />
            </label>
            {msg.type === 'error' && <p className="text-sm text-red-600">{msg.text}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container rounded-zela-md">Voltar</button>
              <button onClick={request} disabled={isSaving} className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-zela-md text-sm disabled:opacity-50">
                {isSaving ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <ConfirmModal
          title="Cancelar pedido de exclusão?"
          message="Sua conta continua ativa normalmente."
          confirmLabel="Cancelar pedido"
          cancelLabel="Voltar"
          danger={false}
          onConfirm={cancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
