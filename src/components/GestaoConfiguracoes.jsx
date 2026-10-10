import React, { useEffect, useState } from 'react';
import { ShieldAlert, KeyRound, BellRing, Minus, Plus, Check, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, Notice, Field, inputCls, PrimaryButton, StatCard } from './GestaoShared';
import ConfirmModal from './ConfirmModal';

// Configurações, Comunicação: lembrete automático de cobrança antes do
// vencimento (lido pela rotina send-financial-reminders).
export function ConfigComunicacao({ currentUser, currentSchool, onUpdate }) {
  const initial = currentSchool?.communication_config || {};
  const [enabled, setEnabled] = useState(initial.financial_reminders_enabled !== false);
  const [days, setDays] = useState(Number(initial.reminder_days_before) || 2);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    const d = Math.min(10, Math.max(1, Math.round(Number(days) || 2)));
    setIsSaving(true);
    setMsg({ type: '', text: '' });
    const { error } = await supabase.from('schools').update({
      communication_config: { ...currentSchool?.communication_config, financial_reminders_enabled: enabled, reminder_days_before: d },
    }).eq('id', currentUser.school_id);
    setIsSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setDays(d);
    setMsg({ type: 'success', text: 'Configuração de comunicação salva.' });
    if (onUpdate) onUpdate();
  };

  const dias = Math.min(10, Math.max(1, Math.round(Number(days) || 1)));
  const botaoDias = 'w-10 h-10 shrink-0 flex items-center justify-center rounded-zela-md border border-outline-variant bg-surface-container-low text-on-surface hover:bg-primary/10 hover:text-primary transition disabled:opacity-40 disabled:pointer-events-none';

  return (
    <PageShell description="Avisos automáticos que o Zela Escola envia às famílias." infoOnMobile>
      <div className="max-w-2xl space-y-4">
        <Notice type={msg.type || 'error'}>{msg.text}</Notice>
        <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 shrink-0 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center"><BellRing size={20} /></span>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-on-surface">Lembrete de cobrança</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">O aviso chega no app e por notificação no celular.</p>
            </div>
          </div>
          <label htmlFor="comm-enabled" className={`flex items-center justify-between gap-3 rounded-zela-md border p-3 cursor-pointer select-none transition ${enabled ? 'border-primary/40 bg-primary/5' : 'border-outline-variant bg-surface-container-low'}`}>
            <span className="text-sm font-medium text-on-surface">Avisar a família antes do vencimento da mensalidade</span>
            <span className="relative shrink-0">
              <input id="comm-enabled" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="peer sr-only" />
              <span className="block w-11 h-6 rounded-full bg-outline-variant peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 transition" />
              <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </span>
          </label>
          <div className={enabled ? '' : 'opacity-60'}>
            <label htmlFor="comm-days" className="block text-xs font-semibold text-on-surface-variant mb-1.5">Quantos dias antes</label>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Diminuir" disabled={!enabled || dias <= 1} onClick={() => setDays(dias - 1)} className={botaoDias}><Minus size={16} /></button>
              <input id="comm-days" type="number" min={1} max={10} value={days} disabled={!enabled} onChange={e => setDays(e.target.value)}
                className="w-20 h-10 px-2 bg-surface-container-lowest border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary outline-none text-base font-semibold text-center disabled:cursor-not-allowed" />
              <button type="button" aria-label="Aumentar" disabled={!enabled || dias >= 10} onClick={() => setDays(dias + 1)} className={botaoDias}><Plus size={16} /></button>
              <span className="text-sm text-on-surface-variant">{dias === 1 ? 'dia' : 'dias'}</span>
            </div>
            <p className="text-[11px] text-on-surface-variant/70 mt-1.5">De 1 a 10 dias.</p>
          </div>
          <PrimaryButton onClick={save} disabled={isSaving} className="w-full sm:w-auto h-10 justify-center">Salvar</PrimaryButton>
        </section>
        <p className="text-xs text-on-surface-variant">Comunicados, mural e calendário continuam avisando as famílias na hora da publicação.</p>
      </div>
    </PageShell>
  );
}

const ROLE_OPTIONS = [
  { id: 'admin', label: 'Administrativo' },
  { id: 'teacher', label: 'Professoras' },
  { id: 'family', label: 'Famílias' },
];

// Configurações, Segurança: quem ainda precisa trocar a senha e o botão pra
// exigir a troca no próximo acesso.
export function ConfigSeguranca({ currentUser }) {
  const [stats, setStats] = useState(null);
  const [roles, setRoles] = useState(['admin', 'teacher']);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('users').select('role, must_change_password').eq('school_id', currentUser.school_id).in('role', ['admin', 'teacher', 'family']);
    if (error) { setMsg({ type: 'error', text: 'Não foi possível carregar as contas.' }); setStats({}); return; }
    const s = {};
    (data || []).forEach(u => {
      s[u.role] = s[u.role] || { total: 0, pending: 0 };
      s[u.role].total += 1;
      if (u.must_change_password) s[u.role].pending += 1;
    });
    setStats(s);
  };
  useEffect(() => { load(); }, [currentUser.school_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [confirming, setConfirming] = useState(false);
  const roleNames = ROLE_OPTIONS.filter(r => roles.includes(r.id)).map(r => r.label).join(', ');

  const require = async () => {
    setConfirming(false);
    if (roles.length === 0) return;
    setIsSaving(true);
    setMsg({ type: '', text: '' });
    const { data, error } = await supabase.rpc('require_password_change_school', { p_roles: roles });
    setIsSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setMsg({ type: 'success', text: `${data || 0} conta(s) vão precisar criar uma nova senha no próximo acesso.` });
    load();
  };

  return (
    <PageShell description="Senhas e acesso das contas da escola." infoOnMobile>
      <div className="max-w-3xl space-y-4">
        <Notice type={msg.type || 'error'}>{msg.text}</Notice>
        {stats === null ? <Loading /> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ROLE_OPTIONS.map(r => {
              const total = stats[r.id]?.total || 0;
              const pending = stats[r.id]?.pending || 0;
              return (
                <div key={r.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex sm:flex-col items-center sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-on-surface-variant">{r.label}</p>
                    <span className={`inline-flex items-center gap-1 mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${pending ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success'}`}>
                      {!pending && <CheckCircle2 size={12} />}
                      {pending ? `${pending} precisam trocar a senha` : 'Todas com senha própria'}
                    </span>
                  </div>
                  <p className={`text-3xl font-semibold tabular-nums shrink-0 ${pending ? 'text-warning' : 'text-on-surface'}`}>{total}</p>
                </div>
              );
            })}
          </div>
        )}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 shrink-0 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center"><KeyRound size={20} /></span>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-on-surface">Exigir troca de senha</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Use depois de uma suspeita de acesso indevido ou ao trocar a equipe. A pessoa entra com a senha atual e o Zela Escola pede uma nova antes de liberar o sistema. A sua conta não é afetada.</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface-variant mb-1.5">Quem precisa trocar</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ROLE_OPTIONS.map(r => {
                const on = roles.includes(r.id);
                return (
                  <label key={r.id} htmlFor={`sec-role-${r.id}`} className={`flex items-center justify-between gap-2 h-11 px-3 rounded-zela-md border cursor-pointer select-none text-sm font-medium transition ${on ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary/40'}`}>
                    {r.label}
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${on ? 'bg-primary text-white' : 'border border-outline-variant'}`}>{on && <Check size={13} />}</span>
                    <input id={`sec-role-${r.id}`} type="checkbox" className="sr-only" checked={on} onChange={e => setRoles(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id))} />
                  </label>
                );
              })}
            </div>
          </div>
          <PrimaryButton onClick={() => setConfirming(true)} disabled={isSaving || roles.length === 0} className="w-full sm:w-auto h-10 justify-center"><ShieldAlert size={15} /> Exigir nova senha</PrimaryButton>
        </section>
      </div>
      {confirming && (
        <ConfirmModal
          title="Exigir nova senha?"
          message={`No próximo acesso, estas contas vão precisar criar uma nova senha: ${roleNames}.`}
          confirmLabel="Exigir nova senha"
          cancelLabel="Voltar"
          danger={false}
          onConfirm={require}
          onCancel={() => setConfirming(false)}
        />
      )}
    </PageShell>
  );
}
