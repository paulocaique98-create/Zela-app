import React, { useState } from 'react';
import { ShieldCheck, Loader2, ShieldAlert } from 'lucide-react';
import { verificarCodigo } from '../lib/mfa';

// Passo 2 do login: código de 6 dígitos do Google Authenticator (depois da senha).
export default function MfaChallenge({ factorId, onVerified, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await verificarCodigo(factorId, code);
      await onVerified();
    } catch (err) {
      setError(err?.message || 'Não foi possível validar o código.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-brass-50 text-warning rounded-full flex items-center justify-center mb-3">
          <ShieldCheck size={24} />
        </div>
        <h3 className="font-bold text-lg text-on-surface">Verificação em duas etapas</h3>
        <p className="text-on-surface-variant text-sm mt-1">Abra o Google Authenticator e digite o código de 6 números da sua conta Zela.</p>
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        className="w-full p-3 text-center text-2xl tracking-[0.5em] bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none"
      />
      {error && (
        <div className="bg-error/10 border border-error/30 text-error p-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
          <ShieldAlert size={14} /> {error}
        </div>
      )}
      <button
        type="submit"
        disabled={isLoading || code.length !== 6}
        className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
      </button>
      <button type="button" onClick={onCancel} className="w-full text-sm text-on-surface-variant underline">
        Voltar ao login
      </button>
    </form>
  );
}
