import React from 'react';
import { Megaphone } from 'lucide-react';

export default function AdminComunicados() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
        <Megaphone className="text-indigo-500 w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Comunicados</h2>
      <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full mb-3">
        Em desenvolvimento
      </span>
      <p className="text-slate-500 text-sm max-w-sm">
        Crie e gerencie comunicados para as famílias e turmas.
      </p>
    </div>
  );
}
