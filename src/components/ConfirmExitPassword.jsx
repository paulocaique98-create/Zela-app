import React, { useState } from 'react';
import { Lock, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Confirmação de saída do Autoatendimento (Reconhecimento Facial / Senha-PIN):
// a tela fica exposta pra qualquer pessoa (pais, visitantes) durante o check-in,
// então sair dela de volta ao painel completo exige a senha da própria conta do
// admin — evita que alguém sem permissão feche e navegue pelo resto do sistema.
export default function ConfirmExitPassword({ email, onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || !email) return;
    setIsLoading(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      onConfirm();
    } catch (err) {
      setError('Senha incorreta.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-150">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-3">
            <Lock size={24} />
          </div>
          <h3 className="font-bold text-lg text-slate-800">Confirme sua senha para sair</h3>
          <p className="text-slate-500 text-sm mt-1">Por segurança, digite a senha da sua conta para voltar ao painel.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Sua senha"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
          />
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
              <ShieldAlert size={14} className="shrink-0" /> {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCancel} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="flex-[1.5] bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
