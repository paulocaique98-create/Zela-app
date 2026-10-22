import React from 'react';
import { Home, BookOpen, Wallet } from 'lucide-react';
import MobileBottomNav from './MobileBottomNav';

// Barra inferior da Família (ver MobileBottomNav). Ordem fixa dos atalhos.
export default function FamilyBottomNav({ familyTab, go, showDiario, showFinanceiro, isMobileMenuOpen, setIsMobileMenuOpen }) {
  const items = [
    { key: 'home', label: 'Início', icon: Home, show: true },
    { key: 'diario', label: 'Diário', icon: BookOpen, show: showDiario },
    { key: 'financeiro', label: 'Financeiro', icon: Wallet, show: showFinanceiro },
  ].map(i => ({ ...i, active: familyTab === i.key, onClick: () => go(i.key) }));

  return <MobileBottomNav items={items} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />;
}
