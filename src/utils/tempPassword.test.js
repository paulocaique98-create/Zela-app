import { describe, it, expect } from 'vitest';
import { generateTempPassword } from './tempPassword';

describe('generateTempPassword', () => {
  it('gera 10 caracteres por padrão, sem caracteres ambíguos', () => {
    const pwd = generateTempPassword();
    expect(pwd).toHaveLength(10);
    expect(pwd).not.toMatch(/[0O1lI]/);
  });

  it('não repete a mesma senha (nunca volta a ser uma senha fixa)', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
    expect(set.size).toBe(200);
  });
});
