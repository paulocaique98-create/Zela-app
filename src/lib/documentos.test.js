import { describe, it, expect } from 'vitest';
import { somenteDigitos, formatarCpf, formatarCnpj, cpfValido, cnpjValido } from './documentos.js';

describe('CPF', () => {
  it('formata enquanto digita', () => {
    expect(formatarCpf('123')).toBe('123');
    expect(formatarCpf('1234')).toBe('123.4');
    expect(formatarCpf('1234567')).toBe('123.456.7');
    expect(formatarCpf('12345678909')).toBe('123.456.789-09');
    expect(formatarCpf('123.456.789-0999')).toBe('123.456.789-09');
  });

  it('confere os dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('formata enquanto digita', () => {
    expect(formatarCnpj('11')).toBe('11');
    expect(formatarCnpj('11222')).toBe('11.222');
    expect(formatarCnpj('11222333')).toBe('11.222.333');
    expect(formatarCnpj('112223330001')).toBe('11.222.333/0001');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('confere os dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
    expect(cnpjValido('00.000.000/0000-00')).toBe(false);
    expect(somenteDigitos('11.222.333/0001-81')).toBe('11222333000181');
  });
});
