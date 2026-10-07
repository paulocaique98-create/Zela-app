import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Apagar registro de entrada/saída (07/10/2026). Teste estático: confere as
// travas de segurança da migration sem precisar de banco. A validação real
// (RLS, perfis, escola) só roda depois que a migration for aplicada.
const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261007120000_apagar_registro_presenca.sql'), 'utf8');

describe('migration · delete_attendance_log', () => {
  it('só Gestão e Gestão Pedagógica apagam; Recepção (admin) e família não', () => {
    expect(sql).toMatch(/not in \('gestao', 'gestao_pedagogica'\)/);
    expect(sql).not.toMatch(/in \('admin'/);
  });

  it('exige motivo e confere a escola do registro', () => {
    expect(sql).toMatch(/Motivo é obrigatório/);
    expect(sql).toMatch(/v_log\.school_id is distinct from public\.get_my_school_id\(\)/);
  });

  it('é remoção lógica: não faz DELETE em attendance_logs', () => {
    expect(sql).not.toMatch(/delete from (public\.)?attendance_logs/i);
    expect(sql).toMatch(/deleted_at = now\(\)/);
  });

  it('esconde removidos de todos os clientes com policy RESTRICTIVE', () => {
    expect(sql).toMatch(/as restrictive for select/);
    expect(sql).toMatch(/using \(deleted_at is null\)/);
  });

  it('deixa trilha em attendance_corrections sem gerar cobrança', () => {
    expect(sql).toMatch(/'delete'/);
    expect(sql).toMatch(/0, false, auth\.uid\(\), 'applied'/);
  });

  it('função não fica exposta ao anon', () => {
    expect(sql).toMatch(/revoke execute on function public\.delete_attendance_log\(uuid, text, text\) from public, anon/);
  });

  it('funções antigas passam a ignorar registros apagados', () => {
    expect(sql.match(/deleted_at IS NULL/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toMatch(/where id = p_log_id and deleted_at is null;/);
  });
});
