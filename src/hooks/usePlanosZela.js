import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CONFIG_PADRAO } from '../lib/planosZela';

// Dados do menu Planos do Portal do Dev (só o developer lê estas tabelas).
// Sem Realtime: recarrega ao salvar.
const COLS_PRECOS = 'item_id, tipo_cobranca, valor, custo_estimado, chaves, ativo';
const COLS_PLANOS = 'id, nome, modalidade, itens, preco_por_aluno, minimo_mensal, alunos_min, alunos_max, implantacao_valor, ordem, ativo, descricao';
const COLS_CICLOS = 'id, plano_id, ciclo, meses, desconto_percent, implantacao_valor, ativo';
const COLS_CONFIG = 'limite_alunos_por_aluno, desconto_implantacao_max_percent, implantacao_min, implantacao_max';
const COLS_CONTRATACOES = 'id, school_id, plano_id, ciclo, meses, alunos_contratados, itens, valor_mensal, valor_ciclo, implantacao_base, implantacao_desconto_tipo, implantacao_desconto, implantacao_final, desconto_motivo, inicio, fim, status, created_at';

export function usePlanosZela() {
  const [state, setState] = useState({
    loading: true, erro: null, precos: [], planos: [], ciclos: [], config: CONFIG_PADRAO, contratacoes: [], escolas: [], alunosAtivos: {},
  });

  const recarregar = useCallback(async () => {
    const [precos, planos, ciclos, config, contratacoes, escolas, contagem] = await Promise.all([
      supabase.from('zela_modulo_precos').select(COLS_PRECOS).order('item_id'),
      supabase.from('zela_planos').select(COLS_PLANOS).order('ordem').order('nome').limit(200),
      supabase.from('zela_plano_ciclos').select(COLS_CICLOS).limit(1000),
      supabase.from('zela_config_comercial').select(COLS_CONFIG).maybeSingle(),
      supabase.from('school_contratacoes').select(COLS_CONTRATACOES).eq('status', 'ativa').limit(2000),
      supabase.from('schools').select('id, name, school_code, is_active').order('name').limit(1000),
      supabase.rpc('contagem_alunos_escolas'),
    ]);
    const falha = [precos, planos, ciclos, config, contratacoes, escolas].find(r => r.error);
    const alunosAtivos = {};
    for (const l of contagem.data || []) alunosAtivos[l.school_id] = l.ativos;
    setState({
      loading: false,
      erro: falha ? falha.error.message : null,
      precos: precos.data || [],
      planos: planos.data || [],
      ciclos: ciclos.data || [],
      config: { ...CONFIG_PADRAO, ...config.data },
      contratacoes: contratacoes.data || [],
      escolas: escolas.data || [],
      alunosAtivos,
    });
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { ...state, recarregar };
}
