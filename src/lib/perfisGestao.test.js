import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ABAS_GESTAO_PEDAGOGICA, ABAS_SO_GESTAO, ABAS_SO_GESTAO_PEDAGOGICA, podeVerAba, recursosDoPerfil, rotuloDoPerfil, usaPortalGestao,
} from './perfisGestao';

// Abas do menu do Portal da Gestão, lidas do próprio componente.
const fonteDoPortal = readFileSync(new URL('../components/GestaoPortal.jsx', import.meta.url), 'utf8');
const abasDoMenu = [...fonteDoPortal.matchAll(/item\('([a-z-]+)'/g)].map(m => m[1]);

describe('Perfis do Portal da Gestão', () => {
  it('toda aba do menu está classificada (tela nova nunca aparece para a Coordenação sem decisão)', () => {
    expect(abasDoMenu.length).toBeGreaterThan(30);
    const semClassificacao = abasDoMenu.filter(t => !ABAS_GESTAO_PEDAGOGICA.has(t) && !ABAS_SO_GESTAO.has(t));
    expect(semClassificacao).toEqual([]);
    for (const t of ABAS_GESTAO_PEDAGOGICA) expect(ABAS_SO_GESTAO.has(t)).toBe(false);
  });

  it('Coordenação e Direção não veem nada financeiro, de contrato, hora extra, configuração ou LGPD', () => {
    const sensiveis = [
      'financeiro-visao', 'financeiro-mensalidades', 'financeiro-cobrancas', 'financeiro-inadimplencia', 'financeiro-recebimentos',
      'financeiro-despesas', 'contratos-lista', 'contratos-modelos', 'contratos-assinaturas', 'contratos-aditivos', 'horas-extras',
      'relatorios-financeiro', 'relatorios-gestao', 'config-financeiro', 'config-seguranca', 'permissoes-perfis', 'permissoes-auditoria',
      'integracoes', 'cadastros-exclusoes', 'cadastros-biometria', 'cadastros-unificar', 'cadastros-funcionarios', 'cadastros-fornecedores',
    ];
    for (const t of sensiveis) {
      expect([t, podeVerAba('gestao_pedagogica', t)]).toEqual([t, false]);
      expect([t, podeVerAba('gestao', t)]).toEqual([t, true]);
    }
  });

  it('Coordenação e Direção veem secretaria, cadastros, acadêmico, comunicação e o alerta de faltas', () => {
    for (const t of ['secretaria-alunos', 'secretaria-matriculas', 'cadastros-usuarios', 'cadastros-turmas', 'attendance-corrections',
      'academico-relatorios', 'academico-cardapio', 'comunicacao-comunicados', 'relatorios-operacional', 'config-academico']) {
      expect([t, podeVerAba('gestao_pedagogica', t)]).toEqual([t, true]);
    }
    // Telas pedagógicas da Recepção só aparecem para elas.
    for (const t of ABAS_SO_GESTAO_PEDAGOGICA) expect(podeVerAba('gestao', t)).toBe(false);
  });

  it('outros tipos de conta nunca veem o Portal da Gestão', () => {
    for (const role of ['admin', 'teacher', 'family', 'developer', undefined]) {
      expect(usaPortalGestao(role)).toBe(false);
      expect(podeVerAba(role, 'home')).toBe(false);
    }
    expect(usaPortalGestao('gestao')).toBe(true);
    expect(usaPortalGestao('gestao_pedagogica')).toBe(true);
  });

  it('recursos e rótulo de cada perfil', () => {
    expect(recursosDoPerfil('gestao')).toMatchObject({ financeiro: true, aprovarCorrecaoQueGeraCobranca: true, excluirContas: true, chat: false });
    expect(recursosDoPerfil('gestao_pedagogica')).toMatchObject({ financeiro: false, aprovarCorrecaoQueGeraCobranca: false, excluirContas: false, criarContasDaEquipe: false, chat: true });
    expect(rotuloDoPerfil({ role: 'gestao_pedagogica', departamento: 'coordenacao' })).toBe('Coordenação');
    expect(rotuloDoPerfil({ role: 'gestao_pedagogica', departamento: 'diretoria_pedagogica' })).toBe('Direção');
    expect(rotuloDoPerfil({ role: 'gestao' })).toBe('Gestão');
  });
});
