import React, { useMemo } from 'react';
import { AlertCircle, ClipboardCheck, FileText } from 'lucide-react';

// Os 5 submenus de Relatórios viram atalhos próprios — quando um menu tem
// submenu, é o submenu que aparece nos atalhos, nunca o menu-pai sozinho.
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
];

export default function TeacherInicio({ currentUser, setTeacherTab, clickCounts = {}, registerClick = () => {}, monitorCount = 0, showFrequencia = false }) {
  const TEACHER_MENUS = [
    { key: 'monitor', label: 'Monitor', icon: AlertCircle, tab: 'monitor' },
    ...(showFrequencia ? [{ key: 'frequencia', label: 'Frequência', icon: ClipboardCheck, tab: 'frequencia' }] : []),
    ...RELATORIOS_SUBMENU.map(r => ({ key: r.key, label: r.label, icon: FileText, tab: r.key })),
  ];

  const topMenus = useMemo(() => {
    return [...TEACHER_MENUS].sort((a, b) => (clickCounts[b.key] || 0) - (clickCounts[a.key] || 0));
  }, [clickCounts, showFrequencia]);

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

        <div className="grid grid-cols-2 sm:landscape:grid-cols-3 xl:landscape:grid-cols-4 gap-4">
          {topMenus.map((menu) => (
            <button
              key={menu.key}
              onClick={() => handleCardClick(menu)}
              className="bg-surface-container-lowest p-4 min-h-[88px] rounded-zela-lg border border-outline-variant hover:border-primary transition-colors flex flex-col items-start gap-3 text-left relative"
            >
              {menu.key === 'monitor' && monitorCount > 0 && (
                <span className="absolute top-3 right-3 bg-error text-white text-xs font-bold rounded-sm min-w-[20px] h-5 px-1.5 flex items-center justify-center motion-safe:animate-pulse">
                  {monitorCount}
                </span>
              )}
              <div className="w-10 h-10 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center">
                <menu.icon size={20} aria-hidden="true" />
              </div>
              <span className="text-label text-on-surface block">{menu.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
