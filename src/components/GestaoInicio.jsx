import React from 'react';
import { ArrowRight, Wallet, Clock, ClipboardCheck } from 'lucide-react';

// Tela inicial do Portal da Gestão -- espelha o padrão de "Ações Rápidas"
// de AdminInicio.jsx. Ainda sem clickCounts/ordenação por uso (poucos
// menus por enquanto) -- isso entra quando houver menu suficiente pra
// justificar, igual foi feito no Admin.
export default function GestaoInicio({ currentSchool, setGestaoTab, pendingCorrectionsCount = 0 }) {
  const features = currentSchool?.features_enabled || {};
  const showFinanceiro = features.financeiro === true;
  const showCheckin = features.checkin !== false;

  const menus = [
    showFinanceiro && { key: 'financeiro', label: 'Financeiro', icon: Wallet, tab: 'financeiro' },
    showCheckin && { key: 'horas-extras', label: 'Horas Extras', icon: Clock, tab: 'horas-extras' },
    showCheckin && { key: 'attendance-corrections', label: 'Correções de Presença', icon: ClipboardCheck, tab: 'attendance-corrections', badge: pendingCorrectionsCount > 0 ? pendingCorrectionsCount : null },
  ].filter(Boolean);

  return (
    <div className="h-full bg-surface p-4 md:p-6 lg:p-8 xl:p-10 overflow-y-auto flex flex-col">
      <div className="w-full mt-0">
        <div className="mb-6 lg:mb-8 shrink-0">
          <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">Painel da Gestão</h1>
          <p className="text-small text-on-surface-variant mt-1">O que você deseja acessar hoje?</p>
        </div>

        {menus.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {menus.map(menu => (
              <button
                key={menu.key}
                onClick={() => setGestaoTab(menu.tab)}
                className="bg-surface-container-lowest p-4 rounded-zela-lg shadow-sm hover:shadow-md hover:-translate-y-1 transition-all flex flex-col items-start gap-3 text-left relative"
              >
                {menu.badge && (
                  <span className="absolute top-3 right-3 bg-error text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center animate-pulse shadow-md">
                    {menu.badge}
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
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16 bg-surface-container-lowest rounded-zela-xl border border-dashed border-outline-variant">
            <Wallet size={32} className="text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum menu disponível ainda</p>
          </div>
        )}
      </div>
    </div>
  );
}
