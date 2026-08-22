import React, { useState, lazy, Suspense } from 'react';
import { Home, AlertCircle, FileText, ChevronDown } from 'lucide-react';
import LoadingLogo from './LoadingLogo';
import { useMenuClicks } from '../hooks/useMenuClicks';

// Lazy: mesmo padrão de code-splitting já usado no AdminPortal/FamilyPortal —
// cada tela só entra no bundle quando o professor realmente abre aquela aba.
const TeacherInicio = lazy(() => import('./TeacherInicio'));
const TeacherMonitor = lazy(() => import('./TeacherMonitor'));
const AdminRelatorioPlaceholder = lazy(() => import('./AdminRelatorioPlaceholder'));

// Mesmos submenus, mesmas chaves de aba e mesma ordem do menu Relatórios do
// AdminPortal — pedido explícito pra ficar "exatamente igual".
const RELATORIOS_SUBMENU = [
  { key: 'rel-mitigacao', label: 'Mitigação' },
  { key: 'rel-obs-normalizacao', label: 'Observação de Normalização' },
  { key: 'rel-obs-concentracao', label: 'Observação de Concentração' },
  { key: 'rel-mapa-habilidades', label: 'Mapa de Habilidades' },
  { key: 'rel-semestral', label: 'Semestral' },
];

export default function TeacherPortal({
  currentUser, currentSchool,
  students, authorized,
  teacherTab, setTeacherTab,
  isMobileMenuOpen, setIsMobileMenuOpen,
  onLogout,
}) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => setOpenAccordion(openAccordion === name ? null : name);
  const isBlocked = currentUser?.teacher_status && currentUser.teacher_status !== 'ativo';
  const moduleEnabled = currentSchool?.features_enabled?.relatorios_pedagogicos === true;

  if (!moduleEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center max-w-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Módulo não disponível</h2>
          <p className="text-slate-500 text-sm">
            O Módulo Pedagógico ainda não foi contratado para esta escola. Fale com a administração.
          </p>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center max-w-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Acesso indisponível</h2>
          <p className="text-slate-500 text-sm">
            Sua conta de professor está {currentUser.teacher_status === 'bloqueado' ? 'bloqueada' : 'inativa'}.
            Entre em contato com a administração da escola.
          </p>
        </div>
      </div>
    );
  }

  const monitorCount = (students || []).filter(s => ['pending_entry', 'pending_exit'].includes(s.status)).length;

  const navItems = [
    { key: 'home', label: 'Início', icon: Home },
    { key: 'monitor', label: 'Monitor', icon: AlertCircle, badge: monitorCount },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in md:relative">
      {/* MENU LATERAL (SIDEBAR) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        onMouseLeave={() => setOpenAccordion(null)}
        className={`group fixed md:relative top-0 left-0 h-[100dvh] md:h-full w-64 md:w-16 md:hover:w-52 shrink-0 z-20 md:z-auto transform transition-all duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-full bg-white p-3 pt-[68px] md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-200 flex flex-col overflow-y-auto overflow-x-hidden">
          <nav className="flex-1 flex flex-col gap-0.5 min-h-0 pr-0.5 overflow-y-auto overflow-x-hidden pb-4">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => { setTeacherTab(item.key); registerClick(item.key); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all md:justify-center md:group-hover:justify-start ${teacherTab === item.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <item.icon size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">{item.label}</span>
                {!!item.badge && (
                  <span className="ml-auto bg-amber-500 text-white text-[9px] font-black rounded-full w-4 h-4 shrink-0 flex items-center justify-center animate-pulse md:hidden md:group-hover:flex">{item.badge}</span>
                )}
              </button>
            ))}

            {/* RELATÓRIOS PEDAGÓGICOS — mesma estrutura do menu Relatórios do AdminPortal */}
            <div>
              <button
                onClick={() => toggleAccordion('relatorios')}
                className={`w-full flex items-center md:justify-center md:group-hover:justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${RELATORIOS_SUBMENU.some(r => r.key === teacherTab) || openAccordion === 'relatorios' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <div className="flex items-center gap-2"><FileText size={18} className="shrink-0" /> <span className="whitespace-nowrap md:hidden md:group-hover:inline">Relatórios</span></div>
                <ChevronDown size={14} className={`shrink-0 md:hidden md:group-hover:block transition-transform duration-200 ${openAccordion === 'relatorios' ? 'rotate-180' : ''}`} />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${openAccordion === 'relatorios' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                <div className="flex flex-col gap-0.5 pl-9 pr-2 py-1">
                  {RELATORIOS_SUBMENU.map(r => (
                    <button key={r.key} onClick={() => { setTeacherTab(r.key); registerClick(r.key); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${teacherTab === r.key ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                  ))}
                </div>
                </div>
              </div>
            </div>
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>
          {teacherTab === 'home' && (
            <TeacherInicio currentUser={currentUser} setTeacherTab={setTeacherTab} clickCounts={clickCounts} registerClick={registerClick} monitorCount={monitorCount} />
          )}
          {teacherTab === 'monitor' && (
            <TeacherMonitor students={students || []} authorized={authorized} />
          )}
          {RELATORIOS_SUBMENU.map(r => teacherTab === r.key && (
            <AdminRelatorioPlaceholder key={r.key} title={r.label} />
          ))}
        </Suspense>
      </main>
    </div>
  );
}
