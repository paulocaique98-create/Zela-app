import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('./auditLog', () => ({ logAction: vi.fn() }));

import { ontemBrasilia, podeLancarSaida } from './saidasPendentes';

describe('ontemBrasilia', () => {
  it('devolve o dia anterior no fuso de Brasília', () => {
    expect(ontemBrasilia(new Date('2026-10-15T15:00:00Z'))).toBe('2026-10-14');
  });
  it('à 01h UTC ainda é o dia anterior em Brasília', () => {
    expect(ontemBrasilia(new Date('2026-10-15T01:00:00Z'))).toBe('2026-10-13');
  });
  it('vira o mês corretamente', () => {
    expect(ontemBrasilia(new Date('2026-11-01T15:00:00Z'))).toBe('2026-10-31');
  });
});

describe('podeLancarSaida', () => {
  it('Recepção e Gestão lançam; professora, família e financeiro não', () => {
    for (const r of ['admin', 'gestao', 'gestao_pedagogica']) expect(podeLancarSaida(r)).toBe(true);
    for (const r of ['teacher', 'family', 'financeiro', undefined]) expect(podeLancarSaida(r)).toBe(false);
  });
});
