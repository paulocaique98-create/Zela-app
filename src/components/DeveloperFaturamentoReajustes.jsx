import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, TrendingUp, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { brl, formatarData } from '../lib/planosZela';
import { avisoReferencia } from '../lib/ipcaIbge';

// Portal do Dev · Faturamento: IPCA, renovação do Anual (rascunho) e reajuste do Mensal
// (PLANO_FATURAMENTO_ZELA.md, seção 2). Leitura pelas tabelas com RLS de developer; toda gravação
// passa por RPC do servidor ou pela Edge Function create-zela-charge, que também fala com o Asaas.

const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const rotulo = 'block text-[11px] font-bold text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-zela-md text-xs font-medium transition-all disabled:opacity-50';
const btnNeutro = `${btn} border border-dev-border text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high`;
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;

const DUAS_CASAS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const mesesEntre = (de, ate) => (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth());

export default function DeveloperFaturamentoReajustes({ onMudou }) {
  const [carregando, setCarregando] = useState(true);
  const [ipcas, setIpcas] = useState([]);
  const [renovacoes, setRenovacoes] = useState([]);
  const [mensais, setMensais] = useState([]);
  const [escolas, setEscolas] = useState({});
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [perc, setPerc] = useState('');
  const [ocupado, setOcupado] = useState(null);
  const [avisoIbge, setAvisoIbge] = useState(null);
  const [reajuste, setReajuste] = useState(null);

  const carregar = useCallback(async () => {
    const [ip, rn, ms] = await Promise.all([
      supabase.from('zela_ipca_anual').select('ano, percentual').order('ano', { ascending: false }).limit(10),
      supabase.from('zela_renovacoes').select('id, school_id, origem_id, ipca_ano, ipca_percent, base_mensal, novo_mensal, criado_em').eq('status', 'rascunho').order('criado_em').limit(100),
      supabase.from('school_contratacoes').select('id, school_id, inicio, valor_mensal').eq('status', 'ativa').eq('pagamento', 'mes_a_mes').not('asaas_subscription_id', 'is', null).limit(300),
    ]);
    const escIds = [...new Set([...(rn.data || []), ...(ms.data || [])].map(x => x.school_id))];
    const es = escIds.length ? await supabase.from('schools').select('id, name').in('id', escIds).limit(500) : { data: [] };
    setIpcas(ip.data || []);
    setRenovacoes(rn.data || []);
    setMensais(ms.data || []);
    setEscolas(Object.fromEntries((es.data || []).map(e => [e.id, e.name])));
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const terminou = () => { carregar(); onMudou?.(); };

  const registrarIpca = async () => {
    const p = Number(String(perc).replace(',', '.'));
    if (!Number.isFinite(p)) return toast.error('Informe o percentual do IPCA.');
    setOcupado('ipca');
    const { error } = await supabase.rpc('zela_ipca_registrar', { p_ano: Number(ano), p_percentual: p });
    setOcupado(null);
    if (error) return toast.error(error.message);
    toast.success('IPCA registrado.');
    setPerc('');
    setAvisoIbge(null);
    carregar();
  };

  // Só preenche o formulário; nada é gravado até o developer clicar em Registrar.
  const buscarIbge = async () => {
    setOcupado('ibge');
    const { data, error } = await supabase.functions.invoke('buscar-ipca-ibge', { body: {} });
    let msg = data?.error || error?.message;
    if (error?.context?.json) { try { msg = (await error.context.json())?.error || msg; } catch { /* mantém msg */ } }
    setOcupado(null);
    if (error || data?.error || !Number.isFinite(Number(data?.percentual))) return toast.error(msg || 'Não foi possível buscar o IPCA no IBGE.');
    setAno(String(data.ano));
    setPerc(Number(data.percentual).toFixed(2).replace('.', ','));
    setAvisoIbge(avisoReferencia(data));
  };

  const decidirRenovacao = async (r, confirmar) => {
    setOcupado(r.id);
    const { error } = confirmar
      ? await supabase.rpc('zela_renovacao_confirmar', { p_renovacao_id: r.id })
      : await supabase.rpc('zela_renovacao_descartar', { p_renovacao_id: r.id });
    setOcupado(null);
    if (error) return toast.error(error.message);
    toast.success(confirmar ? 'Renovação confirmada. Gere os links da nova contratação.' : 'Renovação descartada.');
    terminou();
  };

  const aplicarReajuste = async () => {
    const p = Number(String(reajuste.percentual).replace(',', '.'));
    setReajuste(a => ({ ...a, salvando: true }));
    const { data, error } = await supabase.functions.invoke('create-zela-charge', {
      body: { action: 'reajustar_mensal', contratacao_id: reajuste.id, ano_ipca: Number(reajuste.ano), percentual: p },
    });
    let msg = data?.error || error?.message;
    if (error?.context?.json) { try { msg = (await error.context.json())?.error || msg; } catch { /* mantém msg */ } }
    if (error || data?.error) { setReajuste(a => ({ ...a, salvando: false })); return toast.error(msg || 'Não foi possível reajustar.'); }
    toast.success(`Reajustado de ${brl(data.valor_anterior)} para ${brl(data.valor_novo)} nas próximas cobranças.`);
    setReajuste(null);
    terminou();
  };

  if (carregando) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-dev-primary" /></div>;

  const hoje = new Date();
  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="font-bold flex items-center gap-2 mb-1"><TrendingUp size={16} className="text-dev-primary" /> IPCA</p>
        <p className="text-xs text-dev-text-muted mb-3">Acumulado dos 12 meses: digite ou busque no IBGE (a busca só preenche, você confere e registra). Um ano já usado em reajuste ou renovação não muda mais de valor.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28"><label className={rotulo} htmlFor="ipca-ano">Ano</label><input id="ipca-ano" type="number" min="2000" max="2100" className={campo} value={ano} onChange={e => setAno(e.target.value)} /></div>
          <div className="w-32"><label className={rotulo} htmlFor="ipca-perc">Percentual</label><input id="ipca-perc" inputMode="decimal" placeholder="4,50" className={campo} value={perc} onChange={e => setPerc(e.target.value)} /></div>
          <button type="button" className={btnNeutro} onClick={buscarIbge} disabled={!!ocupado}>{ocupado === 'ibge' ? <Loader2 size={13} className="animate-spin" /> : null} Buscar do IBGE</button>
          <button type="button" className={btnPrimario} onClick={registrarIpca} disabled={ocupado === 'ipca' || !perc}>{ocupado === 'ipca' ? <Loader2 size={13} className="animate-spin" /> : null} Registrar</button>
        </div>
        {avisoIbge && <p className={`text-xs mt-3 ${avisoIbge.parcial ? 'text-brass' : 'text-dev-text-muted'}`}>{avisoIbge.texto}</p>}
        {ipcas.length > 0 && <p className="text-xs text-dev-text-muted mt-3">{ipcas.map(i => `${i.ano}: ${Number(i.percentual).toLocaleString('pt-BR', DUAS_CASAS)}%`).join(' · ')}</p>}
      </div>

      <div className={card}>
        <p className="font-bold flex items-center gap-2 mb-1"><RefreshCw size={16} className="text-dev-primary" /> Renovações do Anual em rascunho</p>
        <p className="text-xs text-dev-text-muted mb-3">Nascem sozinhas perto do fim do contrato, com o valor atual mais o IPCA. Nada é cobrado até você confirmar. A implantação não se repete.</p>
        {renovacoes.length === 0 ? <p className="text-sm text-dev-text-muted">Nenhum rascunho no momento.</p> : renovacoes.map(r => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-dev-border py-2 first:border-t-0">
            <div className="text-sm">
              <p className="font-medium">{escolas[r.school_id] || 'Escola'}</p>
              <p className="text-xs text-dev-text-muted">Mensalidade {brl(r.base_mensal)} para {brl(r.novo_mensal)} (IPCA {r.ipca_ano}: {Number(r.ipca_percent).toLocaleString('pt-BR', DUAS_CASAS)}%)</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={btnNeutro} onClick={() => decidirRenovacao(r, false)} disabled={ocupado === r.id}>Descartar</button>
              <button type="button" className={btnPrimario} onClick={() => decidirRenovacao(r, true)} disabled={ocupado === r.id}>{ocupado === r.id ? <Loader2 size={13} className="animate-spin" /> : null} Confirmar renovação</button>
            </div>
          </div>
        ))}
      </div>

      <div className={card}>
        <p className="font-bold flex items-center gap-2 mb-1"><TrendingUp size={16} className="text-dev-primary" /> Reajuste do Mensal</p>
        <p className="text-xs text-dev-text-muted mb-3">Sem fidelidade, mas no máximo 1 vez a cada 12 meses e nunca acima do IPCA registrado. Vale só para as próximas cobranças.</p>
        {mensais.length === 0 ? <p className="text-sm text-dev-text-muted">Nenhum contrato Mensal ativo com assinatura.</p> : mensais.map(m => {
          const liberado = mesesEntre(new Date(`${m.inicio}T12:00:00`), hoje) >= 12;
          return (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-dev-border py-2 first:border-t-0">
              <div className="text-sm">
                <p className="font-medium">{escolas[m.school_id] || 'Escola'}</p>
                <p className="text-xs text-dev-text-muted">Desde {formatarData(m.inicio)}. O servidor confere o prazo de 12 meses.</p>
              </div>
              <button type="button" className={btnNeutro} disabled={!ipcas.length}
                title={liberado ? '' : 'Pode estar dentro dos 12 meses; o servidor decide'}
                onClick={() => setReajuste({ id: m.id, escola: escolas[m.school_id], ano: String(ipcas[0].ano), percentual: String(ipcas[0].percentual) })}>Reajustar</button>
            </div>
          );
        })}
      </div>

      {reajuste && (
        <div className="fixed inset-0 z-[100] bg-ink/70 backdrop-blur-sm">
          <div className="bg-dev-surface w-full h-full overflow-y-auto p-5 space-y-3 text-dev-text">
            <h3 className="font-bold">Reajustar {reajuste.escola}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={rotulo} htmlFor="rj-ano">IPCA de</label>
                <select id="rj-ano" className={campo} value={reajuste.ano} onChange={e => setReajuste(a => ({ ...a, ano: e.target.value, percentual: String(ipcas.find(i => String(i.ano) === e.target.value)?.percentual ?? '') }))}>
                  {ipcas.map(i => <option key={i.ano} value={i.ano}>{i.ano} ({Number(i.percentual).toLocaleString('pt-BR', DUAS_CASAS)}%)</option>)}
                </select></div>
              <div><label className={rotulo} htmlFor="rj-perc">Percentual aplicado</label><input id="rj-perc" inputMode="decimal" className={campo} value={reajuste.percentual} onChange={e => setReajuste(a => ({ ...a, percentual: e.target.value }))} /></div>
            </div>
            <p className="text-sm text-dev-text-muted">O novo valor vale a partir da próxima cobrança gerada pelo Asaas. As já emitidas não mudam. Fica registrado quem reajustou.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnNeutro} onClick={() => setReajuste(null)} disabled={reajuste.salvando}>Voltar</button>
              <button type="button" className={btnPrimario} onClick={aplicarReajuste} disabled={reajuste.salvando || !reajuste.percentual}>{reajuste.salvando ? <Loader2 size={13} className="animate-spin" /> : null} Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
