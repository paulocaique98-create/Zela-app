import React from 'react';
import { ShieldCheck, LogOut, Menu } from 'lucide-react';
import NotificationsDropdown from './NotificationsDropdown';

export default function Header({ currentUser, currentSchool, globalLogo, onLogout, onOpenMobileMenu, onNavigateTab }) {
  // Usa a logo global carregada do banco ou fallback
  const zelaLogo = globalLogo;
  const schoolLogo = currentSchool?.logo_url || null;

  return (
    <>
    <nav className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/60 sticky top-0 z-40 px-4 md:px-6 flex justify-between items-center shadow-[0_1px_8px_rgba(0,0,0,0.03)] h-[60px] md:h-16">

      {/* ESQUERDA: MENU HAMBURGUER (mobile/tablet) + ZELA PORTAL */}
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-1.5 -ml-1 text-primary hover:bg-surface-container-low rounded-zela-sm transition active:scale-95 shrink-0"
          title="Abrir menu"
        >
          <Menu size={24} />
        </button>
        <div className="hidden md:flex items-center shrink-0">
          {zelaLogo ? (
            <img src={zelaLogo} alt="Zela" className="w-9 h-9 object-contain" />
          ) : (
            <div className="w-9 h-9 bg-primary rounded-zela-md flex items-center justify-center">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <h1 className="font-bold text-lg tracking-tight leading-none text-on-surface flex items-center gap-1.5 whitespace-nowrap">
            Zela <span className="font-normal text-on-surface-variant">Portal</span>
          </h1>
        </div>
      </div>

      {/* CENTRO: NOME DA ESCOLA (Apenas Desktop) */}
      <div className="hidden md:flex flex-col justify-center flex-1 min-w-0">
        {(currentSchool || currentUser.role === 'developer') && (
          currentUser.role === 'developer' ? (
            <span className="text-label text-on-surface">Painel do Desenvolvedor</span>
          ) : (
            <>
              <span className="text-caption text-on-surface-variant uppercase font-bold tracking-tighter leading-none">{currentSchool?.school_code}</span>
              <span className="text-label text-on-surface">{currentSchool?.name}</span>
            </>
          )
        )}
      </div>

      {/* DIREITA: LOGO DA ESCOLA & SAIR */}
      <div className="flex justify-end items-center gap-3 flex-1 min-w-0">

        {currentUser.role === 'family' && (
          <div className="flex items-center gap-1 md:gap-3 mr-1 md:mr-2 border-r border-outline-variant pr-4">
            <NotificationsDropdown currentUser={currentUser} onNavigateTab={onNavigateTab} />
            <div className="text-right hidden sm:block pl-2">
              <p className="text-xs font-bold text-on-surface">{currentUser.name}</p>
            </div>
          </div>
        )}

        {currentUser.role === 'teacher' && (
          <p className="text-xs font-bold text-on-surface hidden sm:block mr-2">{currentUser.name}</p>
        )}

        {currentUser.role !== 'developer' && currentSchool && (
          schoolLogo ? (
            <img src={schoolLogo} alt="Logo da escola" className="w-9 h-9 object-cover rounded-full border border-outline-variant bg-white mr-2" />
          ) : (
            <div className="w-9 h-9 bg-surface-container-low rounded-full flex items-center justify-center border border-outline-variant text-primary font-black text-sm mr-2">
              {currentSchool.name?.charAt(0)}
            </div>
          )
        )}

        <button
          onClick={onLogout}
          className="p-2 text-on-surface-variant hover:text-error hover:bg-red-50 rounded-zela-sm transition items-center justify-center active:scale-95 flex"
          title="Sair do sistema"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
    </>
  );
}
