import { describe, it, expect, vi } from 'vitest';
import { camposMudaram, CAMPOS_DO_TOTEM, agruparChamadas } from './realtimeAutorizados.js';

describe('tempo real de pessoas autorizadas', () => {
  const pessoa = { id: '1', name: 'Ana', relation: 'Mãe', family_id: 'f', face_descriptor: '[0.1,0.2]', face_descriptor_v2: null, status: 'active' };

  it('só os números de qualidade mudaram: o totem não recarrega', () => {
    const novo = { ...pessoa, foto_qualidade: { brilho: 120 } };
    expect(camposMudaram(pessoa, novo, CAMPOS_DO_TOTEM)).toBe(false);
  });

  it('descritor, nome ou status mudaram: recarrega', () => {
    expect(camposMudaram(pessoa, { ...pessoa, face_descriptor: '[0.3,0.4]' }, CAMPOS_DO_TOTEM)).toBe(true);
    expect(camposMudaram(pessoa, { ...pessoa, face_descriptor_v2: '[1]' }, CAMPOS_DO_TOTEM)).toBe(true);
    expect(camposMudaram(pessoa, { ...pessoa, status: 'blocked' }, CAMPOS_DO_TOTEM)).toBe(true);
    expect(camposMudaram(pessoa, { ...pessoa, name: 'Ana Maria' }, CAMPOS_DO_TOTEM)).toBe(true);
  });

  it('pessoa nova (ainda não conhecida): recarrega', () => {
    expect(camposMudaram(undefined, pessoa, CAMPOS_DO_TOTEM)).toBe(true);
  });

  it('várias alterações seguidas viram uma recarga só', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const agendada = agruparChamadas(fn, 1500);
    for (let i = 0; i < 50; i++) agendada();
    vi.advanceTimersByTime(1499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
