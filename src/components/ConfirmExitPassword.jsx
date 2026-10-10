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
    } catch {
      setError('Senha incorreta.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-ink/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-150">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 bg-brass-50 text-warning rounded-full flex items-center justify-center mb-3">
            <Lock size={24} />
          </div>
          <h3 className="font-bold text-lg text-on-surface">Confirme sua senha para sair</h3>
          <p className="text-on-surface-variant text-sm mt-1">Por segurança, digite a senha da sua conta para voltar ao painel.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Sua senha"
            className="w-full p-3 bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none text-sm"
          />
          {error && (
            <div className="bg-error/10 border border-error/30 text-error p-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
              <ShieldAlert size={14} className="shrink-0" /> {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCancel} className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-bold py-3 rounded-xl transition text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="flex-[1.5] bg-primary hover:bg-primary disabled:bg-outline-variant disabled:text-on-surface-variant text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
