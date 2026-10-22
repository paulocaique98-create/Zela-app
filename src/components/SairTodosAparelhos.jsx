import React, { useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { EVENTO_SAIR_TODOS_APARELHOS } from '../lib/sessao';

// Cartão de Configurações (todos os portais): encerra a sessão desta conta em
// todos os aparelhos. O "Sair" normal continua valendo só para o aparelho
// atual. Quem faz o logout de fato é o App (ouve o evento).
export default function SairTodosAparelhos({ dev = false }) {
  const [confirmando, setConfirmando] = useState(false);

  const confirmar = () => {
    setConfirmando(false);
    window.dispatchEvent(new CustomEvent(EVENTO_SAIR_TODOS_APARELHOS));
  };

  return (
    <>
      <section className={`${dev ? 'bg-dev-surface border-dev-border' : 'bg-surface-container-lowest border-outline-variant'} border rounded-zela-lg p-4 sm:p-5 space-y-3`}>
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 shrink-0 rounded-zela-md flex items-center justify-center ${dev ? 'bg-dev-primary-container text-dev-primary' : 'bg-primary/10 text-primary'}`}><MonitorSmartphone size={20} /></span>
          <div className="min-w-0">
            <h3 className={`font-bold text-sm ${dev ? 'text-dev-text' : 'text-on-surface'}`}>Sair de todos os aparelhos</h3>
            <p className={`text-xs mt-0.5 ${dev ? 'text-dev-text-muted' : 'text-on-surface-variant'}`}>Encerra o seu acesso em todos os celulares, tablets e computadores, inclusive neste. Use se perdeu um aparelho ou entrou em um computador que não é seu.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className={`w-full sm:w-auto h-10 px-4 border font-bold rounded-zela-md text-sm transition inline-flex items-center justify-center gap-2 ${dev ? 'border-dev-border text-dev-text-muted hover:bg-dev-bg' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}
        >
          <MonitorSmartphone size={15} /> Sair de todos os aparelhos
        </button>
      </section>
      {confirmando && (
        <ConfirmModal
          title="Sair de todos os aparelhos?"
          message="Você vai precisar entrar de novo com e-mail e senha em cada aparelho, inclusive neste."
          confirmLabel="Sair de todos"
          cancelLabel="Voltar"
          danger
          onConfirm={confirmar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
