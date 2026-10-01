import { describe, it, expect } from 'vitest';
import { brlToCents, centsToBRL, toCSV, fillTemplate, parseOFXCredits, sha256Hex } from './gestaoUtils';

describe('gestaoUtils', () => {
  it('converte valores em reais digitados para centavos', () => {
    expect(brlToCents('1.234,56')).toBe(123456);
    expect(brlToCents('R$ 30,00')).toBe(3000);
    expect(brlToCents('abc')).toBe(0);
    expect(centsToBRL(123456)).toContain('1.234,56');
  });

  it('gera CSV com ; e aspas quando necessário', () => {
    const csv = toCSV([{ a: 'x;y', b: 2 }], [{ label: 'A', value: 'a' }, { label: 'B', value: r => r.b * 2 }]);
    expect(csv).toContain('A;B');
    expect(csv).toContain('"x;y";4');
  });

  it('preenche os campos do modelo e mantém os que não têm valor', () => {
    expect(fillTemplate('Aluno {{aluno_nome}}, turma {{ turma }}, {{desconhecido}}', { aluno_nome: 'Ana', turma: 'Nido' }))
      .toBe('Aluno Ana, turma Nido, {{desconhecido}}');
  });

  it('lê só os créditos de um extrato OFX', () => {
    const ofx = `<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910120000<TRNAMT>850.00<FITID>A1<MEMO>PIX RECEBIDO</STMTTRN>
      <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260911<TRNAMT>-120.00<FITID>A2<MEMO>TARIFA</STMTTRN></OFX>`;
    expect(parseOFXCredits(ofx)).toEqual([{ id: 'A1', date: '2026-09-10', amount_cents: 85000, memo: 'PIX RECEBIDO' }]);
  });

  it('calcula SHA-256 igual ao do banco (hex)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('valoresManuaisDoContrato: mensalidade informada na hora de gerar o contrato', () => {
  it('converte o valor digitado e a data para o texto do contrato', async () => {
    const { valoresManuaisDoContrato, fillTemplate } = await import('./gestaoUtils.js');
    const v = valoresManuaisDoContrato({ valor: '1.250,50', vencimento: '2026-11-05' });
    expect(v.valor_mensal.replace(/\s/g, ' ')).toBe('R$ 1.250,50');
    expect(v.primeiro_vencimento).toBe('05/11/2026');
    const texto = fillTemplate('Mensalidade de {{valor_mensal}}, vencendo em {{primeiro_vencimento}}.', v);
    expect(texto).not.toContain('{{');
  });

  it('o que não foi preenchido não substitui nada', async () => {
    const { valoresManuaisDoContrato, fillTemplate } = await import('./gestaoUtils.js');
    expect(valoresManuaisDoContrato({ valor: '', vencimento: '' })).toEqual({});
    expect(valoresManuaisDoContrato({ valor: '0', vencimento: '' })).toEqual({});
    expect(fillTemplate('{{valor_mensal}}', valoresManuaisDoContrato({ valor: '', vencimento: '2026-11-05' }))).toBe('{{valor_mensal}}');
  });
});
