import React from 'react';
import { Home, ShieldCheck, Bell, Wallet, Menu } from 'lucide-react';

// Barra de navegação inferior da Família, só no celular (md:hidden). Os
// atalhos mais usados ficam a um toque; o resto continua no menu completo
// ("Menu" abre a barra lateral). Ordem fixa de propósito: na barra
// inferior a posição de cada item não pode mudar (memória muscular), ao
// contrário dos atalhos da tela Início, que seguem os cliques.
export default function FamilyBottomNav({ familyTab, go, showCheckin, showComunicados, showFinanceiro, comunicadosUnread, isMobileMenuOpen, setIsMobileMenuOpen }) {
  const items = [
    { tab: 'home', label: 'Início', icon: Home, show: true },
    { tab: 'acompanhamento', label: 'Acompanhar', icon: ShieldCheck, show: showCheckin },
    { tab: 'comunicados', label: 'Comunicados', icon: Bell, show: showComunicados, badge: comunicadosUnread },
    { tab: 'financeiro', label: 'Financeiro', icon: Wallet, show: showFinanceiro },
  ].filter(i => i.show);

  return (
    <nav
      aria-label="Navegação principal"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-container-lowest border-t border-outline-variant"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {items.map(({ tab, label, icon: Icon, badge }) => {
          const active = familyTab === tab && !isMobileMenuOpen;
          return (
            <li key={tab} className="flex-1">
              <button
                onClick={() => go(tab)}
                aria-current={active ? 'page' : undefined}
                className={`w-full h-16 flex flex-col items-center justify-center gap-0.5 text-xs transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${active ? 'text-primary font-semibold border-t-2 border-brass' : 'text-on-surface-variant font-medium border-t-2 border-transparent'}`}
              >
                <span className="relative">
                  <Icon size={22} aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-sm bg-brass text-[#1a1405] text-xs font-bold flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                {label}
              </button>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            className={`w-full h-16 flex flex-col items-center justify-center gap-0.5 text-xs transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${isMobileMenuOpen ? 'text-primary font-semibold border-t-2 border-brass' : 'text-on-surface-variant font-medium border-t-2 border-transparent'}`}
          >
            <Menu size={22} aria-hidden="true" />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}
