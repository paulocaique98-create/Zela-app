import React, { useCallback, useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton } from './GestaoShared';

const STATUS = { pendente: 'Aguardando', concluida: 'Conta excluída', recusada: 'Recusado', cancelada: 'Cancelado pela pessoa' };
const ROLE = { family: 'Responsável', teacher: 'Professora', admin: 'Administrativo' };

// Cadastros · Pedidos de exclusão de conta (LGPD). Quem pede é a própria
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

  return (
    <PageShell description="Pedidos de exclusão de conta feitos pelas próprias pessoas. O prazo para responder é de até 30 dias.">
      <div className="space-y-4">
        <Notice>{error}</Notice>
        <Notice type="success">{success}</Notice>
        {rows === null ? <Loading /> : rows.length === 0 ? <EmptyState icon={UserX} text="Nenhum pedido de exclusão." /> : (
          <>
            {pending.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700">Aguardando resposta</h3>
                {pending.map(r => {
                  const days = Math.floor((Date.now() - new Date(r.requested_at)) / 86400000);
                  return (
                    <div key={r.id} className="bg-surface-container-lowest border border-amber-300 rounded-zela-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-on-surface">{r.user_name} · {ROLE[r.user_role] || r.user_role}</p>
                        <p className="text-xs text-on-surface-variant">{r.user_email} · pedido em {formatDateBR(r.requested_at)} ({days} dia{days === 1 ? '' : 's'})</p>
                        {r.reason && <p className="text-sm text-on-surface mt-1">“{r.reason}”</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <SecondaryButton onClick={() => setActing({ req: r, kind: 'recusar' })}>Recusar</SecondaryButton>
                        <DangerButton onClick={() => setActing({ req: r, kind: 'excluir' })}>Excluir conta</DangerButton>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {history.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-on-surface-variant mb-2">Histórico</h3>
                <ul className="divide-y divide-outline-variant/60 bg-surface-container-lowest border border-outline-variant rounded-zela-lg">
                  {history.map(r => (
                    <li key={r.id} className="px-4 py-2.5 text-sm flex flex-wrap justify-between gap-2">
                      <span className="text-on-surface">{r.user_name} · {ROLE[r.user_role] || r.user_role}</span>
                      <span className="text-on-surface-variant">{STATUS[r.status]}{r.handled_at ? ` em ${formatDateBR(r.handled_at)}` : ''}{r.response ? ` · ${r.response}` : ''}</span>
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
    <button {...props} className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50">
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
