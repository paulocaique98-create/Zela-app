import React from 'react';
import { Monitor, CalendarCheck, Users, History, UserCog, ShieldCheck, ArrowRight, Clock, UserPlus, Settings, Image, UtensilsCrossed, CalendarDays, Megaphone, FileText } from 'lucide-react';
import { useMemo } from 'react';

export default function AdminInicio({ currentUser, currentSchool, setAdminTab, clickCounts = {}, registerClick = () => {}, monitorCount = 0, unreadNotifications = 0 }) {
  const features = currentSchool?.features_enabled || {};
  
  const ADMIN_MENUS = [
    { key: 'monitor', label: 'Monitor Check-in', icon: Monitor, tab: 'monitor', feature: 'checkin', defaultOn: true },
    { key: 'presence', label: 'Presença Diária', icon: CalendarCheck, tab: 'presence', feature: 'checkin', defaultOn: true },
    { key: 'students', label: 'Lista de Alunos', icon: Users, tab: 'students', feature: 'gerenciamento', defaultOn: true },
    { key: 'history', label: 'Histórico Geral', icon: History, tab: 'history', feature: 'gerenciamento', defaultOn: true },
    { key: 'users', label: 'Gestão de Usuários', icon: UserCog, tab: 'users', feature: 'cadastros', defaultOn: true },
    { key: 'kiosk', label: 'Autoatendimento', icon: ShieldCheck, tab: 'kiosk', feature: 'checkin', defaultOn: true },
    { key: 'horas-extras', label: 'Horas Extras', icon: Clock, tab: 'horas-extras', feature: 'gerenciamento', defaultOn: true },
    { key: 'register', label: 'Cadastro de Usuários', icon: UserPlus, tab: 'register', feature: 'cadastros', defaultOn: true },
    { key: 'settings', label: 'Configurações', icon: Settings, tab: 'settings', feature: 'configuracoes', defaultOn: true },
    { key: 'mural-fotos', label: 'Mural de Fotos', icon: Image, tab: 'mural-fotos', feature: 'mural', defaultOn: false },
    { key: 'cardapio', label: 'Cardápio', icon: UtensilsCrossed, tab: 'cardapio', feature: 'cardapio', defaultOn: false },
    { key: 'calendario', label: 'Calendário', icon: CalendarDays, tab: 'calendario', feature: 'calendario', defaultOn: false },
    { key: 'comunicados', label: 'Comunicados', icon: Megaphone, tab: 'cadastro-comunicados', feature: 'comunicados', defaultOn: false },
    { key: 'relatorios', label: 'Relatórios', icon: FileText, tab: 'rel-mitigacao', feature: 'relatorios_pedagogicos', defaultOn: false },
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
    
    // 3. Sempre 8 cards
    return sorted.slice(0, 8);
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
    <div className="h-full bg-surface p-4 md:p-6 lg:p-8 xl:p-10 overflow-y-auto flex flex-col">
      <div className="w-full mt-0">
        <div className="mb-6 lg:mb-8 shrink-0">
          <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">Ações Rápidas</h1>
          <p className="text-small text-on-surface-variant mt-1">O que você deseja acessar hoje?</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {topMenus.map((menu, index) => (
            <button
              key={menu.key}
              onClick={() => handleCardClick(menu)}
              className={`bg-surface-container-lowest p-4 rounded-zela-lg shadow-sm hover:shadow-md hover:-translate-y-1 transition-all flex-col items-start gap-3 text-left relative ${index >= 6 ? 'hidden lg:flex' : 'flex'}`}
            >
              {/* Badges Vermelhos */}
              {menu.key === 'monitor' && monitorCount > 0 && (
                <span className="absolute top-3 right-3 bg-error text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center animate-pulse shadow-md">
                  {monitorCount}
                </span>
              )}
              {menu.key === 'notificacoes' && unreadNotifications > 0 && (
                <span className="absolute top-3 right-3 bg-error text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center animate-pulse shadow-md">
                  {unreadNotifications}
                </span>
              )}
              <div className="w-10 h-10 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center">
                <menu.icon size={20} />
              </div>
              <div>
                <span className="text-label text-on-surface block">{menu.label}</span>
                <span className="text-caption text-on-surface-variant flex items-center gap-1 mt-0.5">
                  Acessar <ArrowRight size={11} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}