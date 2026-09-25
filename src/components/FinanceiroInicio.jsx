import React from 'react';
import { Wallet } from 'lucide-react';

// Tela inicial do Portal Financeiro/Administrativo -- espelha o cabeçalho de
// AdminInicio.jsx ("Ações Rápidas"), mas sem grid de cards ainda: não há
// nenhum menu real migrado pra cá até o momento, só o scaffold do portal.
export default function FinanceiroInicio({ currentSchool }) {
  return (
    <div className="h-full bg-surface p-4 md:p-6 lg:p-8 xl:p-10 overflow-y-auto flex flex-col">
      <div className="w-full mt-0">
        <div className="mb-6 lg:mb-8 shrink-0">
          <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">Painel Financeiro</h1>
          <p className="text-small text-on-surface-variant mt-1">
            {currentSchool?.name ? `${currentSchool.name} · ` : ''}Em construção — os menus deste portal chegam nas próximas etapas.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center text-center py-16 bg-surface-container-lowest rounded-zela-xl border border-dashed border-outline-variant">
          <Wallet size={32} className="text-outline-variant mb-3" />
          <p className="text-sm font-semibold text-on-surface-variant">Nenhum menu disponível ainda</p>
        </div>
      </div>
    </div>
  );
}
