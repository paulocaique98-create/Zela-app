import React from 'react';
import { Home, QrCode, UserCheck, History, Bell, UtensilsCrossed, ArrowRight, FileText, Image, Heart, Settings } from 'lucide-react';
import { useMemo } from 'react';

export default function FamilyInicio({ currentUser, currentSchool, setFamilyTab, clickCounts = {}, registerClick = () => {} }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const features = currentSchool?.features_enabled || {};
  
  const FAMILY_MENUS = [
    { key: 'home', label: 'Acompanhamento Diário', icon: Home, tab: 'acompanhamento', feature: 'checkin', defaultOn: true },
    { key: 'wallet', label: 'Carteira QR Code', icon: QrCode, tab: 'wallet', feature: 'checkin', defaultOn: true },
    { key: 'authorized', label: 'Autorizados', icon: UserCheck, tab: 'authorized', feature: 'gerenciamento', defaultOn: true },
    { key: 'history', label: 'Histórico Geral', icon: History, tab: 'history', feature: 'gerenciamento', defaultOn: true },
    { key: 'comunicados', label: 'Comunicados', icon: Bell, tab: 'comunicados', feature: 'comunicados', defaultOn: false },
    { key: 'cardapio', label: 'Cardápio', icon: UtensilsCrossed, tab: 'cardapio', feature: 'cardapio', defaultOn: false },
    { key: 'matriculas', label: 'Matrículas', icon: FileText, tab: 'matriculas', feature: 'formularios', defaultOn: false },
    { key: 'mural-fotos', label: 'Mural de Fotos', icon: Image, tab: 'mural-fotos', feature: 'mural', defaultOn: false },
    { key: 'ficha-medica', label: 'Ficha Médica', icon: Heart, tab: 'ficha-medica', feature: 'formularios', defaultOn: false },
    { key: 'settings', label: 'Configurações', icon: Settings, tab: 'settings', feature: 'configuracoes', defaultOn: true },
  ];

  const topMenus = useMemo(() => {
    // 1. Filtrar por módulos habilitados
    const availableMenus = FAMILY_MENUS.filter(menu => {
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
      setFamilyTab(menu.tab);
    }
  };

  return (
    <div className="h-full bg-slate-50 p-6 md:p-10 rounded-3xl overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">
            {greeting}, {currentUser?.name?.split(' ')[0] || 'Responsável'}! 👋
          </h1>
          <p className="text-slate-500 font-medium">O que você deseja acessar hoje?</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
          {topMenus.map((menu) => {
            const count = clickCounts[menu.key] || 0;
            return (
              <div
                key={menu.key}
                onClick={() => handleCardClick(menu)}
                className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all group relative"
              >
                {count > 0 && (
                  <span className="absolute top-3 right-3 text-[10px] font-semibold text-slate-300">
                    {count} {count === 1 ? 'acesso' : 'acessos'}
                  </span>
                )}
                <div className="bg-indigo-50 rounded-xl p-3 group-hover:bg-indigo-100 transition-colors">
                  <menu.icon className="w-7 h-7 text-indigo-500" />
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