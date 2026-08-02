import React from 'react';
import { Monitor, CalendarCheck, Users, History, UserCog, QrCode, ArrowRight } from 'lucide-react';

export default function AdminInicio({ currentUser, currentSchool, setAdminTab }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const cards = [
    { id: 'monitor', title: 'Monitor Check-in', icon: Monitor, action: () => setAdminTab('monitor') },
    { id: 'presence', title: 'Presença Diária', icon: CalendarCheck, action: () => setAdminTab('presence') },
    { id: 'students', title: 'Lista de Alunos', icon: Users, action: () => setAdminTab('students') },
    { id: 'history', title: 'Histórico Geral', icon: History, action: () => setAdminTab('history') },
    { id: 'users', title: 'Gestão de Usuários', icon: UserCog, action: () => setAdminTab('users') },
    { id: 'totem', title: 'Totem Check-in', icon: QrCode, action: () => window.location.href = '/admin/totem-checkin' }
  ];

  return (
    <div className="h-full bg-slate-50 p-6 md:p-10 rounded-3xl overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">
            {greeting}, {currentUser?.name || 'Administrador'}! 👋
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