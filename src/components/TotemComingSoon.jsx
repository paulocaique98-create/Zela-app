import React from 'react';
import { Smartphone, Clock } from 'lucide-react';

export default function TotemComingSoon() {
  return (
    <div className="h-screen h-[100dvh] w-screen overflow-hidden bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-700 text-center animate-in zoom-in duration-500">
        <div className="bg-slate-700 text-slate-300 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Smartphone size={32} />
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Zela Totem</h1>
        <p className="text-slate-400 mb-8">
          O recurso de autoatendimento e reconhecimento facial está passando por melhorias e será lançado em breve como uma atualização oficial!
        </p>
        
        <div className="flex items-center justify-center gap-2 text-indigo-400 font-medium bg-indigo-500/10 py-3 px-4 rounded-xl border border-indigo-500/20">
          <Clock size={20} />
          <span>Novidades a caminho...</span>
        </div>
      </div>
    </div>
  );
}
