import { describe, it, expect } from 'vitest';
import { sugerirCobrancas, sugerirDespesas, sugerirRepasse, saldoDoExtrato, separarNovas } from './conciliacao';
import { parseOFXStatement } from './gestaoUtils';

describe('parseOFXStatement', () => {
  const ofx = `<OFX><BANKTRANSLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910120000<TRNAMT>850.00<FITID>A1<MEMO>PIX RECEBIDO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912<TRNAMT>-1200,50<FITID>B2<NAME>ALUGUEL
<STMTTRN><DTPOSTED>20260913<TRNAMT>0.00<FITID>Z0
</BANKTRANSLIST><LEDGERBAL><BALAMT>5000.25<DTASOF>20260930</LEDGERBAL></OFX>`;
  it('traz entradas e saídas com sinal, período e saldo', () => {
    const r = parseOFXStatement(ofx);
    expect(r.lines).toEqual([
      { id: 'A1', date: '2026-09-10', amount_cents: 85000, memo: 'PIX RECEBIDO' },
      { id: 'B2', date: '2026-09-12', amount_cents: -120050, memo: 'ALUGUEL' },
    ]);
    expect(r.balance).toEqual({ cents: 500025, date: '2026-09-30' });
    expect(r.start).toBe('2026-09-10');
    expect(r.end).toBe('2026-09-12');
  });
  it('sem LEDGERBAL o saldo é nulo', () => {
    expect(parseOFXStatement('<STMTTRN><DTPOSTED>20260910<TRNAMT>1.00<FITID>X').balance).toBeNull();
  });
});

describe('sugerirCobrancas', () => {
  const cobs = [
    { id: 'c1', amount_cents: 85000, due_date: '2026-09-20' },
    { id: 'c2', amount_cents: 85000, due_date: '2026-09-11' },
    { id: 'c3', amount_cents: 85000, due_date: '2026-12-01' },
    { id: 'c4', amount_cents: 99999, due_date: '2026-09-10' },
  ];
  it('mesmo valor, até 20 dias, mais próxima primeiro', () => {
    expect(sugerirCobrancas({ valor_cents: 85000, data: '2026-09-10' }, cobs).map(c => c.id)).toEqual(['c2', 'c1']);
  });
  it('saída não casa com cobrança', () => {
    expect(sugerirCobrancas({ valor_cents: -85000, data: '2026-09-10' }, cobs)).toEqual([]);
  });
});

describe('sugerirDespesas', () => {
  const desp = [
    { id: 'd1', amount_cents: 120000, due_date: '2026-09-10', suppliers: { name: 'Imobiliária Sol' } },
    { id: 'd2', amount_cents: 120000, due_date: '2026-09-12', suppliers: { name: 'Papelaria Lua' } },
    { id: 'd3', amount_cents: 120000, due_date: '2026-09-20', suppliers: null },
    { id: 'd4', amount_cents: 5000, due_date: '2026-09-12', suppliers: null },
  ];
  it('valor igual, ±3 dias; fornecedor citado na descrição vem primeiro', () => {
    const r = sugerirDespesas({ valor_cents: -120000, data: '2026-09-12', descricao: 'PAGTO PAPELARIA LUA' }, desp);
    expect(r.map(d => d.id)).toEqual(['d2', 'd1']);
  });
  it('fornecedor ignora acento e caixa', () => {
    const r = sugerirDespesas({ valor_cents: -120000, data: '2026-09-11', descricao: 'imobiliaria sol ltda' }, desp);
    expect(r[0].id).toBe('d1');
  });
  it('entrada não casa com despesa', () => {
    expect(sugerirDespesas({ valor_cents: 120000, data: '2026-09-12' }, desp)).toEqual([]);
  });
});

describe('sugerirRepasse', () => {
  const pagas = [
    { id: 'p1', amount_cents: 50000, paid_at: '2026-09-08T15:00:00Z' },
    { id: 'p2', amount_cents: 30000, paid_at: '2026-09-09T15:00:00Z' },
    { id: 'p3', amount_cents: 20000, paid_at: '2026-09-09T18:00:00Z' },
    { id: 'p4', amount_cents: 70000, paid_at: '2026-06-01T15:00:00Z' },
  ];
  it('acha as cobranças cuja soma bruta menos a taxa dá o crédito', () => {
    // 50000 + 30000 = 80000 bruto; crédito 78400 (2% de taxa)
    const r = sugerirRepasse({ valor_cents: 78400, data: '2026-09-10' }, pagas);
    expect(r.cobrancas.map(c => c.id).sort()).toEqual(['p1', 'p2']);
    expect(r.taxa_cents).toBe(1600);
  });
  it('ignora cobranças fora da janela de dias', () => {
    expect(sugerirRepasse({ valor_cents: 118000, data: '2026-09-10' }, pagas)).toBeNull();
  });
  it('sem combinação dentro da taxa máxima devolve nulo', () => {
    expect(sugerirRepasse({ valor_cents: 60000, data: '2026-09-10' }, pagas)).toBeNull();
  });
});

describe('saldo e importação repetida', () => {
  it('saldoDoExtrato exige data', () => {
    expect(saldoDoExtrato({ balance: { cents: 100, date: '2026-09-30' } })).toEqual({ data: '2026-09-30', saldo_cents: 100 });
    expect(saldoDoExtrato({ balance: { cents: 100, date: '' } })).toBeNull();
    expect(saldoDoExtrato({ balance: null })).toBeNull();
  });
  it('separarNovas descarta FITID já importado e repetido no arquivo', () => {
    const novas = separarNovas([{ id: 'A' }, { id: 'B' }, { id: 'B' }, { id: 'C' }], ['A']);
    expect(novas.map(l => l.id)).toEqual(['B', 'C']);
  });
});
