import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mensagemDaFuncao } from '../lib/contasVinculadas';
import { toast } from '../lib/toast';

// Portal do Dev > Segurança: recupera quem perdeu o celular do Authenticator.
// Remove os fatores 2FA da conta (Edge Function remover-mfa, só developer, com
// auditoria). A pessoa entra só com a senha e cadastra um Authenticator novo.
export default function RecuperarMfaUsuario() {
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);

  const remover = async (e) => {
    e.preventDefault();
    const alvo = email.trim();
    if (!alvo || !window.confirm(`Remover a verificação em duas etapas de ${alvo}? A pessoa entrará só com a senha e precisará cadastrar o Authenticator de novo.`)) return;
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('remover-mfa', { body: { email: alvo } });
      if (error) throw new Error(await mensagemDaFuncao(error, 'Não foi possível remover o 2FA agora.'));
      toast.success(data?.removidos > 0 ? 'Verificação em duas etapas removida.' : 'Essa conta não tinha 2FA ativo.');
      setEmail('');
    } catch (err) {
      toast.error(err.message || 'Não foi possível remover o 2FA agora.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <section className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-zela-md flex items-center justify-center bg-dev-primary-container text-dev-primary"><KeyRound size={20} /></span>
        <div className="min-w-0">
          <h3 className="font-bold text-sm text-dev-text">Recuperar acesso (2FA)</h3>
          <p className="text-xs mt-0.5 text-dev-text-muted">Para quem perdeu o celular do Authenticator. Remove o 2FA da conta; a ação fica registrada na auditoria.</p>
        </div>
      </div>
      <form onSubmit={remover} className="flex flex-col gap-3 mt-auto">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="E-mail da conta"
          required
          className="w-full h-10 px-3 rounded-zela-md bg-dev-bg border border-dev-border text-sm text-dev-text outline-none focus:border-dev-primary"
        />
        <button type="submit" disabled={carregando || !email.trim()} className="self-start w-full sm:w-auto h-10 px-4 border border-dev-border text-dev-text font-bold rounded-zela-md text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {carregando ? <Loader2 size={15} className="animate-spin" /> : null} Remover 2FA
        </button>
      </form>
    </section>
  );
}
