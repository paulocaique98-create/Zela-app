import React from 'react';
import { Monitor, CalendarCheck, Users, History, UserCog, QrCode, ArrowRight, Clock, UserPlus, Smartphone, Settings, Image, UtensilsCrossed, CalendarDays } from 'lucide-react';
import { useMemo } from 'react';
import { navigateTo } from '../utils/navigate';

export default function AdminInicio({ currentUser, currentSchool, setAdminTab, clickCounts = {}, registerClick = () => {}, monitorCount = 0, unreadNotifications = 0 }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const features = currentSchool?.features_enabled || {};
  
  const ADMIN_MENUS = [
    { key: 'monitor', label: 'Monitor Check-in', icon: Monitor, tab: 'monitor', feature: 'checkin', defaultOn: true },
    { key: 'presence', label: 'Presença Diária', icon: CalendarCheck, tab: 'presence', feature: 'checkin', defaultOn: true },
    { key: 'students', label: 'Lista de Alunos', icon: Users, tab: 'students', feature: 'gerenciamento', defaultOn: true },
    { key: 'history', label: 'Histórico Geral', icon: History, tab: 'history', feature: 'gerenciamento', defaultOn: true },
    { key: 'users', label: 'Gestão de Usuários', icon: UserCog, tab: 'users', feature: 'cadastros', defaultOn: true },
    { key: 'totem', label: 'Totem Check-in', icon: QrCode, tab: 'totem', feature: 'checkin', defaultOn: true, action: () => navigateTo('/admin/totem-checkin') },
    { key: 'horas-extras', label: 'Horas Extras', icon: Clock, tab: 'horas-extras', feature: 'gerenciamento', defaultOn: true },
    { key: 'register', label: 'Cadastro de Usuários', icon: UserPlus, tab: 'register', feature: 'cadastros', defaultOn: true },
    { key: 'kiosks', label: 'Gerenciar Totens', icon: Smartphone, tab: 'kiosks', feature: 'configuracoes', defaultOn: true },
    { key: 'settings', label: 'Configurações', icon: Settings, tab: 'settings', feature: 'configuracoes', defaultOn: true },
    { key: 'mural-fotos', label: 'Mural de Fotos', icon: Image, tab: 'mural-fotos', feature: 'mural', defaultOn: false },
    { key: 'cardapio', label: 'Cardápio', icon: UtensilsCrossed, tab: 'cardapio', feature: 'cardapio', defaultOn: false },
    { key: 'calendario', label: 'Calendário', icon: CalendarDays, tab: 'calendario', feature: 'calendario', defaultOn: false },
  ];

  const topMenus = useMemo(() => {
    // 1. Filtrar por módulos habilitados
    const availableMenus = ADMIN_MENUS.filter(menu => {
      if (menu.defaultOn) return features[menu.feature] !== false;
      return features[menu.feature] === true;
    });

    // 2. Ordenar por cliques (decrescente)
    const sorted = [...availableMenus].sort((a, b) => 
      (clickCounts[b.key] || 0) - (clickCounts[a.key] || 0)
    );
    
    // 3. Pegar os 6 primeiros
    return sorted.slice(0, 6);
  }, [clickCounts, features]);

  const handleCardClick = (menu) => {
    registerClick(menu.key);
    if (menu.action) {
      menu.action();
    } else {
      setAdminTab(menu.tab);
    }
  };

  return (
    <div className="h-full bg-slate-50 p-4 md:p-6 lg:p-8 xl:p-10 rounded-3xl overflow-y-auto lg:overflow-hidden flex flex-col">
      <div className="max-w-4xl mx-auto w-full mt-0 lg:my-auto py-2 lg:py-0">
        <div className="mb-6 lg:mb-8 shrink-0">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">
            {greeting}, {currentUser?.name || 'Administrador'}! 👋
          </h1>
          <p className="text-slate-500 font-medium">O que você deseja acessar hoje?</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {topMenus.map((menu) => {
            const count = clickCounts[menu.key] || 0;
            return (
              <div
                key={menu.key}
                onClick={() => handleCardClick(menu)}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col items-center gap-3 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all group relative"
              >
                {/* Badges Vermelhos */}
                {menu.key === 'monitor' && monitorCount > 0 && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center animate-pulse shadow-md">
                    {monitorCount}
                  </span>
                )}
                {menu.key === 'notificacoes' && unreadNotifications > 0 && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center animate-pulse shadow-md">
                    {unreadNotifications}
                  </span>
                )}
                {menu.key === 'comunicados' && (
                  // TODO: adicionar badge quando comunicados tiverem contagem de não lidos
                  null
                )}
                <div className="bg-indigo-50 rounded-xl p-3 group-hover:bg-indigo-100 transition-colors">
                  <menu.icon className="w-5 h-5 sm:w-7 sm:h-7 text-indigo-500" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 text-center">{menu.label}</h3>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-400 mt-auto transition-colors" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}