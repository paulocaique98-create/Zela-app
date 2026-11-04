import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, CalendarClock, Layers, Percent, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { brl, formatarData } from '../lib/planosZela';
import { TIPO_AJUSTE, abertaParaAjuste, gerarVencimentos, dividirSaldo, previaDesconto, vencimentosValidos } from '../lib/ajustesContrato';

// Aba "Ajustes" da ficha do contrato (PLANO_FATURAMENTO_ZELA.md, 7B). Só developer; motivo obrigatório; o servidor
// grava quem fez e quando (zela_cobranca_ajustes) e alinha o Asaas pela Edge Function create-zela-charge.
// Nada é gravado direto daqui: zela_cobrancas e zela_cobranca_ajustes não têm policy de escrita.

const COLS_COBRANCA = 'id, tipo, numero, vencimento, status, valor, valor_sistema, valor_sistema_original, valor_implantacao, invoice_url';
const COLS_AJUSTE = 'id, tipo, motivo, antes, depois, feito_por, feito_em, sincronizado_asaas, erro_asaas';
const campo = 'bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-zela-md text-sm font-medium disabled:opacity-50';
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;
const btnNeutro = `${btn} border border-dev-border text-dev-text hover:bg-dev-surface`;
const MODOS = [
  { id: 'vencimentos', label: 'Vencimentos', icon: CalendarClock },
  { id: 'reparcelar', label: 'Reparcelar', icon: Layers },
  { id: 'desconto', label: 'Desconto', icon: Percent },
];
const hoje = () => new Date().toISOString().slice(0, 10);

export default function DeveloperAjustesContrato({ contratacaoId }) {
  const [carregando, setCarregando] = useState(true);
  const [cobrancas, setCobrancas] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [contrato, setContrato] = useState(null);
  const [config, setConfig] = useState({ opcoes: [], primeiraDias: 3 });
  const [quem, setQuem] = useState({});
  const [modo, setModo] = useState('vencimentos');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [novosVenc, setNovosVenc] = useState({});
  const [escolhidas, setEscolhidas] = useState({});
  const [qtd, setQtd] = useState(1);
  const [vencsNovos, setVencsNovos] = useState([]);
  const [aPartir, setAPartir] = useState(1);
  const [percentual, setPercentual] = useState('');

  const carregar = useCallback(async () => {
    const [cb, aj, ct, cfg] = await Promise.all([
      supabase.from('zela_cobrancas').select(COLS_COBRANCA).eq('contratacao_id', contratacaoId).order('numero').limit(200),
      supabase.from('zela_cobranca_ajustes').select(COLS_AJUSTE).eq('contratacao_id', contratacaoId).order('feito_em', { ascending: false }).limit(50),
      supabase.from('school_contratacoes').select('id, status, pagamento, asaas_subscription_id').eq('id', contratacaoId).maybeSingle(),
      supabase.from('zela_config_comercial').select('desconto_mensalidade_opcoes, vencimento_primeira_dias').eq('id', true).maybeSingle(),
    ]);
    if (cb.error || aj.error) toast.error('Não foi possível carregar as cobranças e os ajustes.');
    setCobrancas(cb.data || []);
    setAjustes(aj.data || []);
    setContrato(ct.data || null);
    setConfig({ opcoes: (cfg.data?.desconto_mensalidade_opcoes || []).map(Number), primeiraDias: cfg.data?.vencimento_primeira_dias ?? 3 });
    const ids = [...new Set((aj.data || []).map(a => a.feito_por))];
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name').in('id', ids);
      setQuem(Object.fromEntries((us || []).map(u => [u.id, u.name])));
    }
    setCarregando(false);
  }, [contratacaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const parcelasAbertas = useMemo(() => cobrancas.filter(c => c.tipo === 'parcela' && abertaParaAjuste(c)), [cobrancas]);
  const recorrente = contrato?.pagamento === 'mes_a_mes' && !!contrato?.asaas_subscription_id;
  const idsEscolhidos = parcelasAbertas.filter(c => escolhidas[c.id]).map(c => c.id);
  const saldoEscolhido = parcelasAbertas.filter(c => escolhidas[c.id]).reduce((s, c) => s + Number(c.valor), 0);
  const previaParcelas = dividirSaldo(saldoEscolhido, vencsNovos.length);
  const previa = useMemo(() => (percentual === '' ? [] : previaDesconto(cobrancas, aPartir, Number(percentual), hoje())), [cobrancas, aPartir, percentual]);

  const refazerVencimentos = (primeiro, n) => setVencsNovos(gerarVencimentos(primeiro, n));
  const trocarModo = (m) => {
    setModo(m);
    if (m === 'reparcelar') {
      const base = new Date();
      base.setUTCDate(base.getUTCDate() + Number(config.primeiraDias || 3));
      setEscolhidas(Object.fromEntries(parcelasAbertas.map(c => [c.id, true])));
      setQtd(1);
      refazerVencimentos(base.toISOString().slice(0, 10), 1);
    }
  };

  const chamar = async (body, ok) => {
    setSalvando(true);
    const { data, error } = await supabase.functions.invoke('create-zela-charge', { body });
    let msg = data?.error || error?.message;
    if (error?.context?.json) { try { msg = (await error.context.json())?.error || msg; } catch { /* mantém msg */ } }
    setSalvando(false);
    if (error || data?.error) { toast.error(msg || 'Não foi possível concluir o ajuste.'); return; }
    if (data?.aviso) toast.error(data.aviso); else toast.success(ok);
    setNovosVenc({}); setMotivo(''); setPercentual('');
    await carregar();
  };

  const motivoOk = motivo.trim().length >= 3;
  const confirmar = () => {
    if (salvando) return;
    if (!motivoOk) return toast.error('Informe o motivo do ajuste.');
    if (modo === 'vencimentos') {
      const itens = Object.entries(novosVenc).filter(([, v]) => v).map(([cobranca_id, vencimento]) => ({ cobranca_id, vencimento }));
      if (!itens.length) return toast.error('Altere ao menos um vencimento.');
      if (!vencimentosValidos(itens.map(i => i.vencimento), hoje())) return toast.error('Os vencimentos não podem ser no passado.');
      return chamar({ action: 'ajustar_vencimentos', contratacao_id: contratacaoId, itens, motivo: motivo.trim() }, 'Vencimentos atualizados.');
    }
    if (modo === 'reparcelar') {
      if (!idsEscolhidos.length) return toast.error('Escolha as parcelas em aberto.');
      if (!vencimentosValidos(vencsNovos, hoje())) return toast.error('Confira os vencimentos das novas parcelas.');
      return chamar({ action: 'reparcelar', contratacao_id: contratacaoId, cobranca_ids: idsEscolhidos, vencimentos: vencsNovos, motivo: motivo.trim() }, 'Saldo reparcelado.');
    }
    if (percentual === '') return toast.error('Escolha o percentual.');
    if (!previa.length) return toast.error('Nenhuma parcela futura em aberto a partir dessa parcela.');
    return chamar({ action: 'aplicar_desconto', contratacao_id: contratacaoId, a_partir: Number(aPartir), percentual: Number(percentual), motivo: motivo.trim() }, 'Desconto aplicado.');
  };

  if (carregando) return <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-dev-text-muted" /></div>;
  if (!cobrancas.length) return <p className="text-sm text-dev-text-muted">Este contrato ainda não tem cobranças para ajustar.</p>;

  const bloqueioModo = (modo === 'reparcelar' || modo === 'desconto') && recorrente
    ? 'Contrato Mensal com assinatura recorrente no Asaas: só os vencimentos podem ser ajustados por aqui.' : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-dev-text-muted">Parcela paga nunca muda. Cada ajuste fica registrado com motivo, autor, data, antes e depois, e o Asaas é atualizado em seguida.</p>

      <div className="flex gap-2 flex-wrap">
        {MODOS.map(m => (
          <button key={m.id} type="button" onClick={() => trocarModo(m.id)} className={modo === m.id ? btnPrimario : btnNeutro}><m.icon size={14} /> {m.label}</button>
        ))}
      </div>

      {bloqueioModo && <p className="text-sm text-warning">{bloqueioModo}</p>}

      {!bloqueioModo && modo === 'vencimentos' && (
        <div className="space-y-2">
          {cobrancas.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm border-b border-dev-border py-2">
              <div>
                <p className="text-dev-text">{c.tipo === 'implantacao' ? 'Implantação' : `Parcela ${c.numero}`} · {brl(c.valor)}</p>
                <p className="text-xs text-dev-text-muted">{formatarData(c.vencimento)} · {c.status}</p>
              </div>
              {abertaParaAjuste(c)
                ? <input type="date" aria-label={`Novo vencimento da parcela ${c.numero}`} min={hoje()} className={campo} value={novosVenc[c.id] || ''} onChange={e => setNovosVenc(v => ({ ...v, [c.id]: e.target.value }))} />
                : <span className="text-xs text-dev-text-muted">Não editável</span>}
            </div>
          ))}
        </div>
      )}

      {!bloqueioModo && modo === 'reparcelar' && (
        <div className="space-y-3">
          {parcelasAbertas.length === 0 && <p className="text-sm text-dev-text-muted">Não há parcela em aberto.</p>}
          {parcelasAbertas.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-dev-text">
              <input type="checkbox" checked={!!escolhidas[c.id]} onChange={e => setEscolhidas(s => ({ ...s, [c.id]: e.target.checked }))} />
              Parcela {c.numero} · {brl(c.valor)} · {formatarData(c.vencimento)} ({c.status})
            </label>
          ))}
          {parcelasAbertas.length > 0 && (
            <>
              <p className="text-sm text-dev-text">Saldo a reparcelar: <strong>{brl(saldoEscolhido)}</strong></p>
              <label className="flex items-center gap-2 text-sm text-dev-text">Novas parcelas
                <input type="number" min={1} max={24} className={`${campo} w-20`} value={qtd}
                  onChange={e => { const n = Math.min(24, Math.max(1, Number(e.target.value) || 1)); setQtd(n); refazerVencimentos(vencsNovos[0] || hoje(), n); }} />
              </label>
              <p className="text-xs text-dev-text-muted">Cada parcela vence 30 dias depois da anterior. Edite a data de qualquer uma se precisar.</p>
              {vencsNovos.map((v, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-dev-text">Parcela nova {i + 1} · {brl(previaParcelas[i])}</span>
                  <input type="date" aria-label={`Vencimento da parcela nova ${i + 1}`} min={hoje()} className={campo} value={v}
                    onChange={e => setVencsNovos(l => l.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {!bloqueioModo && modo === 'desconto' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-dev-text">A partir da parcela
              <input type="number" min={1} className={`${campo} w-24 ml-2`} value={aPartir} onChange={e => setAPartir(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <select aria-label="Percentual de desconto" className={campo} value={percentual} onChange={e => setPercentual(e.target.value)}>
              <option value="">Escolha o percentual</option>
              <option value="0">Remover desconto</option>
              {config.opcoes.map(o => <option key={o} value={o}>{String(o).replace('.', ',')} por cento</option>)}
            </select>
          </div>
          <p className="text-xs text-dev-text-muted">Vale só para parcelas futuras ainda não pagas. O percentual é calculado sobre o valor original, sem acumular.</p>
          {previa.map(p => <p key={p.id} className="text-sm text-dev-text">Parcela {p.numero}: {brl(p.antes)} para {brl(p.depois)}</p>)}
          {percentual !== '' && previa.length === 0 && <p className="text-sm text-dev-text-muted">Nenhuma parcela futura em aberto a partir desta parcela.</p>}
        </div>
      )}

      {!bloqueioModo && (
        <div className="space-y-2">
          <textarea aria-label="Motivo do ajuste" maxLength={500} rows={2} placeholder="Motivo do ajuste (obrigatório)" className={`${campo} w-full`} value={motivo} onChange={e => setMotivo(e.target.value)} />
          <button type="button" className={btnPrimario} disabled={salvando || !motivoOk} onClick={confirmar}>
            {salvando && <Loader2 size={14} className="animate-spin" />} Confirmar ajuste
          </button>
        </div>
      )}

      <div className="pt-2 border-t border-dev-border space-y-3">
        <h4 className="text-sm font-bold text-dev-text">Histórico de ajustes</h4>
        {ajustes.length === 0 && <p className="text-sm text-dev-text-muted">Nenhum ajuste feito neste contrato.</p>}
        {ajustes.map(a => (
          <div key={a.id} className="text-sm border border-dev-border rounded-zela-md p-3 space-y-1">
            <p className="text-dev-text font-medium">{TIPO_AJUSTE[a.tipo]} · {new Date(a.feito_em).toLocaleString('pt-BR')}</p>
            <p className="text-xs text-dev-text-muted">Por {quem[a.feito_por] || 'developer'}. Motivo: {a.motivo}</p>
            <ResumoAjuste a={a} />
            {!a.sincronizado_asaas && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-warning">Asaas pendente{a.erro_asaas ? `: ${a.erro_asaas}` : ''}</span>
                <button type="button" className={btnNeutro} disabled={salvando} onClick={() => chamar({ action: 'sincronizar_ajuste', ajuste_id: a.id }, 'Asaas sincronizado.')}><RefreshCw size={14} /> Sincronizar de novo</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumoAjuste({ a }) {
  const linhaDe = (x) => `${x.numero ? `Parcela ${x.numero}` : 'Parcela'}: ${[x.vencimento && formatarData(x.vencimento), x.valor != null && brl(x.valor)].filter(Boolean).join(' · ')}`;
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div><p className="text-dev-text-muted mb-1">Antes</p>{(a.antes || []).map(x => <p key={x.id} className="text-dev-text">{linhaDe(x)}</p>)}</div>
      <div><p className="text-dev-text-muted mb-1">Depois</p>{(a.depois || []).map(x => <p key={x.id} className="text-dev-text">{linhaDe(x)}</p>)}</div>
    </div>
  );
}
