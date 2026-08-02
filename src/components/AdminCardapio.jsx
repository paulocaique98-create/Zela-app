import React from 'react';
import { UtensilsCrossed } from 'lucide-react';

export default function AdminCardapio() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
        <UtensilsCrossed className="text-indigo-500 w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Cardápio</h2>
      <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full mb-3">
        Em desenvolvimento
      </span>
      <p className="text-slate-500 text-sm max-w-sm">
        Configure o cardápio semanal da escola dia a dia.
      </p>
    </div>
  );
}
