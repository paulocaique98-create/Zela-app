import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Guarda-corpos estáticos da exclusão de responsável com retenção LGPD.
// Não toca o banco: vigia que a migration e a Edge Function não percam as
// proteções (só service_role executa, RLS na retenção, FK não apaga financeiro).
const sql = readFileSync('supabase/migrations/20261213150000_exclusao_responsavel_lgpd.sql', 'utf8');
const edge = readFileSync('supabase/functions/delete-user/index.ts', 'utf8');

describe('Exclusão de responsável (LGPD Art. 16)', () => {
  it('só o service_role executa a exclusão da família', () => {
    expect(sql).toMatch(/revoke execute on function public\.lgpd_excluir_familia\(uuid, uuid, text, integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.lgpd_excluir_familia\(uuid, uuid, text, integer\) to service_role/);
  });

  it('funções security definer fixam o search_path', () => {
    const defs = sql.match(/security definer\s+set search_path to 'public'/g) || [];
    expect(defs.length).toBe(2);
  });

  it('registro de retenção tem RLS, só leitura, só Gestão/Financeiro da escola', () => {
    expect(sql).toMatch(/alter table public\.lgpd_retention_records enable row level security/);
    expect(sql).toMatch(/for select\s+using \(school_id = get_my_school_id\(\)/);
    expect(sql).not.toMatch(/on public\.lgpd_retention_records for (insert|update|delete)/);
  });

  it('financeiro sobrevive: FKs viram SET NULL e a rotina nunca apaga financial_*', () => {
    expect(sql).toMatch(/on delete set null/);
    expect(sql).not.toMatch(/delete from (public\.)?financial_/);
    expect(sql).toMatch(/c\.table_name !~ '\^\(financial_/);
  });

  it('exige Gestão/suporte e mesma escola', () => {
    expect(sql).toMatch(/v_caller\.role not in \('gestao', 'developer'\)/);
    expect(sql).toMatch(/v_caller\.school_id is distinct from v_target\.school_id/);
  });

  it('segundo responsável com vínculo externo não é apagado', () => {
    expect(sql).toMatch(/o\.student_id <> all\(v_students\)/);
  });

  it('Edge Function aplica carência de 15 dias e registra a exceção urgente', () => {
    expect(edge).toMatch(/dias < 15/);
    expect(edge).toMatch(/lgpd_exclusao_urgente/);
    expect(edge).toMatch(/rpc\('lgpd_excluir_familia'/);
  });
});
