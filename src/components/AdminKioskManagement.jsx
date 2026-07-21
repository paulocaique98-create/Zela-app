import React from 'react';
import { Smartphone, Clock } from 'lucide-react';

export default function AdminKioskManagement() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
      <div className="bg-slate-100 text-slate-400 w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-slate-200">
        <Smartphone size={40} />
      </div>
      <h1 className="text-3xl font-black text-slate-800 mb-4">Gerenciamento de Totens</h1>
      <p className="text-slate-500 max-w-lg mb-8 text-lg">
        Estamos reescrevendo todo o ecossistema do Zela Totem para trazer reconhecimento facial ultrarrápido e inteligência artificial avançada. 
        Este módulo retornará em breve numa atualização oficial!
      </p>
      
      <div className="inline-flex items-center gap-3 bg-indigo-50 text-indigo-700 font-semibold py-3 px-6 rounded-xl border border-indigo-100">
        <Clock size={20} />
        Em Desenvolvimento...
      </div>
    </div>
  );
}
