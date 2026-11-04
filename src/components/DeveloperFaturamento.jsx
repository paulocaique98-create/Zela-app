import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Copy, CalendarClock, CheckCircle2, Ban, PauseCircle, PlayCircle, X, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { brl, formatarData } from '../lib/planosZela';
import { gerarMensagemCobranca } from '../lib/mensagemCobrancaZela';
import DeveloperFaturamentoReajustes from './DeveloperFaturamentoReajustes';
import DeveloperConfigFaturamento from './DeveloperConfigFaturamento';

// Portal do Dev · Faturamento (PLANO_FATURAMENTO_ZELA.md, item 9). Lê zela_cobrancas (RLS: developer lê tudo)
// e age pela Edge Function create-zela-charge (developer; Asaas do Zela + banco) e por RPCs do servidor.
// Sem link de pagamento, a mensagem não é copiada: use "Gerar links".
// "Em atraso" aqui inclui pendente com vencimento passado; a rotina diária (zela_faturamento_rotina) marca
// vencida e suspende após a carência.

const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const rotulo = 'block text-[11px] font-bold text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-zela-md text-xs font-medium transition-all disabled:opacity-50';
const btnNeutro = `${btn} border border-dev-border text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high`;
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;

const COLS_COBRANCAS = 'id, school_id, contratacao_id, tipo, numero, vencimento, valor, status, invoice_url, paga_em, paga_manual';
const STATUS_CONTRATO = { aguardando_pagamento: 'Aguardando pagamento', ativa: 'Ativa', suspensa: 'Suspensa', encerrada: 'Encerrada', cancelada: 'Cancelada' };
const STATUS_COBRANCA = { pendente: 'Pendente', vencida: 'Vencida', paga: 'Paga', cancelada: 'Cancelada', estornada: 'Estornada' };
const hojeIso = () => new Date().toISOString().slice(0, 10);
const emAtraso = (c) => c.status === 'vencida' || (c.status === 'pendente' && c.vencimento < hojeIso());
const statusVisual = (c) => (emAtraso(c) ? 'Em atraso' : STATUS_COBRANCA[c.status] || c.status);

export default function DeveloperFaturamento({ aba = 'cobrancas' }) {
  // A aba vem do submenu do menu lateral (DeveloperLayout).
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [cobrancas, setCobrancas] = useState([]);
  const [contratos, setContratos] = useState({});
  const [escolas, setEscolas] = useState({});
  const [fStatus, setFStatus] = useState('abertas');
  const [fEscola, setFEscola] = useState('');
  const [fDe, setFDe] = useState('');
  const [fAte, setFAte] = useState('');
  const [acao, setAcao] = useState(null);

  const carregar = useCallback(async () => {
    const { data: cobs, error } = await supabase.from('zela_cobrancas').select(COLS_COBRANCAS).order('vencimento').limit(1000);
    if (error) { setErro(error.message); setCarregando(false); return; }
    const ctIds = [...new Set((cobs || []).map(c => c.contratacao_id))];
    const escIds = [...new Set((cobs || []).map(c => c.school_id))];
    const [ct, es] = await Promise.all([
      ctIds.length ? supabase.from('school_contratacoes').select('id, status, ciclo, condicao_chave').in('id', ctIds).limit(1000) : { data: [] },
      escIds.length ? supabase.from('schools').select('id, name, school_code, cnpj').in('id', escIds).limit(1000) : { data: [] },
    ]);
    setCobrancas(cobs || []);
    setContratos(Object.fromEntries((ct.data || []).map(c => [c.id, c])));
    setEscolas(Object.fromEntries((es.data || []).map(e => [e.id, e])));
    setErro(null);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => cobrancas.filter(c => {
    if (fEscola && c.school_id !== fEscola) return false;
    if (fDe && c.vencimento < fDe) return false;
    if (fAte && c.vencimento > fAte) return false;
    if (fStatus === 'abertas') return c.status === 'pendente' || c.status === 'vencida';
    if (fStatus === 'atraso') return emAtraso(c);
    if (fStatus === 'todas') return true;
    return c.status === fStatus;
  }), [cobrancas, fStatus, fEscola, fDe, fAte]);

  const grupos = useMemo(() => {
    const m = new Map();
    for (const c of filtradas) {
      if (!m.has(c.contratacao_id)) m.set(c.contratacao_id, []);
      m.get(c.contratacao_id).push(c);
    }
    return [...m.entries()].map(([id, itens]) => ({ id, itens: itens.sort((a, b) => a.numero - b.numero), escola: escolas[itens[0].school_id], contrato: contratos[id] }));
  }, [filtradas, escolas, contratos]);

  const resumo = useMemo(() => {
    const abertas = cobrancas.filter(c => c.status === 'pendente' || c.status === 'vencida');
    const atraso = abertas.filter(emAtraso);
    return {
      aberto: abertas.reduce((s, c) => s + Number(c.valor), 0),
      atraso: atraso.reduce((s, c) => s + Number(c.valor), 0),
      qtdAtraso: atraso.length,
    };
  }, [cobrancas]);

  const rodar = async (rpc, params, ok) => {
    setAcao(a => ({ ...a, salvando: true }));
    const { error } = await supabase.rpc(rpc, params);
    if (error) { setAcao(a => ({ ...a, salvando: false })); return toast.error(error.message || 'Não foi possível concluir a ação.'); }
    toast.success(ok);
    setAcao(null);
    carregar();
  };

  // Ações que também mexem no Asaas passam pela Edge Function (chave do Zela só no servidor).
  const chamarFuncao = async (body, ok) => {
    setAcao(a => ({ ...a, salvando: true }));
    const { data, error } = await supabase.functions.invoke('create-zela-charge', { body });
    let msg = data?.error || error?.message;
    if (error?.context?.json) { try { msg = (await error.context.json())?.error || msg; } catch { /* mantém msg */ } }
    if (error || data?.error) { setAcao(a => (a ? { ...a, salvando: false } : a)); return toast.error(msg || 'Não foi possível concluir a ação.'); }
    if (data?.falhas?.length) toast.error(`${data.falhas.length} cobrança(s) falharam: ${data.falhas[0].erro}`);
    else if (data?.aviso) toast.error(data.aviso);
    else toast.success(ok);
    setAcao(null);
    carregar();
  };

  const copiar = async (c) => {
    const r = gerarMensagemCobranca({ escola: escolas[c.school_id], cobranca: c, aVista: c.tipo === 'parcela' && contratos[c.contratacao_id]?.condicao_chave === 'anual_vista' });
    if (!r.ok) return toast.error(r.erro);
    try { await navigator.clipboard.writeText(r.mensagem); toast.success('Mensagem copiada.'); } catch { toast.error('Não foi possível copiar.'); }
  };

  const confirmar = () => {
    const { tipo, alvo, valor, salvando } = acao;
    if (salvando) return;
    if (tipo === 'paga') return chamarFuncao({ action: 'marcar_paga', cobranca_id: alvo.id, comprovante: valor?.trim() || null }, 'Cobrança marcada como paga.');
    if (tipo === 'vencimento') return chamarFuncao({ action: 'novo_vencimento', cobranca_id: alvo.id, vencimento: valor }, 'Novo vencimento salvo.');
    if (tipo === 'cancelar') return chamarFuncao({ action: 'cancelar', cobranca_id: alvo.id }, 'Cobrança cancelada.');
    if (tipo === 'gerar') return chamarFuncao({ action: 'criar', contratacao_id: alvo.id }, 'Links de pagamento gerados.');
    if (tipo === 'cancelar_contrato') return chamarFuncao({ action: 'cancelar_contratacao', contratacao_id: alvo.id }, 'Contratação cancelada.');
    if (tipo === 'suspender') return rodar('zela_contratacao_suspender', { p_contratacao_id: alvo.id }, 'Escola suspensa.');
    if (tipo === 'reativar') return rodar('zela_contratacao_reativar', { p_contratacao_id: alvo.id }, 'Escola reativada.');
  };

  const listaEscolas = Object.values(escolas).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="h-full overflow-y-auto text-dev-text">
      <div className="p-4 md:p-6 space-y-4">
      {erro && <p className="text-sm text-error">Não foi possível carregar: {erro}</p>}
      {aba === 'cobrancas' ? (
      <>
      <DeveloperFaturamentoReajustes onMudou={carregar} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={card}><p className={rotulo}>Em aberto</p><p className="text-lg font-bold">{brl(resumo.aberto)}</p></div>
        <div className={card}><p className={rotulo}>Em atraso</p><p className="text-lg font-bold">{brl(resumo.atraso)}</p></div>
        <div className={card}><p className={rotulo}>Parcelas em atraso</p><p className="text-lg font-bold">{resumo.qtdAtraso}</p></div>
      </div>

      <div className={`${card} grid grid-cols-1 sm:grid-cols-4 gap-3`}>
        <div>
          <label className={rotulo} htmlFor="fat-status">Situação</label>
          <select id="fat-status" className={campo} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="abertas">Em aberto</option>
            <option value="atraso">Em atraso</option>
            <option value="paga">Pagas</option>
            <option value="cancelada">Canceladas</option>
            <option value="estornada">Estornadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="fat-escola">Escola</label>
          <select id="fat-escola" className={campo} value={fEscola} onChange={e => setFEscola(e.target.value)}>
            <option value="">Todas</option>
            {listaEscolas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div><label className={rotulo} htmlFor="fat-de">Vencimento de</label><input id="fat-de" type="date" className={campo} value={fDe} onChange={e => setFDe(e.target.value)} /></div>
        <div><label className={rotulo} htmlFor="fat-ate">Vencimento até</label><input id="fat-ate" type="date" className={campo} value={fAte} onChange={e => setFAte(e.target.value)} /></div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-dev-primary" /></div>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-dev-text-muted">Nenhuma cobrança para este filtro.</p>
      ) : grupos.map(g => (
        <div key={g.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <p className="font-bold">{g.escola?.name || 'Escola'} <span className="text-xs font-normal text-dev-text-muted">{g.escola?.school_code}</span></p>
              <p className="text-xs text-dev-text-muted">Contratação: {STATUS_CONTRATO[g.contrato?.status] || g.contrato?.status || '—'}</p>
            </div>
            <div className="flex gap-2">
              {g.itens.some(c => c.status === 'pendente' && !c.invoice_url) && <button type="button" className={btnPrimario} onClick={() => setAcao({ tipo: 'gerar', alvo: { id: g.id }, escola: g.escola?.name })}><Receipt size={14} /> Gerar links</button>}
              {g.contrato?.status === 'ativa' && <button type="button" className={btnNeutro} onClick={() => setAcao({ tipo: 'suspender', alvo: { id: g.id }, escola: g.escola?.name })}><PauseCircle size={14} /> Suspender</button>}
              {g.contrato?.status === 'suspensa' && <button type="button" className={btnPrimario} onClick={() => setAcao({ tipo: 'reativar', alvo: { id: g.id }, escola: g.escola?.name })}><PlayCircle size={14} /> Reativar</button>}
              {g.contrato?.status === 'aguardando_pagamento' && <button type="button" className={btnNeutro} onClick={() => setAcao({ tipo: 'cancelar_contrato', alvo: { id: g.id }, escola: g.escola?.name })}><Ban size={14} /> Cancelar contratação</button>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] text-dev-text-muted"><th className="py-1.5 pr-3">Parcela</th><th className="py-1.5 pr-3">Vencimento</th><th className="py-1.5 pr-3">Valor</th><th className="py-1.5 pr-3">Situação</th><th /></tr></thead>
              <tbody>
                {g.itens.map(c => {
                  const aberta = c.status === 'pendente' || c.status === 'vencida';
                  return (
                    <tr key={c.id} className="border-t border-dev-border">
                      <td className="py-1.5 pr-3">{c.tipo === 'implantacao' ? 'Implantação' : `${c.numero}ª`}</td>
                      <td className="py-1.5 pr-3">{formatarData(c.vencimento)}</td>
                      <td className="py-1.5 pr-3 font-medium">{brl(c.valor)}</td>
                      <td className="py-1.5 pr-3">{statusVisual(c)}{c.status === 'paga' && c.paga_manual ? ' (baixa manual)' : ''}</td>
                      <td className="py-1.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button type="button" className={btnNeutro} onClick={() => copiar(c)} disabled={!c.invoice_url} title={c.invoice_url ? 'Copiar mensagem' : 'Sem link de pagamento ainda'}><Copy size={13} /> Mensagem</button>
                          {aberta && <button type="button" className={btnNeutro} onClick={() => setAcao({ tipo: 'vencimento', alvo: c, valor: c.vencimento < hojeIso() ? hojeIso() : c.vencimento })}><CalendarClock size={13} /> Vencimento</button>}
                          {aberta && <button type="button" className={btnPrimario} onClick={() => setAcao({ tipo: 'paga', alvo: c, valor: '' })}><CheckCircle2 size={13} /> Paga</button>}
                          {aberta && <button type="button" className={btnNeutro} onClick={() => setAcao({ tipo: 'cancelar', alvo: c })}><Ban size={13} /> Cancelar</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {acao && createPortal(
        <div className="fixed inset-0 z-[100] bg-ink/70 backdrop-blur-sm">
          <div className="bg-dev-surface w-full h-full overflow-y-auto p-5 space-y-3 text-dev-text">
            <div className="flex justify-between items-start">
              <h3 className="font-bold">{TITULOS[acao.tipo]}</h3>
              <button type="button" onClick={() => setAcao(null)} aria-label="Fechar" className="text-dev-text-muted hover:text-dev-text"><X size={18} /></button>
            </div>
            <p className="text-sm text-dev-text-muted">{TEXTOS[acao.tipo]}</p>
            {acao.tipo === 'vencimento' && <div><label className={rotulo} htmlFor="fat-novo-venc">Novo vencimento</label><input id="fat-novo-venc" type="date" min={hojeIso()} className={campo} value={acao.valor} onChange={e => setAcao(a => ({ ...a, valor: e.target.value }))} /></div>}
            {acao.tipo === 'paga' && <div><label className={rotulo} htmlFor="fat-comp">Comprovante ou observação (opcional)</label><input id="fat-comp" maxLength={500} className={campo} value={acao.valor} onChange={e => setAcao(a => ({ ...a, valor: e.target.value }))} /></div>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnNeutro} onClick={() => setAcao(null)} disabled={acao.salvando}>Voltar</button>
              <button type="button" className={btnPrimario} onClick={confirmar} disabled={acao.salvando || (acao.tipo === 'vencimento' && !acao.valor)}>{acao.salvando ? <Loader2 size={13} className="animate-spin" /> : null} Confirmar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </>
      ) : <DeveloperConfigFaturamento embutido secao={aba} />}
      </div>
    </div>
  );
}

const TITULOS = {
  gerar: 'Gerar links de pagamento', paga: 'Marcar como paga', vencimento: 'Novo vencimento', cancelar: 'Cancelar cobrança',
  cancelar_contrato: 'Cancelar contratação', suspender: 'Suspender escola', reativar: 'Reativar escola',
};
const TEXTOS = {
  gerar: 'Cria no Asaas do Zela as cobranças ainda sem link (boleto com Pix). Se algumas falharem, é seguro tentar de novo: as que já têm link não duplicam.',
  paga: 'Baixa manual. Se for a 1ª parcela de uma contratação aguardando pagamento, ela passa a ativa e os módulos do plano são liberados.',
  vencimento: 'Atualiza o vencimento no Zela e no link do Asaas.',
  cancelar: 'Cancela o link no Asaas e a cobrança deixa de contar como a receber. Não dá para desfazer.',
  cancelar_contrato: 'Cancela a contratação e as parcelas em aberto. A contratação anterior da escola continua valendo.',
  suspender: 'A escola perde o acesso ao sistema até ser reativada. Use só por inadimplência.',
  reativar: 'A escola volta a ter acesso e a contratação volta a ficar ativa.',
};
