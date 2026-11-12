import React from 'react';
import SairTodosAparelhos from './SairTodosAparelhos';
import VerificacaoDuasEtapas from './VerificacaoDuasEtapas';

// Menu horizontal das Configurações (todos os portais). Os submenus ficam
// aqui dentro, nunca na barra lateral. Cada portal passa as abas que tem;
// "Segurança" (id 'dispositivos', mantido) é a aba comum a todos: verificação em
// duas etapas e sair de todos os aparelhos; novas funções de segurança entram aqui.
export const ABA_DISPOSITIVOS = { id: 'dispositivos', label: 'Segurança' };

export function ConfigSubmenu({ abas, ativa, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-none shrink-0 mb-5 border-b border-outline-variant" role="tablist">
      {abas.map(aba => {
        const on = ativa === aba.id;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(aba.id)}
            className={`px-4 py-2.5 rounded-t-zela-md text-sm font-bold whitespace-nowrap transition border-b-2 -mb-px ${on ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            {aba.label}
          </button>
        );
      })}
    </div>
  );
}

// Página "Segurança" (Recepção, Professor e Marketing): aberta pelo submenu
// Configurações > Segurança do menu lateral. Novas funções de segurança entram aqui.
export default function ConfiguracoesPortal() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 md:p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        <VerificacaoDuasEtapas />
        <SairTodosAparelhos />
      </div>
    </div>
  );
}
