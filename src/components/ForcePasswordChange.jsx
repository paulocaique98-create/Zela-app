import React, { useState } from 'react';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Contas criadas pela escola com senha provisória (users.must_change_password)
// ficam presas aqui até a pessoa criar a própria senha. O flag desliga
// sozinho no banco quando a senha muda de verdade (trigger em auth.users) --
// por isso, depois de trocar, relemos o cadastro em vez de só confiar no
// estado local.
export default function ForcePasswordChange({ currentUser, onPasswordChanged, onLogout }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas digitadas não são iguais.'); return; }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { data: fresh, error: freshError } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
      if (freshError) throw freshError;
      onPasswordChanged(fresh);
    } catch (err) {
      console.error('[ForcePasswordChange] Erro ao trocar senha:', err);
      setError(err.message?.includes('different from the old')
        ? 'A nova senha precisa ser diferente da senha provisória.'
        : 'Não foi possível salvar a nova senha. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-surface-container-low flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest p-6 md:p-8 rounded-zela-xl shadow-xl w-full max-w-md border border-outline-variant">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-zela-lg flex items-center justify-center">
            <KeyRound size={26} />
          </div>
        </div>
        <h1 className="text-h2 text-on-surface text-center mb-2">Crie sua senha</h1>
        <p className="text-small text-on-surface-variant text-center mb-6">
          Olá, {currentUser?.name?.split(' ')[0] || 'tudo bem'}! Você entrou com uma senha provisória. Para proteger sua conta, crie uma senha só sua antes de continuar.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="force-new-password" className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Nova senha</label>
            <input id="force-new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-on-surface text-sm" />
            <p className="text-[11px] text-on-surface-variant/70 mt-1">Mínimo de 8 caracteres.</p>
          </div>
          <div>
            <label htmlFor="force-confirm-password" className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Confirme a nova senha</label>
            <input id="force-confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} required
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-on-surface text-sm" />
          </div>

          {error && <div className="p-3 bg-error/10 text-error text-sm rounded-zela-md border border-error/30">{error}</div>}

          <button type="submit" disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-zela-md transition disabled:opacity-60">
            {isSaving && <Loader2 size={16} className="animate-spin" />} Salvar e continuar
          </button>
          <button type="button" onClick={onLogout}
            className="w-full flex items-center justify-center gap-1.5 text-small text-on-surface-variant hover:text-on-surface py-2">
            <LogOut size={14} /> Sair
          </button>
        </form>
      </div>
    </div>
  );
}
