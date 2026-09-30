import { describe, it, expect } from 'vitest';
import { textoQuemRegistrou, quemRegistrouDoLog, quemFezHoje } from './quemRegistrou.js';
import { printHistoricoCelula } from './printHistorico.js';

describe('quem fez a entrada ou a saída', () => {
  it('com nome: quem foi reconhecido no autoatendimento', () => {
    expect(textoQuemRegistrou('Ana Souza')).toBe('Registrado por Ana Souza');
    expect(quemRegistrouDoLog({ performed_by_name: 'Carlos Lima', corrected: true })).toBe('Registrado por Carlos Lima');
  });

  it('sem nome e lançado ou ajustado pela escola', () => {
    expect(quemRegistrouDoLog({ performed_by_name: null, corrected: true })).toBe('Lançado pela escola');
    expect(textoQuemRegistrou('  ', true)).toBe('Lançado pela escola');
  });

  it('registro antigo sem nome: não afirma nada', () => {
    expect(quemRegistrouDoLog({ performed_by_name: null, corrected: false })).toBeNull();
    expect(quemRegistrouDoLog(null)).toBeNull();
  });

  it('PDF: horário com quem fez embaixo, sem deixar HTML passar', () => {
    expect(printHistoricoCelula('07:32', 'Registrado por Ana')).toBe('07:32<div class="quem">Registrado por Ana</div>');
    expect(printHistoricoCelula('', null)).toBe('•');
    expect(printHistoricoCelula('07:32', 'Registrado por <b>x</b>')).not.toContain('<b>');
  });

  it('acompanhamento de hoje: última entrada e última saída de cada filho', () => {
    const logs = [
      { student_id: 'maite', event_type: 'exit', event_time: '2026-09-30T17:05:00-03:00', performed_by_name: 'Avó Rosa', corrected: false },
      { student_id: 'maite', event_type: 'entry', event_time: '2026-09-30T07:30:00-03:00', performed_by_name: 'Jaynara', corrected: false },
      { student_id: 'maite', event_type: 'entry', event_time: '2026-09-30T13:00:00-03:00', performed_by_name: null, corrected: true },
      { student_id: 'bia', event_type: 'entry', event_time: '2026-09-30T08:00:00-03:00', performed_by_name: 'Carlos', corrected: false },
    ];
    expect(quemFezHoje(logs)).toEqual({
      maite: { entrada: 'Lançado pela escola', saida: 'Registrado por Avó Rosa' },
      bia: { entrada: 'Registrado por Carlos', saida: null },
    });
    expect(quemFezHoje(null)).toEqual({});
  });

});
