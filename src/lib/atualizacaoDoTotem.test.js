import { describe, it, expect, vi } from 'vitest';
import {
  TOTEM_OCIOSO_MS, totemOcioso, tentarAtualizarTotem, marcarAtividadeDoTotem, ultimaAtividadeDoTotem,
  lembrarLeitorAberto, leitorParaReabrir, esquecerLeitorAberto,
} from './atualizacaoDoTotem.js';

const armazenamento = () => {
  const dados = {};
  return { getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, removeItem: (k) => { delete dados[k]; } };
};

describe('Autoatendimento · atualização automática', () => {
  it('ocioso só depois de 3 minutos sem rosto nem toque', () => {
    expect(TOTEM_OCIOSO_MS).toBe(3 * 60 * 1000);
    expect(totemOcioso(1000 + TOTEM_OCIOSO_MS - 1, 1000)).toBe(false);
    expect(totemOcioso(1000 + TOTEM_OCIOSO_MS, 1000)).toBe(true);
    marcarAtividadeDoTotem(12345);
    expect(ultimaAtividadeDoTotem()).toBe(12345);
  });

  const base = (extra = {}) => {
    const antes = vi.fn();
    const recarregar = vi.fn();
    return {
      antes, recarregar,
      opcoes: {
        relogio: () => 10 * 60 * 1000, lerAtividade: () => 0, online: () => true,
        buscarVersaoNova: async () => 'b2', antesDeRecarregar: antes, recarregar, ...extra,
      },
    };
  };

  it('com versão nova e totem ocioso: guarda o leitor aberto e recarrega', async () => {
    const { opcoes, antes, recarregar } = base();
    expect(await tentarAtualizarTotem(opcoes)).toBe('recarregando');
    expect(antes).toHaveBeenCalledTimes(1);
    expect(recarregar).toHaveBeenCalledWith('b2');
  });

  it('alguém usando, sem rede, sem versão nova ou fora do Autoatendimento: não recarrega', async () => {
    for (const extra of [
      { lerAtividade: () => 10 * 60 * 1000 - 1000 }, // rosto há 1 segundo
      { online: () => false },
      { buscarVersaoNova: async () => null },
      { continuar: () => false },
    ]) {
      const { opcoes, recarregar } = base(extra);
      expect(await tentarAtualizarTotem(opcoes)).not.toBe('recarregando');
      expect(recarregar).not.toHaveBeenCalled();
    }
  });

  it('alguém chega enquanto confere a versão: espera a próxima vez', async () => {
    let atividade = 0;
    const { opcoes, recarregar } = base({
      lerAtividade: () => atividade,
      buscarVersaoNova: async () => { atividade = 10 * 60 * 1000; return 'b2'; },
    });
    expect(await tentarAtualizarTotem(opcoes)).toBe('aguardando');
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('leitor aberto volta aberto depois da recarga, e só uma vez', () => {
    const storage = armazenamento();
    expect(leitorParaReabrir(storage)).toBeNull();
    lembrarLeitorAberto('rosto', storage);
    expect(leitorParaReabrir(storage)).toBe('rosto');
    esquecerLeitorAberto(storage);
    expect(leitorParaReabrir(storage)).toBeNull();
    lembrarLeitorAberto('qr', storage);
    expect(leitorParaReabrir(storage)).toBe('qr');
    lembrarLeitorAberto('outro', storage);
    expect(leitorParaReabrir(storage)).toBeNull();
    const quebrado = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => { lembrarLeitorAberto('rosto', quebrado); esquecerLeitorAberto(quebrado); }).not.toThrow();
    expect(leitorParaReabrir(quebrado)).toBeNull();
  });
});
