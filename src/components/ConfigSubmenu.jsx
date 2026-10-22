import React from 'react';
import SairTodosAparelhos from './SairTodosAparelhos';

// Menu horizontal das Configurações (todos os portais). Os submenus ficam
// aqui dentro, nunca na barra lateral. Cada portal passa as abas que tem;
// "Dispositivos" é a primeira aba comum a todos.
export const ABA_DISPOSITIVOS = { id: 'dispositivos', label: 'Dispositivos' };

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

// Tela de Configurações dos portais que ainda não tinham uma (Recepção e
// Professor). Novas abas entram na lista ABAS.
const ABAS = [ABA_DISPOSITIVOS];

export default function ConfiguracoesPortal() {
  const [aba, setAba] = React.useState(ABA_DISPOSITIVOS.id);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 md:p-6">
      <ConfigSubmenu abas={ABAS} ativa={aba} onChange={setAba} />
      <div className="max-w-3xl">
        {aba === 'dispositivos' && <SairTodosAparelhos />}
      </div>
    </div>
  );
}
