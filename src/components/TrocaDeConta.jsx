import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Link2, Unlink, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import ConfirmModal from './ConfirmModal';
import { tituloDaConta, totalNaoLidas, mostrarBotaoDeContas, mensagemDaFuncao } from '../lib/contasVinculadas';

// Botão ao lado do "Sair": lista as contas vinculadas da pessoa (ex.:
// Coordenação e Responsável) e troca entre elas sem digitar senha. Quem
// ainda não tem vínculo vincula por aqui, digitando uma vez o e-mail e a
// senha da outra conta. Regras em src/lib/contasVinculadas.js.
export default function TrocaDeConta({ currentUser, onTrocar }) {
  const [contas, setContas] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [desvincular, setDesvincular] = useState(null);
  const caixaRef = useRef(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_contas_vinculadas');
    if (!error) setContas(data || []);
  }, []);

  useEffect(() => {
    if (!currentUser?.id || currentUser.role === 'developer') return undefined;
    carregar();
    const intervalo = setInterval(carregar, 120000);
    return () => clearInterval(intervalo);
  }, [currentUser?.id, currentUser?.role, carregar]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = (e) => { if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  if (!mostrarBotaoDeContas(currentUser?.role, contas)) return null;

  const outras = contas.filter(c => !c.atual);
  const naoLidas = totalNaoLidas(contas);

  const confirmarDesvinculo = async () => {
    const conta = desvincular;
    setDesvincular(null);
    const { error } = await supabase.rpc('desvincular_conta', { p_user_id: conta.user_id });
    if (error) {
      toast.error('Não foi possível desvincular a conta.');
      return;
    }
    toast.success('Conta desvinculada.');
    carregar();
  };

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => { setAberto(v => !v); if (!aberto) carregar(); }}
        className="relative p-2 rounded-zela-sm transition flex items-center justify-center active:scale-95 text-on-surface-variant hover:text-primary hover:bg-surface-container-low"
        title="Trocar de conta"
        aria-label="Trocar de conta"
        aria-expanded={aberto}
      >
        <ChevronDown size={20} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} />
        {naoLidas > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error" />}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] bg-surface-container-lowest border border-outline-variant rounded-zela-lg shadow-lg z-50 overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Suas contas</p>
          <ul className="pb-1">
            {contas.length === 0 && (
              <li className="px-4 py-2 flex items-center gap-3">
                <Check size={16} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{currentUser.name}</p>
                  <p className="text-xs text-on-surface-variant">Aberta agora</p>
                </div>
              </li>
            )}
            {contas.map(conta => (
              <li key={conta.user_id} className="flex items-center">
                <button
                  type="button"
                  disabled={conta.atual}
                  onClick={() => { setAberto(false); onTrocar(conta.user_id); }}
                  className={`flex-1 min-w-0 px-4 py-2 flex items-center gap-3 text-left ${conta.atual ? 'cursor-default' : 'hover:bg-surface-container-low'}`}
                >
                  {conta.atual ? <Check size={16} className="text-primary shrink-0" /> : <span className="w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface truncate">{tituloDaConta(conta)}</p>
                    <p className="text-xs text-on-surface-variant truncate">{conta.atual ? 'Aberta agora' : conta.name}</p>
                  </div>
                  {!conta.atual && conta.nao_lidas > 0 && (
                    <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-error text-white text-[11px] font-bold flex items-center justify-center">{conta.nao_lidas}</span>
                  )}
                </button>
                {!conta.atual && (
                  <button
                    type="button"
                    onClick={() => setDesvincular(conta)}
                    className="p-2 mr-2 rounded-zela-sm text-on-surface-variant hover:text-error hover:bg-red-50"
                    title="Desvincular esta conta"
                    aria-label="Desvincular esta conta"
                  >
                    <Unlink size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => { setAberto(false); setVinculando(true); }}
            className="w-full px-4 py-3 border-t border-outline-variant flex items-center gap-3 text-sm font-semibold text-primary hover:bg-surface-container-low"
          >
            <Link2 size={16} /> Vincular outra conta
          </button>
          {outras.length === 0 && (
            <p className="px-4 pb-3 -mt-1 text-xs text-on-surface-variant">Tem outra conta no Zela, como a de responsável? Vincule para trocar sem digitar a senha.</p>
          )}
        </div>
      )}

      {vinculando && createPortal(
        <VincularContaModal onClose={() => setVinculando(false)} onVinculada={() => { setVinculando(false); carregar(); }} />,
        document.body,
      )}
      {desvincular && createPortal(
        <ConfirmModal
          title="Desvincular conta?"
          message={`"${tituloDaConta(desvincular)}" deixa de aparecer aqui. Para vincular de novo, será preciso a senha dela.`}
          confirmLabel="Desvincular"
          cancelLabel="Voltar"
          onConfirm={confirmarDesvinculo}
          onCancel={() => setDesvincular(null)}
        />,
        document.body,
      )}
    </div>
  );
}

function VincularContaModal({ onClose, onVinculada }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const { data, error } = await supabase.functions.invoke('vincular-conta', { body: { email, password: senha } });
      if (error || !data?.ok) {
        setErro(await mensagemDaFuncao(error, 'Não foi possível vincular agora. Tente de novo.'));
        return;
      }
      toast.success('Conta vinculada. Agora é só trocar pelo botão ao lado do Sair.');
      onVinculada();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <form
        onSubmit={enviar}
        onMouseDown={e => e.stopPropagation()}
        className="w-full max-w-sm bg-surface-container-lowest rounded-zela-xl shadow-xl border border-outline-variant p-5 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-on-surface">Vincular outra conta</h2>
            <p className="text-sm text-on-surface-variant mt-1">Use o e-mail e a senha da sua outra conta no Zela. Você só faz isso uma vez.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-zela-sm text-on-surface-variant hover:bg-surface-container-low" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wide">E-mail da outra conta</span>
            <input id="vincular-email" type="email" required autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wide">Senha da outra conta</span>
            <input id="vincular-senha" type="password" required autoComplete="off" value={senha} onChange={e => setSenha(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
          </label>
        </div>
        {erro && <p className="text-sm text-error">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-zela-md text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancelar</button>
          <button type="submit" disabled={salvando} className="px-4 py-2 rounded-zela-md text-sm font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2">
            {salvando && <Loader2 size={15} className="animate-spin" />} Vincular
          </button>
        </div>
      </form>
    </div>
  );
}
