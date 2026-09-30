import { describe, it, expect } from 'vitest';
import { UFS, somenteDigitosCep, formatarCep, cepCompleto, buscarCep, aplicarEndereco, montarEnderecoCompleto } from './cep.js';

const resposta = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('CEP · formato', () => {
  it('formata enquanto digita e aceita colado com traço ou ponto', () => {
    expect(formatarCep('29')).toBe('29');
    expect(formatarCep('290503')).toBe('29050-3');
    expect(formatarCep('29050335')).toBe('29050-335');
    expect(formatarCep('29.050-335 extra 99')).toBe('29050-335');
    expect(somenteDigitosCep('29050-335')).toBe('29050335');
    expect(cepCompleto('29050-335')).toBe(true);
    expect(cepCompleto('2905033')).toBe(false);
  });

  it('27 UFs', () => {
    expect(UFS).toHaveLength(27);
    expect(UFS).toContain('ES');
  });
});

describe('CEP · busca', () => {
  it('ViaCEP encontra e preenche rua, bairro, cidade e UF', async () => {
    const chamadas = [];
    const fetchFalso = async (url) => {
      chamadas.push(url);
      return resposta(200, { logradouro: 'Avenida Nossa Senhora da Penha', bairro: 'Santa Lúcia', localidade: 'Vitória', uf: 'es', ibge: '3205309' });
    };
    const r = await buscarCep('29056-250', fetchFalso);
    expect(r).toEqual({ status: 'ok', endereco: { rua: 'Avenida Nossa Senhora da Penha', bairro: 'Santa Lúcia', cidade: 'Vitória', uf: 'ES', ibge: '3205309' } });
    expect(chamadas).toEqual(['https://viacep.com.br/ws/29056250/json/']);
  });

  it('ViaCEP fora do ar: usa a BrasilAPI', async () => {
    const fetchFalso = async (url) => (url.includes('viacep')
      ? resposta(503, {})
      : resposta(200, { street: 'Rua A', neighborhood: 'Centro', city: 'Serra', state: 'ES' }));
    const r = await buscarCep('29160000', fetchFalso);
    expect(r).toEqual({ status: 'ok', endereco: { rua: 'Rua A', bairro: 'Centro', cidade: 'Serra', uf: 'ES', ibge: '' } });
  });

  it('CEP que não existe: avisa que não encontrou', async () => {
    const fetchFalso = async (url) => (url.includes('viacep') ? resposta(200, { erro: true }) : resposta(404, {}));
    expect(await buscarCep('00000000', fetchFalso)).toEqual({ status: 'nao_encontrado' });
  });

  it('sem internet: avisa que a busca está indisponível', async () => {
    const fetchFalso = async () => { throw new Error('rede'); };
    expect(await buscarCep('29056250', fetchFalso)).toEqual({ status: 'indisponivel' });
  });

  it('CEP incompleto nem chama a busca', async () => {
    let chamou = false;
    expect(await buscarCep('2905', async () => { chamou = true; })).toEqual({ status: 'incompleto' });
    expect(chamou).toBe(false);
  });
});

describe('CEP · aplicar no formulário', () => {
  it('CEP geral de cidade pequena não apaga rua e bairro já digitados', () => {
    const atual = { rua: 'Rua digitada', bairro: 'Bairro digitado', cidade: '', uf: '', numero: '10' };
    expect(aplicarEndereco(atual, { rua: '', bairro: '', cidade: 'Iconha', uf: 'ES' }))
      .toEqual({ rua: 'Rua digitada', bairro: 'Bairro digitado', cidade: 'Iconha', uf: 'ES', numero: '10' });
  });

  it('endereço completo no mesmo formato do banco, sem hífen solto', () => {
    expect(montarEnderecoCompleto({ rua: 'Rua X', numero: '12', complemento: 'Sala 3', bairro: 'Centro', cidade: 'Vitória', uf: 'ES', cep: '29000-000' }))
      .toBe('Rua X, 12, Sala 3 · Centro, Vitória/ES · CEP 29000-000');
    expect(montarEnderecoCompleto({ cidade: 'Vitória', uf: 'ES' })).toBe('Vitória/ES');
    expect(montarEnderecoCompleto({})).toBe('');
  });
});
