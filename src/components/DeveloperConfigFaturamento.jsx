import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { CAMPOS_CONFIG, mudancasDoRegistro } from '../lib/configFaturamento';

// Portal do Dev · Configurações do faturamento (PLANO_FATURAMENTO_ZELA.md, 7A).
// Reaproveita zela_config_comercial e zela_condicoes_pagamento (RLS só developer); o histórico
// vem de zela_planos_historico, gravado pelo gatilho no banco (quem, quando, antes e depois).

const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const rotulo = 'block text-[11px] font-bold text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-zela-md text-sm font-medium transition-all disabled:opacity-50 bg-dev-primary-container text-dev-primary hover:brightness-110';

const COLS_CONFIG = 'vencimento_primeira_dias, carencia_dias, cancelar_1a_parcela_dias, multa_percent, juros_mensal_percent, desconto_mensalidade_opcoes, desconto_implantacao_max_percent, implantacao_min, implantacao_max';
const COLS_COND = 'id, chave, ciclo, pagamento, parcelas, desconto_percent, ativo, ordem';
const COLS_HIST = 'id, tabela, acao, antes, depois, changed_by, changed_at';
const NOME_COND = { mensal: 'Mensal', anual_vista: 'Anual à vista', anual_6x: 'Anual em 6x', anual_12x: 'Anual em 12x' };

const paraLista = (txt) => String(txt).split(/[;,\s]+/).map(s => s.trim().replace(',', '.')).filter(Boolean).map(Number);

// secao: 'config' (regras e condições, com Salvar) ou 'historico' (quem mudou, quando, antes e depois).
export default function DeveloperConfigFaturamento({ embutido = false, secao = 'config' }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [opcoesTxt, setOpcoesTxt] = useState('');
  const [conds, setConds] = useState([]);
  const [hist, setHist] = useState([]);
  const [nomes, setNomes] = useState({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [c, cd, h] = await Promise.all([
      supabase.from('zela_config_comercial').select(COLS_CONFIG).eq('id', true).maybeSingle(),
      supabase.from('zela_condicoes_pagamento').select(COLS_COND).order('ordem').limit(20),
      supabase.from('zela_planos_historico').select(COLS_HIST)
        .in('tabela', ['zela_config_comercial', 'zela_condicoes_pagamento'])
        .order('changed_at', { ascending: false }).limit(100),
    ]);
    if (c.error || cd.error || h.error) { setErro('Não foi possível carregar as configurações.'); setCarregando(false); return; }
    setCfg(c.data);
    setOpcoesTxt((c.data?.desconto_mensalidade_opcoes || []).map(n => String(Number(n)).replace('.', ',')).join(', '));
    setConds(cd.data || []);
    setHist(h.data || []);
    const ids = [...new Set((h.data || []).map(r => r.changed_by).filter(Boolean))];
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name').in('id', ids).limit(50);
      setNomes(Object.fromEntries((us || []).map(u => [u.id, u.name])));
    }
    setErro(null);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const mudar = (k, v) => setCfg(c => ({ ...c, [k]: v }));
  const mudarCond = (id, k, v) => setConds(l => l.map(x => (x.id === id ? { ...x, [k]: v } : x)));

  // Um só botão: grava as regras e as condições. Linha sem mudança não entra no histórico (gatilho ignora).
  const salvar = async () => {
    const opcoes = paraLista(opcoesTxt);
    if (opcoes.some(n => !(n >= 0 && n <= 100))) return toast.error('Os descontos da mensalidade devem ficar entre 0 e 100.');
    if (conds.some(c => !(Number(c.desconto_percent) >= 0 && Number(c.desconto_percent) <= 50))) return toast.error('O desconto de cada condição deve ficar entre 0 e 50.');
    const diasCancelar = Number(cfg.cancelar_1a_parcela_dias);
    if (!Number.isInteger(diasCancelar) || diasCancelar < 7 || diasCancelar > 180) return toast.error('Os dias para sugerir o cancelamento da 1ª parcela devem ficar entre 7 e 180.');
    setSalvando(true);
    const { error } = await supabase.from('zela_config_comercial').update({
      vencimento_primeira_dias: Number(cfg.vencimento_primeira_dias),
      carencia_dias: Number(cfg.carencia_dias),
      cancelar_1a_parcela_dias: diasCancelar,
      multa_percent: Number(cfg.multa_percent),
      juros_mensal_percent: Number(cfg.juros_mensal_percent),
      desconto_mensalidade_opcoes: opcoes,
      desconto_implantacao_max_percent: Number(cfg.desconto_implantacao_max_percent),
      implantacao_min: Number(cfg.implantacao_min),
      implantacao_max: Number(cfg.implantacao_max),
    }).eq('id', true);
    if (error) { setSalvando(false); return toast.error(error.message || 'Não foi possível salvar as regras.'); }
    for (const c of conds) {
      const { error: e } = await supabase.from('zela_condicoes_pagamento')
        .update({ desconto_percent: Number(c.desconto_percent), ativo: !!c.ativo }).eq('id', c.id);
      if (e) { setSalvando(false); carregar(); return toast.error(e.message || 'Não foi possível salvar as condições.'); }
    }
    setSalvando(false);
    toast.success('Salvo. Contratos antigos não mudam; carência e juros valem para todos daqui para frente.');
    carregar();
  };

  if (carregando) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-dev-text-muted" size={22} /></div>;
  if (erro || !cfg) return <div className={card}><p className="text-sm text-dev-text-muted">{erro || 'Configuração não encontrada.'}</p></div>;

  const num = (k, label, step = '1') => (
    <div key={k}>
      <label className={rotulo}>{label}</label>
      <input type="number" step={step} min="0" className={campo} value={cfg[k] ?? ''} onChange={e => mudar(k, e.target.value)} />
    </div>
  );

  const botaoSalvar = (
    <div className="flex justify-end">
      <button type="button" className={btn} disabled={salvando} onClick={salvar}>
        {salvando ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
      </button>
    </div>
  );

  const linhas = hist.flatMap(r => mudancasDoRegistro(r).map((m, i) => ({ ...m, key: `${r.id}-${i}`, quem: nomes[r.changed_by] || 'Desenvolvedor', quando: r.changed_at })));

  return (
    <div className={embutido ? 'space-y-4' : 'h-full overflow-y-auto p-4 md:p-6 space-y-4 text-dev-text'}>
      {secao === 'config' && (<>
      <div className={card}>
        <h3 className="text-sm font-bold text-dev-text mb-1">Condições de pagamento</h3>
        <p className="text-sm text-dev-text-muted mb-3">Desconto de cada condição e se ela aparece ao contratar. Contratos já fechados guardam as regras do dia.</p>
        <div className="space-y-2">
          {conds.map(c => (
            <div key={c.id} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
              <p className="text-sm text-dev-text col-span-2 sm:col-span-1">{NOME_COND[c.chave] || c.chave}</p>
              <div>
                <label className={rotulo}>Desconto (%)</label>
                <input type="number" min="0" max="50" step="0.5" className={campo} value={c.desconto_percent} onChange={e => mudarCond(c.id, 'desconto_percent', e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-dev-text pb-2">
                <input type="checkbox" checked={!!c.ativo} onChange={e => mudarCond(c.id, 'ativo', e.target.checked)} /> Ativa
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="text-sm font-bold text-dev-text mb-1">Regras de cobrança</h3>
        <p className="text-sm text-dev-text-muted mb-3">Carência e juros valem para todos a partir da mudança. As demais regras só valem para contratos novos.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {num('vencimento_primeira_dias', CAMPOS_CONFIG.vencimento_primeira_dias.rotulo)}
          {num('carencia_dias', CAMPOS_CONFIG.carencia_dias.rotulo)}
          {num('cancelar_1a_parcela_dias', CAMPOS_CONFIG.cancelar_1a_parcela_dias.rotulo)}
          {num('multa_percent', 'Multa por atraso (%)', '0.01')}
          {num('juros_mensal_percent', 'Juros ao mês (%)', '0.01')}
          {num('implantacao_min', 'Implantação mínima (R$)', '0.01')}
          {num('implantacao_max', 'Implantação máxima (R$)', '0.01')}
          {num('desconto_implantacao_max_percent', 'Teto de desconto da implantação (%)', '0.01')}
          <div>
            <label className={rotulo}>Descontos da mensalidade (%)</label>
            <input className={campo} value={opcoesTxt} onChange={e => setOpcoesTxt(e.target.value)} placeholder="5, 10" />
          </div>
        </div>
      </div>

      {botaoSalvar}
      </>)}

      {secao === 'historico' && (
      <div className={card}>
        <h3 className="text-sm font-bold text-dev-text mb-3">Histórico de alterações</h3>
        {linhas.length === 0 ? (
          <p className="text-sm text-dev-text-muted">Nenhuma alteração registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-dev-text-muted">
                  <th className="py-2 pr-3">Quando</th><th className="pr-3">Quem</th><th className="pr-3">Item</th><th className="pr-3">Antes</th><th>Depois</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.key} className="border-t border-dev-border text-dev-text">
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(l.quando).toLocaleString('pt-BR')}</td>
                    <td className="pr-3">{l.quem}</td>
                    <td className="pr-3">{l.origem !== 'Configuração' ? `${l.origem}: ${l.campo}` : l.campo}</td>
                    <td className="pr-3 text-dev-text-muted">{l.antes ?? 'novo'}</td>
                    <td>{l.depois}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
