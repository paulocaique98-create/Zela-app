import { describe, it, expect } from 'vitest';
import { erroEmail } from './emailReal';

describe('erroEmail', () => {
  it('aceita e-mails válidos', () => {
    expect(erroEmail('maria@gmail.com')).toBeNull();
    expect(erroEmail(' Maria.Silva+x@escola.com.br ')).toBeNull();
  });
  it('rejeita formato inválido', () => {
    for (const e of ['', 'abc', 'a@b', 'a@@b.com', 'a b@c.com', '@x.com', 'a@.com', 'a@x..com']) {
      expect(erroEmail(e)).not.toBeNull();
    }
  });
  it('rejeita erros de digitação comuns e sugere o domínio certo', () => {
    expect(erroEmail('maria@gmial.com')).toMatch(/gmail\.com/);
    expect(erroEmail('joao@hotmial.com')).toMatch(/hotmail\.com/);
  });
  it('rejeita domínios descartáveis', () => {
    expect(erroEmail('x@mailinator.com')).toMatch(/real/);
  });
});
