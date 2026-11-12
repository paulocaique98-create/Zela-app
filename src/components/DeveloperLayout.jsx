import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Building2, Receipt, Tags, ClipboardList, FileDown, FileText, LifeBuoy, Settings, ScanFace, Package, CircleDollarSign, Calculator, FileSignature, SlidersHorizontal, History, Palette, Shield, Zap, Bell, Server } from 'lucide-react';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useRecolherSubmenusNoMobile } from '../hooks/useRecolherSubmenusNoMobile';
import { SidebarToggleButton, SidebarLogoutItem, SidebarItem, SidebarGroup, SIDEBAR_ICON_SIZE } from './SidebarNav';
import MobileBottomNav from './MobileBottomNav';

// Lazy: cada aba só entra no bundle quando o developer realmente abre ela.
const DeveloperPanel = lazy(() => import('./DeveloperPanel'));
const ConfiguracoesPanel = lazy(() => import('./ConfiguracoesPanel'));
const DeveloperChatSupport = lazy(() => import('./DeveloperChatSupport'));
const DeveloperErrorLogs = lazy(() => import('./DeveloperErrorLogs'));
const DeveloperQualidadeBiometria = lazy(() => import('./DeveloperQualidadeBiometria'));
const DeveloperPlanos = lazy(() => import('./DeveloperPlanos'));
const DeveloperPropostas = lazy(() => import('./DeveloperPropostas'));
const DeveloperPainelContratos = lazy(() => import('./DeveloperPainelContratos'));
const DeveloperFaturamento = lazy(() => import('./DeveloperFaturamento'));

// Itens do menu com abas na página: viram submenu (acordeão; flyout ao passar o mouse com o menu recolhido).
// Os ids são os mesmos das abas de cada tela, que passam a ser controladas pelo layout.
const SUBMENUS = {
  planos: [
    { id: 'planos', label: 'Planos', icon: Tags },
    { id: 'pacotes', label: 'Pacotes', icon: Package },
    { id: 'precos', label: 'Preços dos módulos', icon: CircleDollarSign },
    { id: 'simulador', label: 'Simulador', icon: Calculator },
    { id: 'contratacoes', label: 'Gerar Contrato', icon: FileSignature },
  ],
  billing: [
    { id: 'cobrancas', label: 'Cobranças', icon: Receipt },
    { id: 'config', label: 'Configurações', icon: SlidersHorizontal },
    { id: 'historico', label: 'Histórico', icon: History },
  ],
  settings: [
    { id: 'appearance', label: 'Aparência (Logo)', icon: Palette },
    { id: 'general', label: 'Geral', icon: Settings },
    { id: 'security', label: 'Segurança', icon: Shield },
    { id: 'integrations', label: 'Integrações', icon: Zap },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'backup', label: 'Backup e Manutenção', icon: Server },
  ],
};

export default function DeveloperLayout({ currentUser, onUpdateGlobalLogo, isMobileMenuOpen, setIsMobileMenuOpen, activeTab, setActiveTab, onLogout }) {
  const { count: chatUnreadCount, refresh: refreshChatUnread } = useChatUnreadCount(currentUser, true);
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  const isDesktop = useIsDesktop();
  const collapsed = isDesktop && !isSidebarExpanded;
  const [subTab, setSubTab] = useState({ planos: 'planos', billing: 'cobrancas', settings: 'appearance' });
  const [grupoAberto, setGrupoAberto] = useState(SUBMENUS[activeTab] ? activeTab : null);
  useRecolherSubmenusNoMobile(isMobileMenuOpen, isDesktop, setGrupoAberto);
  useEffect(() => { if (SUBMENUS[activeTab]) setGrupoAberto(activeTab); }, [activeTab]);
  const mudarSub = (grupo) => (id) => setSubTab(s => ({ ...s, [grupo]: id }));

  const navItems = [
    { id: 'schools', label: 'Gestão de Escolas', icon: Building2, enabled: true },
    { id: 'planos', label: 'Planos', icon: Tags, enabled: true },
    { id: 'propostas', label: 'Propostas', icon: FileDown, enabled: true },
    { id: 'contratos', label: 'Painel de contratos', icon: ClipboardList, enabled: true },
    { id: 'billing', label: 'Faturamento', icon: Receipt, enabled: true },
    { id: 'logs', label: 'Logs', icon: FileText, enabled: true },
    { id: 'biometria', label: 'Biometria', icon: ScanFace, enabled: true },
    { id: 'support', label: 'Suporte', icon: LifeBuoy, enabled: true },
    { id: 'settings', label: 'Configurações', icon: Settings, enabled: true },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-0 w-full h-full animate-in fade-in">
      {/* MENU LATERAL (SIDEBAR) */}
      {/* OVERLAY PARA MOBILE */}
      <div 
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:relative top-[60px] md:top-auto left-0 md:left-auto h-[calc(100dvh-60px-4rem-env(safe-area-inset-bottom))] md:h-auto w-full md:w-64 shrink-0 z-20 md:z-30 bg-dev-bg border-r border-dev-border transform transition-all duration-300 ease-in-out md:translate-x-0 md:translate-y-0 ${isMobileMenuOpen ? 'translate-y-0' : 'translate-y-full'} ${isSidebarExpanded ? 'md:w-[248px]' : 'md:w-[72px]'}`}
      >
        <SidebarToggleButton
          isExpanded={isSidebarExpanded}
          onToggle={toggleSidebarExpanded}
          borderColorClass="border-dev-border"
          bgColorClass="bg-dev-bg hover:bg-dev-surface-high"
        />
        <div className="h-full flex flex-col overflow-y-auto overflow-x-hidden scrollbar-none">
          <p className="px-4 pt-4 pb-2 text-[11px] font-black text-dev-text-muted tracking-widest shrink-0 truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:block">
            Painel do Dev
          </p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 px-4 md:px-[18px] md:group-data-[expanded=true]/side:px-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              if (SUBMENUS[item.id]) {
                return (
                  <SidebarGroup
                    key={item.id}
                    dev
                    collapsed={collapsed}
                    label={item.label}
                    icon={Icon}
                    isOpen={grupoAberto === item.id}
                    onToggle={() => setGrupoAberto(g => (g === item.id ? null : item.id))}
                  >
                    {SUBMENUS[item.id].map(sub => (
                      <SidebarItem
                        key={sub.id}
                        dev
                        active={isActive && subTab[item.id] === sub.id}
                        icon={sub.icon}
                        label={sub.label}
                        onClick={() => {
                          mudarSub(item.id)(sub.id);
                          setActiveTab(item.id);
                          setIsMobileMenuOpen(false);
                        }}
                      />
                    ))}
                  </SidebarGroup>
                );
              }

              if (!item.enabled) {
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 pl-4 pr-4 py-1.5 md:w-9 md:h-9 md:p-0 md:justify-center md:group-data-[expanded=true]/side:w-full md:group-data-[expanded=true]/side:h-auto md:group-data-[expanded=true]/side:justify-start md:group-data-[expanded=true]/side:pl-4 md:group-data-[expanded=true]/side:pr-4 md:group-data-[expanded=true]/side:py-1.5 rounded-zela-md text-sm font-medium text-dev-text-muted opacity-60 cursor-not-allowed"
                  >
                    <Icon size={SIDEBAR_ICON_SIZE} className="shrink-0" />
                    <span className="truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:inline">{item.label}</span>
                    <span className="ml-auto bg-dev-surface-high text-[9px] px-1.5 py-0.5 rounded text-dev-text-muted font-bold md:hidden md:group-data-[expanded=true]/side:inline-block">
                      Em breve
                    </span>
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                    if (item.id === 'support') refreshChatUnread();
                  }}
                  className={`flex items-center gap-3 pl-4 pr-4 py-1.5 md:w-9 md:h-9 md:p-0 md:justify-center md:group-data-[expanded=true]/side:w-full md:group-data-[expanded=true]/side:h-auto md:group-data-[expanded=true]/side:justify-start md:group-data-[expanded=true]/side:pl-4 md:group-data-[expanded=true]/side:pr-4 md:group-data-[expanded=true]/side:py-1.5 rounded-zela-md text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-dev-primary-container text-dev-primary'
                      : 'text-dev-text-muted hover:bg-dev-surface hover:text-dev-text'
                  }`}
                >
                  <span className="relative shrink-0">
                    <Icon size={SIDEBAR_ICON_SIZE} />
                    {item.id === 'support' && chatUnreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-sm bg-error text-white text-[9px] font-black flex items-center justify-center md:group-data-[expanded=true]/side:hidden">
                        {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                      </span>
                    )}
                  </span>
                  <span className="flex-1 text-left truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:inline">{item.label}</span>
                  {item.id === 'support' && chatUnreadCount > 0 && (
                    <span className="hidden md:group-data-[expanded=true]/side:flex ml-auto min-w-[18px] h-[18px] px-1 rounded-sm bg-error text-white text-[9px] font-black items-center justify-center">
                      {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <SidebarLogoutItem onLogout={onLogout} dev />
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-dev-border pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>}>
          {activeTab === 'schools' && (
            <DeveloperPanel
              currentUser={currentUser}
            />
          )}
          {activeTab === 'settings' && (
            <ConfiguracoesPanel
              onUpdateGlobalLogo={onUpdateGlobalLogo}
              aba={subTab.settings}
            />
          )}
          {activeTab === 'support' && (
            <DeveloperChatSupport currentUser={currentUser} />
          )}
          {activeTab === 'logs' && (
            <DeveloperErrorLogs currentUser={currentUser} />
          )}
          {activeTab === 'biometria' && <DeveloperQualidadeBiometria />}
          {activeTab === 'planos' && <DeveloperPlanos aba={subTab.planos} onAba={mudarSub('planos')} />}
          {activeTab === 'propostas' && <DeveloperPropostas />}
          {activeTab === 'contratos' && <DeveloperPainelContratos />}
          {activeTab === 'billing' && <DeveloperFaturamento aba={subTab.billing} />}
        </Suspense>
      </main>

      <MobileBottomNav
        variant="dev"
        items={[
          { key: 'schools', label: 'Escolas', icon: Building2 },
          { key: 'logs', label: 'Logs', icon: FileText },
          { key: 'support', label: 'Suporte', icon: LifeBuoy, badge: chatUnreadCount },
        ].map(i => ({
          ...i,
          active: activeTab === i.key,
          onClick: () => {
            setActiveTab(i.key);
            setIsMobileMenuOpen(false);
            if (i.key === 'support') refreshChatUnread();
          },
        }))}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />
    </div>
  );
}
