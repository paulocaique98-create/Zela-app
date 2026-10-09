import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Escuta a troca do token na URL, que o Supabase faz automaticamente
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, _session) => {
        if (event === 'PASSWORD_RECOVERY') {
          console.log('[ResetPassword] Recuperação iniciada.');
        }
      }
    );
    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setMsg('');

    if (newPassword !== confirmPassword) {
      setErrorMsg('As senhas não coincidem.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      // Atualiza a senha do usuário atualmente logado (o token na URL loga o usuário)
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;
      
      setMsg('Senha atualizada com sucesso! Redirecionando...');
      setTimeout(() => {
        window.location.href = '/'; // Redireciona para o login
      }, 2000);
    } catch (err) {
      console.error('[ResetPassword] Erro ao atualizar senha:', err);
      setErrorMsg(err.message || 'Erro ao atualizar senha. O link pode ter expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-surface flex items-center justify-center p-4 font-sans text-on-surface">
      <div className="bg-surface-container-lowest p-6 md:p-8 rounded-lg w-full max-w-md border border-outline-variant">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-primary rounded-md flex items-center justify-center">
            <ShieldCheck className="text-white w-7 h-7" aria-hidden="true" />
          </div>
        </div>
        <h1 className="font-serif text-2xl font-bold text-center mb-2">Redefinir senha</h1>
        <p className="text-center text-on-surface-variant mb-8 text-sm">Crie uma nova senha para acessar sua conta</p>
        
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Nova senha</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)} 
              className="w-full p-3 bg-surface-container-lowest border border-outline-variant rounded-md focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" 
              placeholder="••••••••" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Confirmar nova senha</label>
            <input 
              type="password" 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              className="w-full p-3 bg-surface-container-lowest border border-outline-variant rounded-md focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" 
              placeholder="••••••••" 
              required 
            />
          </div>
          
          {errorMsg && <div className="p-3 bg-error/5 text-error text-sm rounded-md border border-error/30" role="alert">{errorMsg}</div>}
          {msg && <div className="p-3 bg-success/5 text-success text-sm rounded-md border border-success/30" role="status">{msg}</div>}
          
          <button 
            type="submit" 
            disabled={isLoading || !!msg} 
            className="w-full bg-primary text-white font-bold py-3.5 rounded-md hover:bg-primary-container transition-colors mt-2 disabled:opacity-70"
          >
            {isLoading ? 'Atualizando...' : 'Atualizar senha'}
          </button>
          
          <div className="text-center mt-4">
            <button 
              type="button" 
              onClick={() => window.location.href = '/'} 
              className="text-sm font-semibold text-primary hover:underline underline-offset-4 transition"
            >
              Voltar para o login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
