import React from 'react';
import { Home, QrCode, UserCheck, History, Bell, UtensilsCrossed, ArrowRight } from 'lucide-react';

export default function FamilyInicio({ currentUser, currentSchool, setFamilyTab }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const cards = [
    { id: 'home', title: 'Acompanhamento Diário', icon: Home, action: () => setFamilyTab('acompanhamento') },
    { id: 'wallet', title: 'Carteira QR Code', icon: QrCode, action: () => setFamilyTab('wallet') },
    { id: 'authorized', title: 'Autorizados', icon: UserCheck, action: () => setFamilyTab('authorized') },
    { id: 'history', title: 'Histórico Geral', icon: History, action: () => setFamilyTab('history') },
    { id: 'comunicados', title: 'Comunicados', icon: Bell, action: () => setFamilyTab('comunicados') },
    { id: 'cardapio', title: 'Cardápio', icon: UtensilsCrossed, action: () => setFamilyTab('cardapio') }
  ];

  return (
    <div className="h-full bg-slate-50 p-6 md:p-10 rounded-3xl overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">
            {greeting}, {currentUser?.name || 'Responsável'}! 👋
          </h1>
          <p className="text-slate-500 font-medium">O que você deseja acessar hoje?</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
          {cards.map((card) => (
            <div
              key={card.id}
              onClick={card.action}
              className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all group"
            >
              <div className="bg-indigo-50 rounded-xl p-3 group-hover:bg-indigo-100 transition-colors">
                <card.icon className="w-7 h-7 text-indigo-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 text-center">{card.title}</h3>
              <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-400 mt-auto transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}