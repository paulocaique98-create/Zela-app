import React, { useCallback, useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton } from './GestaoShared';

const STATUS = { pendente: 'Aguardando', concluida: 'Conta excluída', recusada: 'Recusado', cancelada: 'Cancelado pela pessoa' };
const ROLE = { family: 'Responsável', teacher: 'Professora', admin: 'Administrativo' };

// Cadastros, Pedidos de exclusão de conta (LGPD). Quem pede é a própria
// pessoa, em Configurações; a Gestão conclui (exclui de verdade, pela
// mesma função segura de sempre) ou recusa explicando o motivo.
export default function GestaoExclusoesConta({ currentUser }) {
  const [rows, setRows] = useState(null);
  const [acting, setActing] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('account_deletion_requests').select('*')
      .eq('school_id', currentUser.school_id).order('requested_at', { ascending: false });
    if (e) { setError('Não foi possível carregar os pedidos.'); setRows([]); return; }
    setRows(data || []);
  }, [currentUser.school_id]);
  useEffect(() => { load(); }, [load]);

  const pending = (rows || []).filter(r => r.status === 'pendente');
  const history = (rows || []).filter(r => r.status !== 'pendente');

  const STATUS_CLS = {
    concluida: 'bg-success/10 text-success border-success/30',
    recusada: 'bg-error/10 text-error border-error/30',
    cancelada: 'bg-surface-container text-on-surface-variant border-outline-variant',
  };

  return (
    <PageShell infoOnMobile description="Pedidos de exclusão de conta feitos pelas próprias pessoas. O prazo para responder é de até 30 dias.">
      <div className="space-y-5">
        <Notice>{error}</Notice>
        <Notice type="success">{success}</Notice>
        {rows === null ? <Loading /> : rows.length === 0 ? <EmptyState icon={UserX} text="Nenhum pedido de exclusão." /> : (
          <>
            {pending.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-sm font-bold text-warning flex items-center gap-2">
                  Aguardando resposta
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warning/10 border border-warning/30">{pending.length}</span>
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {pending.map(r => {
                    const days = Math.floor((Date.now() - new Date(r.requested_at)) / 86400000);
                    const late = days >= 25;
                    return (
                      <div key={r.id} className="bg-surface-container-lowest border border-warning/30 rounded-zela-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-warning/10 text-warning flex items-center justify-center font-bold text-sm shrink-0">
                            {(r.user_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-on-surface truncate">{r.user_name}</p>
                            <p className="text-xs text-on-surface-variant truncate">{r.user_email}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-surface-container-low text-on-surface-variant border border-outline-variant">{ROLE[r.user_role] || r.user_role}</span>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-sm border ${late ? 'bg-error/10 text-error border-error/30' : 'bg-warning/10 text-warning border-warning/30'}`}>
                                {days === 0 ? 'Pedido hoje' : `${days} dia${days === 1 ? '' : 's'} de espera`}
                              </span>
                              <span className="text-xs text-on-surface-variant">{formatDateBR(r.requested_at)}</span>
                            </div>
                          </div>
                        </div>
                        {r.reason && <p className="text-sm text-on-surface bg-surface-container-low rounded-zela-md px-3 py-2">“{r.reason}”</p>}
                        <div className="grid grid-cols-2 gap-2">
                          <SecondaryButton className="justify-center h-10" onClick={() => setActing({ req: r, kind: 'recusar' })}>Recusar</SecondaryButton>
                          <DangerButton className="justify-center h-10" onClick={() => setActing({ req: r, kind: 'excluir' })}>Excluir conta</DangerButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {history.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-on-surface-variant mb-2.5">Histórico</h3>
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {history.map(r => (
                    <li key={r.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">{r.user_name}</p>
                          <p className="text-xs text-on-surface-variant">{ROLE[r.user_role] || r.user_role}{r.handled_at ? `, ${formatDateBR(r.handled_at)}` : ''}</p>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-sm border shrink-0 ${STATUS_CLS[r.status] || STATUS_CLS.cancelada}`}>{STATUS[r.status]}</span>
                      </div>
                      {r.response && <p className="text-xs text-on-surface-variant mt-2">{r.response}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {acting && (
        <ResponderModal currentUser={currentUser} acting={acting} onClose={() => setActing(null)}
          onDone={(text) => { setActing(null); setSuccess(text); load(); }} />
      )}
    </PageShell>
  );
}

function DangerButton({ children, ...props }) {
  return (
    <button {...props} className={`flex items-center gap-1.5 px-3.5 py-2 bg-error hover:bg-error/90 text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50 ${props.className || ''}`}>
      {children}
    </button>
  );
}

function ResponderModal({ currentUser, acting, onClose, onDone }) {
  const { req, kind } = acting;
  const [response, setResponse] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const isDelete = kind === 'excluir';

  const submit = async () => {
    setIsSaving(true);
    setError('');
    try {
      if (isDelete) {
        if (!req.user_id) throw new Error('A conta já não existe mais.');
        const { data, error: fnError } = await supabase.functions.invoke('delete-user', { body: { userId: req.user_id } });
        if (fnError || data?.error) {
          let msg = data?.error;
          if (!msg && fnError?.context && typeof fnError.context.json === 'function') {
            try { msg = (await fnError.context.json())?.error; } catch { /* corpo não era JSON */ }
          }
          throw new Error(msg || fnError?.message || 'Não foi possível excluir a conta.');
        }
      } else if (!response.trim()) {
        throw new Error('Explique o motivo da recusa (a pessoa pode pedir essa informação).');
      }
      const { error: upErr } = await supabase.from('account_deletion_requests').update({
        status: isDelete ? 'concluida' : 'recusada',
        handled_by: currentUser.id,
        handled_at: new Date().toISOString(),
        response: response.trim() || null,
      }).eq('id', req.id);
      if (upErr) throw upErr;
      onDone(isDelete ? `Conta de ${req.user_name} excluída.` : 'Pedido recusado e registrado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title={isDelete ? 'Excluir conta' : 'Recusar pedido'} onClose={onClose}
      footer={<>
        <SecondaryButton onClick={onClose}>Voltar</SecondaryButton>
        {isDelete
          ? <DangerButton onClick={submit} disabled={isSaving || confirmText.trim().toUpperCase() !== 'EXCLUIR'}>Excluir definitivamente</DangerButton>
          : <PrimaryButton onClick={submit} disabled={isSaving}>Recusar pedido</PrimaryButton>}
      </>}>
      <Notice>{error}</Notice>
      {isDelete ? (
        <>
          <p className="text-sm text-on-surface">
            A conta de <strong>{req.user_name}</strong> ({req.user_email}) será excluída e a pessoa perde o acesso. Os vínculos com alunos são desfeitos. Isso não pode ser desfeito.
          </p>
          <p className="text-xs text-on-surface-variant">Se for o único responsável de algum aluno, cadastre outro responsável antes.</p>
          <Field label="Observação (opcional)" id="del-response"><input id="del-response" value={response} onChange={e => setResponse(e.target.value)} className={inputCls} /></Field>
          <Field label='Digite EXCLUIR para confirmar' id="del-confirm"><input id="del-confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)} className={inputCls} /></Field>
        </>
      ) : (
        <Field label="Motivo da recusa" id="del-refuse" hint="Ex.: há cobranças em aberto ou é o único responsável de um aluno matriculado.">
          <textarea id="del-refuse" rows={3} value={response} onChange={e => setResponse(e.target.value)} className={inputCls} />
        </Field>
      )}
    </Modal>
  );
}
