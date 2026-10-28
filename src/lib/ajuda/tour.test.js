import { describe, it, expect } from 'vitest';
import { passosDoTour } from './tour';

describe('passosDoTour', () => {
  it.each(['admin', 'gestao', 'professor', 'familia'])('perfil %s tem abertura, menus e encerramento', (perfil) => {
    const passos = passosDoTour(perfil, 'montessori');
    expect(passos.length).toBeGreaterThan(2);
    expect(passos[0].id).toBe('inicio');
    expect(passos.at(-1).id).toBe('fim');
    passos.forEach((p) => {
      expect(p.titulo).toBeTruthy();
      expect(p.texto).toBeTruthy();
    });
  });

  it('sem método conhecido não mostra menus exclusivos de um método', () => {
    const sem = passosDoTour('gestao', null).map((p) => p.id);
    const trad = passosDoTour('gestao', 'tradicional').map((p) => p.id);
    expect(trad.length).toBeGreaterThanOrEqual(sem.length);
  });
});
