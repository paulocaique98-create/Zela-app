import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CONFIG_PADRAO, CONDICOES_PADRAO } from '../lib/planosZela';
import { faixasDoPlano } from '../lib/pacotesFaixas';

// Dados do menu Planos do Portal do Dev (só o developer lê estas tabelas).
// Sem Realtime: recarrega ao salvar.
const COLS_PRECOS = 'item_id, tipo_cobranca, valor, custo_estimado, chaves, ativo';
const COLS_PLANOS = 'id, nome, modalidade, itens, preco_por_aluno, minimo_mensal, alunos_min, alunos_max, implantacao_valor, ordem, ativo, descricao, custo_por_aluno, custo_referencia_faixas';
const COLS_FAIXAS = 'plano_id, faixa, valor_final';
const COLS_CONDICOES = 'chave, ciclo, pagamento, parcelas, intervalo_meses, desconto_percent, ordem';
const COLS_CICLOS = 'id, plano_id, ciclo, meses, desconto_percent, implantacao_valor, ativo';
const COLS_CONFIG = 'limite_alunos_por_aluno, desconto_implantacao_max_percent, desconto_mensalidade_max_percent, implantacao_min, implantacao_max';
const COLS_CONTRATACOES = 'id, school_id, plano_id, ciclo, meses, alunos_contratados, itens, valor_mensal, valor_ciclo, implantacao_base, implantacao_desconto_tipo, implantacao_desconto, implantacao_final, desconto_motivo, mensal_desconto_tipo, mensal_desconto, mensal_desconto_recorrente, mensal_desconto_meses, valor_mensal_com_desconto, inicio, fim, status, created_at';

export function usePlanosZela() {
  const [state, setState] = useState({
    loading: true, erro: null, precos: [], planos: [], ciclos: [], config: CONFIG_PADRAO, contratacoes: [], escolas: [], alunosAtivos: {}, condicoes: CONDICOES_PADRAO, faturamento: {},
  });

  const recarregar = useCallback(async () => {
    const [precos, planos, ciclos, config, contratacoes, escolas, contagem, faixas, abertas, condicoes] = await Promise.all([
      supabase.from('zela_modulo_precos').select(COLS_PRECOS).order('item_id'),
      supabase.from('zela_planos').select(COLS_PLANOS).order('ordem').order('nome').limit(200),
      supabase.from('zela_plano_ciclos').select(COLS_CICLOS).limit(1000),
      supabase.from('zela_config_comercial').select(COLS_CONFIG).maybeSingle(),
      supabase.from('school_contratacoes').select(COLS_CONTRATACOES).eq('status', 'ativa').limit(2000),
      supabase.from('schools').select('id, name, school_code, is_active, cnpj, email').order('name').limit(1000),
      supabase.rpc('contagem_alunos_escolas'),
      supabase.from('zela_pacote_faixas').select(COLS_FAIXAS).limit(2000),
      supabase.from('zela_cobrancas').select('school_id, vencimento, valor').in('status', ['pendente', 'vencida']).limit(2000),
      supabase.from('zela_condicoes_pagamento').select(COLS_CONDICOES).eq('ativo', true).order('ordem').limit(20),
    ]);
    const falha = [precos, planos, ciclos, config, contratacoes, escolas, faixas, abertas, condicoes].find(r => r.error);
    const alunosAtivos = {};
    for (const l of contagem.data || []) alunosAtivos[l.school_id] = l.ativos;
    // Resumo do faturamento por escola (cobranças em aberto e em atraso), para o card de Contratações.
    const faturamento = {};
    const hoje = new Date().toISOString().slice(0, 10);
    for (const c of abertas.data || []) {
      const f = faturamento[c.school_id] || (faturamento[c.school_id] = { abertas: 0, atraso: 0, valor: 0 });
      f.abertas += 1;
      f.valor += Number(c.valor);
      if (c.vencimento < hoje) f.atraso += 1;
    }
    setState({
      loading: false,
      erro: falha ? falha.error.message : null,
      precos: precos.data || [],
      // Pacote com faixas ganha plano.faixas (faixa -> valor final com o custo atual).
      planos: (planos.data || []).map(p => (p.modalidade === 'pacote' ? { ...p, faixas: faixasDoPlano(faixas.data || [], p) } : p)),
      ciclos: ciclos.data || [],
      config: { ...CONFIG_PADRAO, ...config.data },
      contratacoes: contratacoes.data || [],
      escolas: escolas.data || [],
      alunosAtivos,
      faturamento,
      condicoes: condicoes.data?.length ? condicoes.data : CONDICOES_PADRAO,
    });
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { ...state, recarregar };
}
