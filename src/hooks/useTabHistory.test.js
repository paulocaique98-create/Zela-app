import { describe, it, expect } from 'vitest';
import { decidePop } from './useTabHistory';

const pop = (state, isTrusted = true) => ({ state, isTrusted });

describe('decidePop · botão Voltar entre telas', () => {
  it('volta para a aba guardada na entrada do histórico', () => {
    expect(decidePop({ event: pop({ zelaRole: 'family', zelaTab: 'home' }), role: 'family', currentTab: 'financeiro', lockedTabs: [] }))
      .toEqual({ action: 'set', tab: 'home' });
  });

  it('Autoatendimento não sai pelo Voltar (exige senha)', () => {
    expect(decidePop({ event: pop({ zelaRole: 'admin', zelaTab: 'home' }), role: 'admin', currentTab: 'kiosk', lockedTabs: ['kiosk'] }))
      .toEqual({ action: 'repush' });
  });

  it('ignora o popstate sintético do navigateTo', () => {
    expect(decidePop({ event: pop({}, false), role: 'admin', currentTab: 'kiosk', lockedTabs: ['kiosk'] }))
      .toEqual({ action: 'ignore' });
  });

  it('ignora entrada de outro papel (outra pessoa logada antes) ou sem aba', () => {
    expect(decidePop({ event: pop({ zelaRole: 'admin', zelaTab: 'users' }), role: 'family', currentTab: 'home', lockedTabs: [] }).action).toBe('ignore');
    expect(decidePop({ event: pop(null), role: 'family', currentTab: 'home', lockedTabs: [] }).action).toBe('ignore');
  });

  it('ignora quando a aba já é a atual', () => {
    expect(decidePop({ event: pop({ zelaRole: 'gestao', zelaTab: 'pendencias' }), role: 'gestao', currentTab: 'pendencias', lockedTabs: [] }).action).toBe('ignore');
  });
});
