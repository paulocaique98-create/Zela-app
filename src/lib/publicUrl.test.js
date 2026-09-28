import { describe, it, expect, vi, afterEach } from 'vitest';
import { publicAppUrl } from './publicUrl';

describe('publicAppUrl · links que saem do aparelho', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('usa o endereço público configurado, sem barra dupla', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://app.zela.com.br/');
    expect(publicAppUrl('/reset-password')).toBe('https://app.zela.com.br/reset-password');
    expect(publicAppUrl('matricula-publica?codigo=ZL001')).toBe('https://app.zela.com.br/matricula-publica?codigo=ZL001');
  });
});
