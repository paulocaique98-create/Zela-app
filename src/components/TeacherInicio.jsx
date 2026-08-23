import React, { useMemo } from 'react';
import { AlertCircle, FileText, ArrowRight } from 'lucide-react';

// Os 5 submenus de Relatórios viram atalhos próprios — quando um menu tem
// submenu, é o submenu que aparece nos atalhos, nunca o menu-pai sozinho.
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
  { key: 'rel-semestral', label: 'Semestral' },
];

export default function TeacherInicio({ currentUser, setTeacherTab, clickCounts = {}, registerClick = () => {}, monitorCount = 0 }) {
  const TEACHER_MENUS = [
    { key: 'monitor', label: 'Monitor', icon: AlertCircle, tab: 'monitor' },
    ...RELATORIOS_SUBMENU.map(r => ({ key: r.key, label: r.label, icon: FileText, tab: r.key })),
  ];

  const topMenus = useMemo(() => {
    return [...TEACHER_MENUS].sort((a, b) => (clickCounts[b.key] || 0) - (clickCounts[a.key] || 0));
  }, [clickCounts]);

  const handleCardClick = (menu) => {
    registerClick(menu.key);
    setTeacherTab(menu.tab);
  };

  return (
    <div className="h-full bg-surface p-4 md:p-6 lg:p-8 xl:p-10 overflow-y-auto flex flex-col">
      <div className="w-full mt-0">
        <div className="mb-6 lg:mb-8 shrink-0">
          <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">
            Olá, {currentUser?.name?.split(' ')[0] || 'Professor(a)'}
          </h1>
          <p className="text-small text-on-surface-variant mt-1">O que você deseja acessar hoje?</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {topMenus.map((menu) => (
            <button
              key={menu.key}
              onClick={() => handleCardClick(menu)}
              className="bg-surface-container-lowest p-4 rounded-zela-lg shadow-sm hover:shadow-md hover:-translate-y-1 transition-all flex flex-col items-start gap-3 text-left relative"
            >
              {menu.key === 'monitor' && monitorCount > 0 && (
                <span className="absolute top-3 right-3 bg-error text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center animate-pulse shadow-md">
                  {monitorCount}
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
