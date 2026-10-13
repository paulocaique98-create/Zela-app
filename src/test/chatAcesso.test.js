import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { podeNoSetor, setoresVisiveis, matrizDeAcesso } from '../lib/chatAcesso';

const recepcao = { role: 'admin', departamento: 'recepcao' };
const coordenacao = { role: 'admin', departamento: 'coordenacao' };
const gestao = { role: 'gestao', departamento: null };

describe('acesso ao chat por setor (padrão)', () => {
  it('Gestão vê e responde todos os setores', () => {
    expect(setoresVisiveis(gestao, []).map(s => s.value))
      .toEqual(['administrativo', 'diretoria_pedagogica', 'coordenacao', 'recepcao']);
    expect(podeNoSetor(gestao, [], 'recepcao', 'responder')).toBe(true);
  });
  it('Recepção e Coordenação só veem o próprio setor', () => {
    expect(setoresVisiveis(recepcao, []).map(s => s.value)).toEqual(['recepcao']);
    expect(setoresVisiveis(coordenacao, []).map(s => s.value)).toEqual(['coordenacao']);
  });
  it('visibilidade total continua vendo tudo', () => {
    expect(setoresVisiveis({ role: 'admin', departamento: 'recepcao', chat_visibilidade_total: true }, [])).toHaveLength(4);
  });
  it('suporte_zela nunca é setor da escola', () => {
    expect(podeNoSetor(gestao, [], 'suporte_zela', 'ver')).toBe(false);
  });
});

describe('acesso ao chat configurado pela Gestão', () => {
  it('perfil pode ver outro setor só lendo', () => {
    const linhas = [{ perfil: 'recepcao', setor: 'coordenacao', pode_ver: true, pode_responder: false }];
    expect(podeNoSetor(recepcao, linhas, 'coordenacao', 'ver')).toBe(true);
    expect(podeNoSetor(recepcao, linhas, 'coordenacao', 'responder')).toBe(false);
  });
  it('responder sem ver não vale', () => {
    const linhas = [{ perfil: 'recepcao', setor: 'recepcao', pode_ver: false, pode_responder: true }];
    expect(podeNoSetor(recepcao, linhas, 'recepcao', 'responder')).toBe(false);
  });
  it('matriz tem 16 linhas e o padrão marca só o próprio setor', () => {
    const m = matrizDeAcesso([]);
    expect(m).toHaveLength(16);
    expect(m.filter(l => l.pode_ver).every(l => l.perfil === l.setor)).toBe(true);
  });
});

describe('migration chat_acesso_setor', () => {
  const sql = readFileSync('supabase/migrations/20261012120000_chat_acesso_por_setor.sql', 'utf8');
  it('habilita RLS e só a Gestão grava a configuração', () => {
    expect(sql).toMatch(/alter table public\.chat_acesso_setor enable row level security/i);
    expect(sql).toMatch(/Gestao ajusta o acesso ao chat por setor[\s\S]*get_my_role\(\) = 'gestao'/);
  });
  it('todas as policies de chat da equipe checam a escola e excluem suporte_zela', () => {
    expect(sql).toMatch(/chat_pode\(setor, 'ver'\)/);
    expect(sql).not.toMatch(/disable row level security/i);
  });
  it('funções por usuário não ficam abertas ao cliente', () => {
    expect(sql).toMatch(/revoke execute on function public\.chat_pode_user[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/revoke execute on function public\.chat_destinatarios[\s\S]*from public, anon, authenticated/);
  });
});
