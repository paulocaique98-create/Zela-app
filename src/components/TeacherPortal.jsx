import React, { lazy, Suspense } from 'react';
import { Home, ClipboardList, AlertCircle, FileText } from 'lucide-react';
import LoadingLogo from './LoadingLogo';

// Lazy: mesmo padrão de code-splitting já usado no AdminPortal/FamilyPortal —
// cada tela só entra no bundle quando o professor realmente abre aquela aba.
const TeacherInicio = lazy(() => import('./TeacherInicio'));
const TeacherMonitor = lazy(() => import('./TeacherMonitor'));
const TeacherObservacaoDiaria = lazy(() => import('./TeacherObservacaoDiaria'));
const TeacherRelatorios = lazy(() => import('./TeacherRelatorios'));

export default function TeacherPortal({
  currentUser, currentSchool,
  students,
  teacherTab, setTeacherTab,
  isMobileMenuOpen, setIsMobileMenuOpen,
  onLogout,
}) {
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
    { key: 'observacao-diaria', label: 'Observação Diária', icon: ClipboardList },
    { key: 'relatorios', label: 'Relatórios', icon: FileText },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in">
      {/* MENU LATERAL (SIDEBAR) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside className={`fixed md:relative top-0 left-0 h-[100dvh] md:h-full w-64 md:w-52 shrink-0 z-20 md:z-auto transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full bg-white p-3 pt-[68px] md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-200 flex flex-col overflow-y-auto">
          <p className="px-3 text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-3 mt-2 shrink-0">Navegação Principal</p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 pr-0.5 overflow-y-auto pb-4">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => { setTeacherTab(item.key); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${teacherTab === item.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <item.icon size={18} /> {item.label}
                {!!item.badge && (
                  <span className="ml-auto bg-amber-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center animate-pulse">{item.badge}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingLogo logoUrl={currentSchool?.logo_url} size={72} /></div>}>
          {teacherTab === 'home' && (
            <TeacherInicio currentUser={currentUser} currentSchool={currentSchool} setTeacherTab={setTeacherTab} />
          )}
          {teacherTab === 'monitor' && (
            <TeacherMonitor students={students || []} />
          )}
          {teacherTab === 'observacao-diaria' && (
            <TeacherObservacaoDiaria currentUser={currentUser} currentSchool={currentSchool} />
          )}
          {teacherTab === 'relatorios' && (
            <TeacherRelatorios currentUser={currentUser} currentSchool={currentSchool} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
