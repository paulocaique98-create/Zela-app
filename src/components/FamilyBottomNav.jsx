import React from 'react';
import { Home, ShieldCheck, Bell, Wallet } from 'lucide-react';
import MobileBottomNav from './MobileBottomNav';

// Barra inferior da Família (ver MobileBottomNav). Ordem fixa dos atalhos.
export default function FamilyBottomNav({ familyTab, go, showCheckin, showComunicados, showFinanceiro, comunicadosUnread, isMobileMenuOpen, setIsMobileMenuOpen }) {
  const items = [
    { key: 'home', label: 'Início', icon: Home, show: true },
    { key: 'acompanhamento', label: 'Acompanhar', icon: ShieldCheck, show: showCheckin },
    { key: 'comunicados', label: 'Comunicados', icon: Bell, show: showComunicados, badge: comunicadosUnread },
    { key: 'financeiro', label: 'Financeiro', icon: Wallet, show: showFinanceiro },
  ].map(i => ({ ...i, active: familyTab === i.key, onClick: () => go(i.key) }));

  return <MobileBottomNav items={items} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />;
}
