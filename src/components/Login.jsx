import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login({ onLogin }) {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');

    try {
      // 1. Autenticar com o Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) {
        // Extrai mensagem de forma segura de qualquer tipo de erro
        const msg = typeof authError === 'string'
          ? authError
          : authError?.message || authError?.error_description || JSON.stringify(authError);
        console.error('[Login] Auth error:', authError);

        if (authError.status === 400 || msg.toLowerCase().includes('invalid')) {
          setLoginError('E-mail ou senha incorretos.');
        } else {
          setLoginError(msg || 'Erro ao realizar login. Tente novamente.');
        }
        return;
      }

      // 2. Buscar o perfil correspondente na tabela pública 'users'
      const { data: users, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id);

      if (dbError) {
        console.error('[Login] DB error:', dbError);
        throw dbError;
      }

      if (users && users.length > 0) {
        onLogin(users[0]);
      } else {
        // Fallback: monta perfil a partir dos metadados do JWT
        const meta = authData.user.user_metadata;
        if (meta?.role) {
          console.warn('[Login] Perfil não encontrado na tabela users, usando metadados JWT.');
          onLogin({
            id: authData.user.id,
            email: authData.user.email,
            name: meta.name || authData.user.email,
            role: meta.role,
            school_id: meta.school_id || null,
          });
        } else {
          setLoginError('Perfil do usuário não encontrado. Contate o administrador.');
        }
      }
    } catch (err) {
      console.error('[Login] Catch error:', err);
      const msg = err?.message || err?.error_description || 'Erro ao conectar ao banco de dados.';
      setLoginError(typeof msg === 'string' ? msg : 'Erro inesperado. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-indigo-950 rounded-2xl flex items-center justify-center shadow-inner">
            <ShieldCheck className="text-white w-8 h-8" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-2">Acesso Zela</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">Portal de Gestão e Segurança Escolar</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">E-mail</label>
            <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="seu@email.com" required />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Senha</label>
            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="••••••••" required />
          </div>
          {loginError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{loginError}</div>}
          <button type="submit" disabled={isLoading} className="w-full bg-indigo-950 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-900 transition-colors mt-2 shadow-md disabled:opacity-70">
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
