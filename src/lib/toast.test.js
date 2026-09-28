import { describe, it, expect } from 'vitest';
import { toast, subscribeToasts } from './toast';

describe('toast · avisos do Zela no lugar do alert()', () => {
  it('entrega tipo, mensagem e duração a quem está ouvindo', () => {
    const received = [];
    const unsubscribe = subscribeToasts(t => received.push(t));
    toast.error('Falhou');
    toast.success('Salvo', 1000);
    unsubscribe();
    toast.info('ninguém ouvindo');
    expect(received.map(t => [t.type, t.message])).toEqual([['error', 'Falhou'], ['success', 'Salvo']]);
    expect(received[1].durationMs).toBe(1000);
    expect(received[0].id).not.toBe(received[1].id);
  });
});
