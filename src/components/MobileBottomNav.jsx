import React, { useEffect } from 'react';
import { Menu } from 'lucide-react';

// Barra de navegação inferior dos portais, só no celular (md:hidden). Os
// atalhos mais usados ficam a um toque; o resto continua no menu completo
// ("Menu" abre a barra lateral). Ordem fixa de propósito: na barra
// inferior a posição de cada item não pode mudar (memória muscular), ao
// contrário dos atalhos da tela Início, que seguem os cliques.
//
// items: [{ key, label, icon, active, onClick, badge?, show? }]
// variant 'dev' usa as cores escuras do Portal do Dev.
const VARIANTS = {
  default: {
    nav: 'bg-surface-container-lowest border-outline-variant',
    on: 'text-primary font-semibold border-brass',
    off: 'text-on-surface-variant font-medium border-transparent',
    badge: 'bg-brass text-[#1a1405]',
  },
  dev: {
    nav: 'bg-dev-bg border-dev-border',
    on: 'text-dev-primary font-semibold border-dev-primary',
    off: 'text-dev-text-muted font-medium border-transparent',
    badge: 'bg-error text-white',
  },
};

export default function MobileBottomNav({ items, isMobileMenuOpen, setIsMobileMenuOpen, variant = 'default' }) {
  const v = VARIANTS[variant] || VARIANTS.default;
  useEffect(() => {
    document.documentElement.classList.add('has-mobile-chrome');
    return () => document.documentElement.classList.remove('has-mobile-chrome');
  }, []);
  const itemClass = (on) => `w-full h-16 flex flex-col items-center justify-center gap-0.5 text-xs transition border-t-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${on ? v.on : v.off}`;

  return (
    <nav
      aria-label="Navegação principal"
      className={`md:hidden fixed bottom-0 inset-x-0 z-30 border-t ${v.nav}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {items.filter(i => i.show !== false).map(({ key, label, icon: Icon, active, onClick, badge }) => {
          const on = active && !isMobileMenuOpen;
          return (
            <li key={key} className="flex-1 min-w-0">
              <button onClick={(e) => { setIsMobileMenuOpen(false); onClick?.(e); }} aria-current={on ? 'page' : undefined} className={itemClass(on)}>
                <span className="relative">
                  <Icon size={22} aria-hidden="true" />
                  {badge > 0 && (
                    <span className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-sm text-xs font-bold flex items-center justify-center ${v.badge}`}>
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1">{label}</span>
              </button>
            </li>
          );
        })}
        <li className="flex-1 min-w-0">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            className={itemClass(isMobileMenuOpen)}
          >
            <Menu size={22} aria-hidden="true" />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}
