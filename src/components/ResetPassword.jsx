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
      (event, session) => {
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
    <div className="min-h-screen min-h-[100dvh] bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-indigo-950 rounded-2xl flex items-center justify-center shadow-inner">
            <ShieldCheck className="text-white w-8 h-8" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-2">Redefinir Senha</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">Crie uma nova senha para acessar sua conta</p>
        
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Nova Senha</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)} 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
              placeholder="••••••••" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Confirmar Nova Senha</label>
            <input 
              type="password" 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
              placeholder="••••••••" 
              required 
            />
          </div>
          
          {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{errorMsg}</div>}
          {msg && <div className="p-3 bg-green-50 text-green-700 text-sm rounded-xl border border-green-200">{msg}</div>}
          
          <button 
            type="submit" 
            disabled={isLoading || !!msg} 
            className="w-full bg-indigo-950 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-900 transition-colors mt-2 shadow-md disabled:opacity-70"
          >
            {isLoading ? 'Atualizando...' : 'Atualizar Senha'}
          </button>
          
          <div className="text-center mt-4">
            <button 
              type="button" 
              onClick={() => window.location.href = '/'} 
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition"
            >
              Voltar para o login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
