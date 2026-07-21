import React from 'react';
import { ShieldCheck, LogOut, Menu } from 'lucide-react';
import NotificationsDropdown from './NotificationsDropdown';

export default function Header({ currentUser, currentSchool, globalLogo, onLogout, onOpenMobileMenu, onTriggerEmergency }) {
  // Usa a logo global carregada do banco ou fallback
  const zelaLogo = globalLogo;
  
  // Tenta ler a logo da escola carregada do banco
  const schoolLogo = currentSchool?.logo_url || null;

  return (
    <>
    <nav className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-4 md:px-6 py-2 flex justify-between items-center shadow-sm min-h-[60px]">
      
      {/* ESQUERDA: ZELA LOGO & PORTAL */}
      <div className="flex items-center gap-3 flex-1">
        {zelaLogo ? (
          <img src={zelaLogo} alt="Zela" className="w-8 h-8 md:w-9 md:h-9 object-contain" />
        ) : (
          <div className="w-8 h-8 md:w-9 md:h-9 bg-indigo-950 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="text-white w-5 h-5 md:w-5 md:h-5" />
          </div>
        )}
        <div className="flex flex-col">
          <h1 className="font-bold text-lg tracking-tight leading-none text-indigo-950 flex items-center gap-1.5">
            Zela <span className="font-normal text-slate-400">Portal</span>
          </h1>
        </div>
      </div>
      
      {/* CENTRO: NOME DA ESCOLA (Apenas Desktop) */}
      <div className="hidden md:flex justify-center items-center flex-1">
        {(currentSchool || currentUser.role === 'developer') && (
          <div className="bg-slate-100/80 px-4 py-1.5 rounded-full border border-slate-200 flex items-center gap-2">
            <span className="text-xs font-black text-slate-600 tracking-wider uppercase">
              {currentUser.role === 'developer' ? 'Painel do Desenvolvedor' : `${currentSchool?.school_code} - ${currentSchool?.name}`}
            </span>
          </div>
        )}
      </div>

      {/* DIREITA: LOGO DA ESCOLA & SAIR */}
      <div className="flex justify-end items-center gap-3 flex-1">
        
        {currentUser.role === 'admin' && currentSchool && (
          <div className="hidden sm:flex items-center gap-3 mr-2 border-r border-slate-200 pr-4">
            <div className="flex flex-col text-right">
              <span className="text-xs font-bold text-slate-700">{currentSchool.name}</span>
              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">{currentUser.name}</span>
            </div>
            {schoolLogo ? (
              <img src={schoolLogo} alt="School Logo" className="w-9 h-9 object-cover rounded-full border border-slate-200 bg-white" />
            ) : (
              <div className="w-9 h-9 bg-indigo-50 rounded-full flex items-center justify-center border border-indigo-100 text-indigo-700 font-black text-sm">
                {currentSchool.name.charAt(0)}
              </div>
            )}
          </div>
        )}

        {currentUser.role === 'family' && (
          <div className="flex items-center gap-1 md:gap-3 mr-1 md:mr-2 border-r border-slate-200 pr-4">
            <NotificationsDropdown currentUser={currentUser} />
            <div className="text-right hidden sm:block pl-2">
              <p className="text-xs font-bold text-slate-700">{currentUser.name}</p>
            </div>
          </div>
        )}

        <button 
          onClick={onLogout} 
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition items-center justify-center active:scale-95 flex"
          title="Sair do sistema"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
    
    {/* SUB-HEADER PARA MOBILE COM MENU HAMBURGUER (ESQUERDA) */}
    <div className="md:hidden bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-2 flex items-center sticky top-[60px] z-30 shadow-sm">
      <button onClick={onOpenMobileMenu} className="flex items-center gap-2 p-1 -ml-1 text-slate-600 hover:bg-slate-100 rounded-xl transition font-bold text-sm uppercase tracking-wide">
        <Menu size={24} className="text-indigo-600" />
        Menu Principal
      </button>
    </div>
    </>
  );
}
