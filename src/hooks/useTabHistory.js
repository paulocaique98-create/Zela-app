import { useEffect, useRef } from 'react';

// Liga a troca de telas (abas por estado: adminTab, familyTab...) ao
// histórico do navegador. Antes, o botão Voltar do celular/navegador saía
// do Zela em vez de voltar à tela anterior (a troca de aba não entrava no
// histórico). A URL não muda: só o `history.state` guarda a aba.
//
// Telas travadas (ex.: Autoatendimento, que exige senha pra sair) ignoram
// o Voltar: o histórico é empurrado de novo e a tela continua.

// Decide o que fazer num popstate. Função pura pra ser testável.
export function decidePop({ event, role, currentTab, lockedTabs }) {
  // navigateTo() (src/utils/navigate.js) dispara popstate sintético pra
  // trocar de rota; esse não é um Voltar de verdade.
  if (!event.isTrusted) return { action: 'ignore' };
  if (lockedTabs.includes(currentTab)) return { action: 'repush' };
  const st = event.state;
  if (!st || st.zelaRole !== role || !st.zelaTab) return { action: 'ignore' };
  if (st.zelaTab === currentTab) return { action: 'ignore' };
  return { action: 'set', tab: st.zelaTab };
}

export function useTabHistory(role, tab, setTab, lockedTabs = []) {
  const currentTab = useRef(tab);
  const fromPop = useRef(false);
  const locked = useRef(lockedTabs);
  locked.current = lockedTabs;

  // Cada troca de aba feita pelo usuário vira uma entrada nova. A primeira
  // aba depois do login só marca a entrada atual (sem criar uma a mais).
  useEffect(() => {
    if (!role) return;
    currentTab.current = tab;
    if (fromPop.current) {
      fromPop.current = false;
      return;
    }
    const st = window.history.state;
    if (st?.zelaRole === role && st?.zelaTab === tab) return;
    if (st?.zelaRole !== role) {
      window.history.replaceState({ ...st, zelaRole: role, zelaTab: tab }, '');
    } else {
      window.history.pushState({ zelaRole: role, zelaTab: tab }, '');
    }
  }, [role, tab]);

  useEffect(() => {
    if (!role) return undefined;
    const onPop = (event) => {
      const decision = decidePop({ event, role, currentTab: currentTab.current, lockedTabs: locked.current });
      if (decision.action === 'repush') {
        window.history.pushState({ zelaRole: role, zelaTab: currentTab.current }, '');
      } else if (decision.action === 'set') {
        fromPop.current = true;
        setTab(decision.tab);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [role, setTab]);
}
