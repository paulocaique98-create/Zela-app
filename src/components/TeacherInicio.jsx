import React, { useMemo } from 'react';
import { AlertCircle, FileText, ArrowRight } from 'lucide-react';

// Os 5 submenus de Relatórios viram atalhos próprios — quando um menu tem
// submenu, é o submenu que aparece nos atalhos, nunca o menu-pai sozinho.
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-obs-normalizacao', label: 'Observação de Normalização' },
  { key: 'rel-obs-concentracao', label: 'Observação de Concentração' },
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
    <div className="h-full bg-slate-50 p-4 md:p-6 lg:p-8 xl:p-10 rounded-3xl overflow-y-auto lg:overflow-hidden flex flex-col">
      <div className="max-w-4xl mx-auto w-full mt-0 lg:my-auto py-2 lg:py-0">
        <div className="mb-6 lg:mb-8 shrink-0">
          <h1 className="text-lg md:text-xl font-medium text-slate-500">
            Olá, {currentUser?.name?.split(' ')[0] || 'Professor(a)'}. O que você deseja acessar hoje?
          </h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {topMenus.map((menu) => (
            <div
              key={menu.key}
              onClick={() => handleCardClick(menu)}
              className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col items-center gap-3 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all group relative"
            >
              {menu.key === 'monitor' && monitorCount > 0 && (
                <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center animate-pulse shadow-md">
                  {monitorCount}
                </span>
              )}
              <div className="bg-indigo-50 rounded-xl p-3 group-hover:bg-indigo-100 transition-colors">
                <menu.icon className="w-5 h-5 sm:w-7 sm:h-7 text-indigo-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 text-center">{menu.label}</h3>
              <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-400 mt-auto transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
