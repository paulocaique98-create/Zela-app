import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft } from 'lucide-react';

// Item de navegação da sidebar — visual "pílula preenchida quando ativo"
// (mesmo padrão do protótipo Zela no Stitch). Puramente apresentacional:
// não guarda estado próprio, só recebe onClick já resolvido pelo caller.
// Compartilhado entre os portais (Admin, Família, Professor, Developer) para
// manter a mesma sidebar retrátil (ícone-only, expande/recolhe por clique) em
// todos.
//
// O ícone NUNCA muda de alinhamento (sempre à esquerda, "justify-start"
// implícito do flex) -- antes alternava entre centralizado (recolhido) e
// alinhado à esquerda (expandido), fazendo o ícone "pular" de posição a cada
// clique. Só o rótulo aparece/desaparece ao lado, o ícone fica sempre no
// mesmo lugar.
//
// O expandir/recolher usa um grupo NOMEADO controlado por atributo de dados
// (group-data-[expanded=true]/side:...) -- data-expanded é setado pelo
// portal (Admin/Família/Professor/Developer) a partir do estado persistido
// em localStorage (ver useSidebarExpanded.js), alternado por clique no botão
// de SidebarToggleButton, não mais por hover.
export function SidebarItem({ active, icon: Icon, label, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 pl-4 pr-4 md:pl-[7px] md:pr-[7px] md:group-data-[expanded=true]/side:pl-4 md:group-data-[expanded=true]/side:pr-4 py-2.5 rounded-zela-md text-sm font-medium transition-all ${active ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
    >
      <span className="relative shrink-0">
        <Icon size={18} />
        {badge ? (
          <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center ${active ? 'bg-white/25 text-white' : 'bg-warning text-white animate-pulse'}`}>
            {badge}
          </span>
        ) : null}
      </span>
      <span className="flex-1 text-left truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:inline">{label}</span>
    </button>
  );
}

// Grupo expansível da sidebar. Abre sozinho quando um item filho está ativo;
// clique no cabeçalho alterna aberto/fechado independentemente.
//
// Com o menu recolhido no desktop (collapsed=true), o acordeão inline não
// tem onde aparecer (só o ícone é visível) -- nesse caso o clique abre um
// "flyout" flutuante colado à direita do ícone, via portal pra document.body
// (assim não é cortado pelo overflow-hidden do conteúdo da sidebar, que
// existe pra suportar a transição de largura). O flyout embrulha os itens
// num novo escopo de grupo nomeado (`group/side` + `data-expanded="true"`)
// pra que os SidebarItem filhos mostrem o rótulo normalmente ali dentro,
// mesmo com a sidebar de verdade recolhida.
export function SidebarGroup({ label, icon: Icon, isOpen, onToggle, badge, collapsed, children }) {
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [flyoutPos, setFlyoutPos] = useState(null);
  // Posição final só é calculada depois do 1º render do painel (precisa da
  // altura real do conteúdo, que varia por grupo -- "Acadêmico" tem muito
  // mais itens que os outros). Enquanto não calculado, o painel fica
  // invisível (visibility:hidden) pra não "piscar" no canto errado.
  const [resolvedPos, setResolvedPos] = useState(null);

  useEffect(() => {
    if (!collapsed) setFlyoutPos(null);
  }, [collapsed]);

  useLayoutEffect(() => {
    if (!flyoutPos || !panelRef.current) {
      setResolvedPos(null);
      return;
    }
    const margin = 8;
    const panelHeight = panelRef.current.offsetHeight;
    const maxTop = window.innerHeight - margin - panelHeight;
    const top = Math.max(margin, Math.min(flyoutPos.top, maxTop));
    setResolvedPos({ top, left: flyoutPos.left, maxHeight: window.innerHeight - margin * 2 });
  }, [flyoutPos]);

  useEffect(() => {
    if (!flyoutPos) return undefined;
    const close = () => setFlyoutPos(null);
    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [flyoutPos]);

  const handleClick = () => {
    if (collapsed) {
      if (flyoutPos) {
        setFlyoutPos(null);
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setFlyoutPos({ top: rect.top, left: rect.right + 8 });
      return;
    }
    onToggle();
  };

  return (
    <div>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`w-full flex items-center gap-3 pl-4 pr-4 md:pl-[7px] md:pr-[7px] md:group-data-[expanded=true]/side:pl-4 md:group-data-[expanded=true]/side:pr-4 py-2.5 rounded-zela-md text-sm font-medium transition-all ${isOpen || flyoutPos ? 'text-on-surface bg-surface-container-high' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
      >
        <span className="relative shrink-0">
          <Icon size={18} />
          {badge ? (
            <span className="absolute -top-1.5 -right-1.5 text-[9px] font-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center bg-warning text-white animate-pulse">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="flex-1 text-left truncate whitespace-nowrap md:hidden md:group-data-[expanded=true]/side:inline">{label}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 md:hidden md:group-data-[expanded=true]/side:block ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`md:hidden md:group-data-[expanded=true]/side:grid grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5 pl-6 pr-1 pt-1 pb-1">
            {children}
          </div>
        </div>
      </div>
      {collapsed && flyoutPos ? createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFlyoutPos(null)} />
          <div
            ref={panelRef}
            className="group/side fixed z-50 min-w-[200px] bg-surface-container-lowest border border-outline-variant rounded-zela-md shadow-lg py-2 overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
            data-expanded="true"
            style={{
              top: (resolvedPos ?? flyoutPos).top,
              left: flyoutPos.left,
              maxHeight: resolvedPos?.maxHeight,
              visibility: resolvedPos ? 'visible' : 'hidden',
            }}
          >
            <p className="px-4 pb-1 text-[11px] font-black text-on-surface-variant uppercase tracking-widest">{label}</p>
            <div className="flex flex-col gap-0.5 px-1" onClick={() => setFlyoutPos(null)}>
              {children}
            </div>
          </div>
        </>,
        document.body
      ) : null}
    </div>
  );
}

// Botão fixo na borda direita da sidebar, colado nela, que alterna
// expandir/recolher por clique -- substitui o hover automático de antes.
// Fica DENTRO do <aside> (não do wrapper com overflow-hidden), senão seria
// cortado durante a transição de largura -- ver comentário nos portais sobre
// mover o overflow-hidden pro conteúdo interno em vez do <aside> em si.
// `borderColorClass`/`bgColorClass` permitem o Portal do Dev usar as cores
// próprias dele (dev-*) em vez das cores padrão dos outros 3 portais.
export function SidebarToggleButton({ isExpanded, onToggle, borderColorClass = 'border-outline-variant', bgColorClass = 'bg-surface-container-low hover:bg-surface-container-high' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isExpanded ? 'Recolher menu' : 'Expandir menu'}
      className={`hidden md:flex absolute top-4 -right-3 z-10 w-6 h-6 rounded-full border ${borderColorClass} ${bgColorClass} items-center justify-center shadow-sm transition-colors`}
    >
      <ChevronLeft size={14} className={`transition-transform duration-300 ${isExpanded ? '' : 'rotate-180'}`} />
    </button>
  );
}
