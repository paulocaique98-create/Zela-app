import { describe, it, expect } from 'vitest';
import { ehSessaoInvalida, chamarFuncaoComSessao } from './sessao.js';

function erroDaFuncao(mensagem) {
  return { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: mensagem }) } };
}

function supabaseFalso({ respostas, renovarFalha = false }) {
  const chamadas = { invoke: 0, refresh: 0 };
  return {
    chamadas,
    functions: {
      invoke: async () => {
        const r = respostas[Math.min(chamadas.invoke, respostas.length - 1)];
        chamadas.invoke += 1;
        return r;
      },
    },
    auth: {
      refreshSession: async () => {
        chamadas.refresh += 1;
        return { error: renovarFalha ? new Error('Invalid Refresh Token') : null };
      },
    },
  };
}

describe('sessão encerrada em outro aparelho', () => {
  it('reconhece as mensagens de sessão inválida, e só elas', () => {
    expect(ehSessaoInvalida('Token inválido ou expirado')).toBe(true);
    expect(ehSessaoInvalida('Invalid JWT')).toBe(true);
    expect(ehSessaoInvalida('JWT expired')).toBe(true);
    expect(ehSessaoInvalida('Session not found')).toBe(true);
    expect(ehSessaoInvalida('Aluno não encontrado nesta escola.')).toBe(false);
    expect(ehSessaoInvalida(null)).toBe(false);
  });

  it('chamada normal: não renova nada', async () => {
    const sb = supabaseFalso({ respostas: [{ data: { success: true }, error: null }] });
    let encerrou = false;
    const r = await chamarFuncaoComSessao(sb, 'notify-checkin-request', {}, { aoEncerrar: () => { encerrou = true; } });
    expect(r.data).toEqual({ success: true });
    expect(sb.chamadas).toEqual({ invoke: 1, refresh: 0 });
    expect(encerrou).toBe(false);
  });

  it('sessão vencida: renova e tenta de novo, e o aviso sai', async () => {
    const sb = supabaseFalso({ respostas: [{ data: null, error: erroDaFuncao('Token inválido ou expirado') }, { data: { success: true }, error: null }] });
    let encerrou = false;
    const r = await chamarFuncaoComSessao(sb, 'notify-checkin-request', {}, { aoEncerrar: () => { encerrou = true; } });
    expect(r.error).toBeNull();
    expect(sb.chamadas).toEqual({ invoke: 2, refresh: 1 });
    expect(encerrou).toBe(false);
  });

  it('sessão encerrada de vez: avisa o app para pedir login (não falha em silêncio)', async () => {
    const sb = supabaseFalso({ respostas: [{ data: null, error: erroDaFuncao('Token inválido ou expirado') }], renovarFalha: true });
    let encerrou = false;
    const r = await chamarFuncaoComSessao(sb, 'notify-checkin-request', {}, { aoEncerrar: () => { encerrou = true; } });
    expect(r.mensagem).toBe('Token inválido ou expirado');
    expect(sb.chamadas).toEqual({ invoke: 1, refresh: 1 });
    expect(encerrou).toBe(true);
  });

  it('outro erro qualquer: não mexe na sessão', async () => {
    const sb = supabaseFalso({ respostas: [{ data: null, error: erroDaFuncao('Aluno não encontrado nesta escola.') }] });
    let encerrou = false;
    await chamarFuncaoComSessao(sb, 'notify-checkin-request', {}, { aoEncerrar: () => { encerrou = true; } });
    expect(sb.chamadas.refresh).toBe(0);
    expect(encerrou).toBe(false);
  });
});
