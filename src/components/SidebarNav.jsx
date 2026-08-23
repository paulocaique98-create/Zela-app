import React from 'react';
import { ChevronDown } from 'lucide-react';

// Item de navegação da sidebar — visual "pílula preenchida quando ativo"
// (mesmo padrão do protótipo Zela no Stitch). Puramente apresentacional:
// não guarda estado próprio, só recebe onClick já resolvido pelo caller.
// Compartilhado entre os portais (Admin, Família, Professor, Developer) para
// manter a mesma sidebar retrátil (ícone-only, expande no hover) em todos.
export function SidebarItem({ active, icon: Icon, label, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-zela-md text-sm font-medium transition-all md:justify-center md:group-hover:justify-start ${active ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
    >
      <span className="relative shrink-0">
        <Icon size={18} />
        {badge ? (
          <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center ${active ? 'bg-white/25 text-white' : 'bg-warning text-white animate-pulse'}`}>
            {badge}
          </span>
        ) : null}
      </span>
      <span className="flex-1 text-left truncate whitespace-nowrap md:hidden md:group-hover:inline">{label}</span>
    </button>
  );
}

// Grupo expansível da sidebar. Abre sozinho quando um item filho está ativo;
// clique no cabeçalho alterna aberto/fechado independentemente.
export function SidebarGroup({ label, icon: Icon, isOpen, onToggle, badge, children }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-zela-md text-sm font-medium transition-all md:justify-center md:group-hover:justify-start ${isOpen ? 'text-on-surface bg-surface-container-high' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
      >
        <span className="relative shrink-0">
          <Icon size={18} />
          {badge ? (
            <span className="absolute -top-1.5 -right-1.5 text-[9px] font-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center bg-warning text-white animate-pulse">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="flex-1 text-left truncate whitespace-nowrap md:hidden md:group-hover:inline">{label}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 md:hidden md:group-hover:block ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`md:hidden md:group-hover:grid grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5 pl-6 pr-1 pt-1 pb-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
