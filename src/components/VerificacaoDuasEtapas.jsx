import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck } from 'lucide-react';
import { toast } from '../lib/toast';
import MfaEnroll from './MfaEnroll';
import { listarFatoresVerificados, mfaObrigatorio, removerFator } from '../lib/mfa';

// Cartão de Configurações: ativar/desativar o Google Authenticator no login.
// Roles obrigatórios (ver lib/mfa.js) não podem desativar.
function roleDoCache() {
  try { return JSON.parse(localStorage.getItem('zela_user'))?.role; } catch { return undefined; }
}

export default function VerificacaoDuasEtapas({ role = roleDoCache(), dev = false }) {
  const [fatores, setFatores] = useState(null); // null = carregando
  const [cadastrando, setCadastrando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const obrigatorio = mfaObrigatorio(role);

  const carregar = useCallback(async () => {
    try { setFatores(await listarFatoresVerificados()); } catch { setFatores([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const desativar = async () => {
    if (!fatores?.[0] || !window.confirm('Desativar a verificação em duas etapas desta conta?')) return;
    setRemovendo(true);
    try {
      await removerFator(fatores[0].id);
      toast.success('Verificação em duas etapas desativada.');
      await carregar();
    } catch {
      toast.error('Não foi possível desativar agora.');
    } finally {
      setRemovendo(false);
    }
  };

  const ativo = (fatores?.length || 0) > 0;
  const caixa = dev ? 'bg-dev-surface border-dev-border' : 'bg-surface-container-lowest border-outline-variant';
  const titulo = dev ? 'text-dev-text' : 'text-on-surface';
  const texto = dev ? 'text-dev-text-muted' : 'text-on-surface-variant';

  return (
    <section className={`${caixa} border rounded-zela-lg p-4 sm:p-5 flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 shrink-0 rounded-zela-md flex items-center justify-center ${dev ? 'bg-dev-primary-container text-dev-primary' : 'bg-primary/10 text-primary'}`}><ShieldCheck size={20} /></span>
        <div className="min-w-0">
          <h3 className={`font-bold text-sm ${titulo}`}>Verificação em duas etapas</h3>
          <p className={`text-xs mt-0.5 ${texto}`}>
            {ativo
              ? 'Ativa. Depois da senha, o login pede o código do Google Authenticator.'
              : 'Depois da senha, o login passa a pedir um código do Google Authenticator. Protege a conta se a senha vazar.'}
            {obrigatorio && ' Obrigatória para o seu perfil.'}
          </p>
        </div>
      </div>
      {fatores !== null && (ativo ? (!obrigatorio && (
        <button type="button" onClick={desativar} disabled={removendo} className={`mt-auto self-start w-full sm:w-auto h-10 px-4 border font-bold rounded-zela-md text-sm transition disabled:opacity-50 ${dev ? 'border-dev-border text-dev-text-muted' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
          Desativar
        </button>
      )) : (
        <button type="button" onClick={() => setCadastrando(true)} className="mt-auto self-start w-full sm:w-auto h-10 px-4 bg-primary text-white font-bold rounded-zela-md text-sm">
          Ativar Authenticator
        </button>
      ))}
      {cadastrando && createPortal(
        <div className="fixed inset-0 z-[1000] bg-ink/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-[600px] bg-white rounded-2xl shadow-2xl p-6 my-auto text-left">
            <MfaEnroll onDone={async () => { setCadastrando(false); toast.success('Verificação em duas etapas ativada.'); await carregar(); }} onCancel={() => setCadastrando(false)} />
          </div>
        </div>
      , document.body)}
    </section>
  );
}
