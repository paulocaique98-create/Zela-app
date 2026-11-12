import React, { useEffect, useState } from 'react';
import { ShieldCheck, Loader2, ShieldAlert, X } from 'lucide-react';
import { iniciarCadastroTotp, verificarCodigo } from '../lib/mfa';

// Cadastro do Google Authenticator: QR Code + confirmação com o primeiro código.
// obrigatorio = true: sem botão de cancelar (role que exige 2FA).
export default function MfaEnroll({ obrigatorio = false, onDone, onCancel }) {
  const [dados, setDados] = useState(null); // { factorId, qr, segredo }
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    iniciarCadastroTotp()
      .then(d => { if (ativo) setDados(d); })
      .catch((err) => {
        console.error('[MFA] enroll falhou:', err);
        if (ativo) setError(`Não foi possível iniciar o cadastro (${err?.message || 'erro desconhecido'}).`);
      })
      .finally(() => { if (ativo) setIsLoading(false); });
    return () => { ativo = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dados) return;
    setIsLoading(true);
    setError('');
    try {
      await verificarCodigo(dados.factorId, code);
      await onDone();
    } catch (err) {
      setError(err?.message || 'Não foi possível confirmar o código.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!obrigatorio && onCancel && (
        <button type="button" onClick={onCancel} aria-label="Fechar" className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low">
          <X size={20} />
        </button>
      )}
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-brass-50 text-warning rounded-full flex items-center justify-center mb-3">
          <ShieldCheck size={24} />
        </div>
        <h3 className="font-bold text-lg text-on-surface">Ativar verificação em duas etapas</h3>
        <p className="text-on-surface-variant text-sm mt-1">
          1) Instale o Google Authenticator. 2) Escaneie o QR Code. 3) Digite o código de 6 números que aparecer.
        </p>
      </div>
      {dados && (
        <div className="flex flex-col items-center gap-2">
          <img src={dados.qr} alt="QR Code do Authenticator" className="w-44 h-44 bg-white p-2 rounded-xl border border-outline-variant" />
          <p className="text-xs text-on-surface-variant text-center break-all">
            Sem câmera? Digite este código no app:<br />
            <span className="font-mono select-all">{dados.segredo}</span>
          </p>
        </div>
      )}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
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
        disabled={isLoading || !dados || code.length !== 6}
        className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Ativar'}
      </button>
    </form>
  );
}
