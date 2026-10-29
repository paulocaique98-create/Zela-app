import React, { useState } from 'react';
import { CobrancasTab } from './AdminFinanceiro';
import { AcordosTab } from './GestaoAcordos';

// Inadimplência da Gestão: cobranças atrasadas (com Negociar) e os acordos de dívida.
export default function GestaoInadimplencia({ currentUser }) {
  const [aba, setAba] = useState('atrasadas');
  const abas = [{ id: 'atrasadas', label: 'Atrasadas' }, { id: 'acordos', label: 'Acordos' }];
  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-outline-variant" role="tablist">
        {abas.map(a => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition ${aba === a.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            {a.label}
          </button>
        ))}
      </div>
      {aba === 'atrasadas'
        ? <CobrancasTab key="overdue" currentUser={currentUser} initialStatus="OVERDUE" canRegisterPayment canNegotiate />
        : <AcordosTab currentUser={currentUser} />}
    </div>
  );
}
