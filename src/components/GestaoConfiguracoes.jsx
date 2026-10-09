import React, { useEffect, useState } from 'react';
import { ShieldAlert, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, Notice, Field, inputCls, PrimaryButton, StatCard } from './GestaoShared';
import ConfirmModal from './ConfirmModal';

// Configurações · Comunicação: lembrete automático de cobrança antes do
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

  return (
    <PageShell description="Avisos automáticos que o Zela Escola envia às famílias.">
      <div className="max-w-xl space-y-4">
        <Notice type={msg.type || 'error'}>{msg.text}</Notice>
        <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 space-y-3">
          <h3 className="font-bold text-sm text-on-surface">Lembrete de cobrança</h3>
          <label htmlFor="comm-enabled" className="flex items-center gap-2 text-sm text-on-surface">
            <input id="comm-enabled" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            Avisar a família antes do vencimento da mensalidade
          </label>
          <Field label="Quantos dias antes" id="comm-days" hint="De 1 a 10 dias. O aviso chega no app e por notificação no celular.">
            <input id="comm-days" type="number" min={1} max={10} value={days} disabled={!enabled} onChange={e => setDays(e.target.value)} className={`${inputCls} max-w-[120px]`} />
          </Field>
          <PrimaryButton onClick={save} disabled={isSaving}>Salvar</PrimaryButton>
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

// Configurações · Segurança: quem ainda precisa trocar a senha e o botão pra
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
    <PageShell description="Senhas e acesso das contas da escola.">
      <div className="max-w-2xl space-y-4">
        <Notice type={msg.type || 'error'}>{msg.text}</Notice>
        {stats === null ? <Loading /> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ROLE_OPTIONS.map(r => (
              <StatCard key={r.id} label={r.label} value={stats[r.id]?.total || 0}
                hint={stats[r.id]?.pending ? `${stats[r.id].pending} ainda precisam trocar a senha` : 'Todas com senha própria'}
                tone={stats[r.id]?.pending ? 'warn' : 'default'} />
            ))}
          </div>
        )}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 space-y-3">
          <h3 className="font-bold text-sm text-on-surface flex items-center gap-2"><KeyRound size={16} /> Exigir troca de senha</h3>
          <p className="text-sm text-on-surface-variant">Use depois de uma suspeita de acesso indevido ou ao trocar a equipe. A pessoa entra com a senha atual e o Zela Escola pede uma nova antes de liberar o sistema. A sua conta não é afetada.</p>
          <div className="flex flex-wrap gap-4">
            {ROLE_OPTIONS.map(r => (
              <label key={r.id} htmlFor={`sec-role-${r.id}`} className="flex items-center gap-2 text-sm">
                <input id={`sec-role-${r.id}`} type="checkbox" checked={roles.includes(r.id)} onChange={e => setRoles(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id))} />
                {r.label}
              </label>
            ))}
          </div>
          <PrimaryButton onClick={() => setConfirming(true)} disabled={isSaving || roles.length === 0}><ShieldAlert size={15} /> Exigir nova senha</PrimaryButton>
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
