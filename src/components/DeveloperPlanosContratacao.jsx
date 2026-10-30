import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Check, AlertTriangle, FileSignature, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { usePlanosZela } from '../hooks/usePlanosZela';
import { ITENS, ITEM_POR_ID, estadoDoItem } from '../lib/modulosCatalogo';
import {
  CICLOS, brl, mensalidade, valorDoCiclo, implantacaoBase, implantacaoFinal, modalidadesPermitidas, passouDoLimite,
  diasParaVencer, formatarData, arredondar, extrasDoPacote, faixaDoPlano, passouDaFaixa, previaCobrancas,
} from '../lib/planosZela';
import { gerarMensagemCobranca } from '../lib/mensagemCobrancaZela';

// Simulador, Contratações e o modal Contratar (também aberto pela Gestão de
// Escolas). A RPC contratar_plano_com_condicao recalcula tudo no servidor; o que
// aparece aqui é só prévia.

const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const rotulo = 'block text-[11px] font-bold text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-zela-md text-sm font-medium transition-all disabled:opacity-50';
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;
const btnNeutro = `${btn} border border-dev-border text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high`;

const somarDias = (iso, dias) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const rotuloCondicao = (c) => {
  const d = Number(c.desconto_percent) > 0 ? ` (${Number(c.desconto_percent)}% off)` : '';
  if (c.pagamento === 'mes_a_mes') return 'Mensal';
  if (c.pagamento === 'a_vista') return `Anual à vista${d}`;
  return `Anual em ${c.parcelas}x${d}`;
};
const ciclosDoPlano = (dados, planoId) => dados.ciclos.filter(c => c.plano_id === planoId && c.ativo);
const itensDoPlano = (plano, escolhidos) => (plano.modalidade === 'pacote' ? plano.itens : escolhidos);
const custoPorAluno = (itens, precos) => arredondar(['base', ...itens].reduce((s, id) => s + Number(precos.find(p => p.item_id === id)?.custo_estimado || 0), 0));

// ═══ Simulador ═══
export function DeveloperPlanosSimulador({ dados }) {
  const [alunos, setAlunos] = useState(80);
  const [escolhidos, setEscolhidos] = useState([]);
  const n = Math.max(Number(alunos) || 0, 0);
  const planos = dados.planos.filter(p => p.ativo);
  const permitidas = modalidadesPermitidas(n, dados.config.limite_alunos_por_aluno);
  const vendaveis = dados.precos.filter(p => p.item_id !== 'base' && p.ativo && ITEM_POR_ID[p.item_id]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="max-w-xs"><label className={rotulo} htmlFor="sim-alunos">Quantidade de alunos</label><input id="sim-alunos" type="number" min="1" className={campo} value={alunos} onChange={e => setAlunos(e.target.value)} /></div>
        {!permitidas.includes('por_aluno') && <p className="text-sm text-warning mt-3">Acima de {dados.config.limite_alunos_por_aluno} alunos só vale o pacote.</p>}
        {permitidas.includes('por_aluno') && planos.some(p => p.modalidade === 'por_aluno') && (
          <div className="mt-3">
            <p className={rotulo}>Módulos do plano por aluno</p>
            <div className="flex flex-wrap gap-2">
              {vendaveis.map(p => (
                <label key={p.item_id} className="flex items-center gap-2 text-sm bg-dev-bg border border-dev-border rounded-zela-md px-3 py-1.5">
                  <input type="checkbox" checked={escolhidos.includes(p.item_id)} onChange={() => setEscolhidos(e => e.includes(p.item_id) ? e.filter(i => i !== p.item_id) : [...e, p.item_id])} />
                  {ITEM_POR_ID[p.item_id].nome}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {planos.filter(p => permitidas.includes(p.modalidade)).map(p => {
          const itens = itensDoPlano(p, escolhidos);
          const mensal = mensalidade(p, n, dados.precos, escolhidos);
          const custo = arredondar(custoPorAluno(itens, dados.precos) * n);
          const margem = arredondar(mensal - custo);
          return (
            <div key={p.id} className={card}>
              <p className="font-bold">{p.nome}</p>
              <p className="text-2xl font-black mt-1">{brl(mensal)}<span className="text-xs font-medium text-dev-text-muted"> por mês</span></p>
              {p.faixas && <p className="text-xs text-dev-text-muted">{faixaDoPlano(p, n) ? `Faixa até ${faixaDoPlano(p, n)} alunos` : 'Acima da maior faixa do plano'}</p>}
              <p className="text-xs text-dev-text-muted">Custo estimado {brl(custo)} · margem {brl(margem)} ({mensal > 0 ? Math.round((margem / mensal) * 100) : 0}%)</p>
              <table className="w-full text-sm mt-3">
                <tbody>
                  {ciclosDoPlano(dados, p.id).map(c => (
                    <tr key={c.id} className="border-t border-dev-border">
                      <td className="py-1.5">{CICLOS.find(x => x.id === c.ciclo)?.label}{c.desconto_percent > 0 ? ` (${c.desconto_percent}% off)` : ''}</td>
                      <td className="py-1.5 text-right font-medium">{brl(valorDoCiclo(mensal, c))}</td>
                      <td className="py-1.5 text-right text-dev-text-muted text-xs">implantação {brl(implantacaoBase(p, c))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ Contratações ═══
export function DeveloperPlanosContratacoes({ dados }) {
  const [contratando, setContratando] = useState(null);
  const planoPor = useMemo(() => Object.fromEntries(dados.planos.map(p => [p.id, p])), [dados.planos]);
  const ctPor = useMemo(() => Object.fromEntries(dados.contratacoes.map(c => [c.school_id, c])), [dados.contratacoes]);
  const linhas = dados.escolas.filter(e => e.is_active !== false).map(e => ({ escola: e, ct: ctPor[e.id], ativos: dados.alunosAtivos[e.id] || 0 }));
  const semPlano = linhas.filter(l => !l.ct).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-dev-text-muted">{semPlano > 0 ? `${semPlano} escola(s) sem contratação registrada. ` : ''}Contratar um plano liga os módulos dele e guarda os valores daquele momento. Mudar o plano depois não altera contratos vigentes.</p>
      <div className="overflow-x-auto border border-dev-border rounded-zela-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-dev-text-muted bg-dev-surface">
              <th className="p-3">Escola</th><th className="p-3">Plano</th><th className="p-3">Ciclo</th><th className="p-3">Alunos</th><th className="p-3">Mensal</th><th className="p-3">Vencimento</th><th className="p-3">Cobranças</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ escola, ct, ativos }) => {
              const plano = ct ? planoPor[ct.plano_id] : null;
              const alerta = ct && passouDoLimite({ modalidade: plano?.modalidade }, ativos, dados.config.limite_alunos_por_aluno);
              const alertaFaixa = ct && passouDaFaixa(ct, plano, ativos);
              const dias = ct ? diasParaVencer(ct.fim) : null;
              return (
                <tr key={escola.id} className="border-t border-dev-border">
                  <td className="p-3 font-medium">{escola.name}</td>
                  <td className="p-3">{plano?.nome || <span className="text-dev-text-muted">Sem contratação</span>}</td>
                  <td className="p-3">{ct ? CICLOS.find(c => c.id === ct.ciclo)?.label : ''}</td>
                  <td className="p-3">
                    {ct ? (plano?.faixas ? `Até ${ct.alunos_contratados}` : ct.alunos_contratados) : ''}{' '}
                    <span className="text-dev-text-muted text-xs">({ativos} ativos)</span>
                    {alertaFaixa && <span className="ml-2 inline-flex items-center gap-1 text-warning text-xs"><AlertTriangle size={12} /> passou da faixa, troque para uma faixa maior</span>}
                    {alerta && <span className="ml-2 inline-flex items-center gap-1 text-warning text-xs"><AlertTriangle size={12} /> passou do limite, migre para pacote</span>}
                  </td>
                  <td className="p-3">
                    {ct ? brl(ct.valor_mensal) : ''}
                    {ct && Number(ct.mensal_desconto) > 0 && <span className="block text-xs text-dev-text-muted">desconto {brl(ct.mensal_desconto)} por mês, {ct.mensal_desconto_recorrente ? 'recorrente' : `por ${ct.mensal_desconto_meses} mês(es)`}</span>}
                  </td>
                  <td className={`p-3 ${dias !== null && dias < 0 ? 'text-error' : dias !== null && dias <= 30 ? 'text-warning' : ''}`}>{ct ? `${formatarData(ct.fim)}${dias !== null && dias < 0 ? ' · vencida' : dias !== null && dias <= 30 ? ` · ${dias} dia(s)` : ''}` : ''}</td>
                  <td className="p-3 text-xs">
                    {dados.faturamento?.[escola.id]
                      ? <span className={dados.faturamento[escola.id].atraso > 0 ? 'text-warning' : 'text-dev-text-muted'}>{dados.faturamento[escola.id].abertas} em aberto ({brl(dados.faturamento[escola.id].valor)}){dados.faturamento[escola.id].atraso > 0 ? `, ${dados.faturamento[escola.id].atraso} em atraso` : ''}</span>
                      : <span className="text-dev-text-muted">Em dia</span>}
                  </td>
                  <td className="p-3 text-right"><button type="button" className={btnNeutro} onClick={() => setContratando(escola.id)}><FileSignature size={14} /> {ct ? 'Trocar plano' : 'Contratar'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {contratando && <ContratarPlanoModal dados={dados} schoolId={contratando} onClose={() => setContratando(null)} onDone={() => { setContratando(null); dados.recarregar(); }} />}
    </div>
  );
}

// ═══ Contratar ═══
export function ContratarPlanoModal({ dados, schoolId, onClose, onDone }) {
  const escola = dados.escolas.find(e => e.id === schoolId);
  const ativos = dados.alunosAtivos[schoolId] || 0;
  const [features, setFeatures] = useState(null);
  const [alunos, setAlunos] = useState(Math.max(ativos, 1));
  const [modalidade, setModalidade] = useState('pacote');
  const [planoId, setPlanoId] = useState('');
  const [condicaoChave, setCondicaoChave] = useState('');
  const [escolhidos, setEscolhidos] = useState([]);
  const [extras, setExtras] = useState([]);
  const [descTipo, setDescTipo] = useState('percent');
  const [desc, setDesc] = useState('');
  const [motivo, setMotivo] = useState('');
  const hoje = new Date().toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(hoje);
  const [venc, setVenc] = useState(somarDias(hoje, 3));
  const [criada, setCriada] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.from('schools').select('features_enabled').eq('id', schoolId).maybeSingle().then(({ data }) => { if (vivo) setFeatures(data?.features_enabled || {}); });
    return () => { vivo = false; };
  }, [schoolId]);

  const n = Math.max(Number(alunos) || 0, 0);
  const permitidas = modalidadesPermitidas(Math.max(n, ativos), dados.config.limite_alunos_por_aluno);
  const modalidadeOk = permitidas.includes(modalidade) ? modalidade : 'pacote';
  const planos = dados.planos.filter(p => p.ativo && p.modalidade === modalidadeOk);
  const plano = planos.find(p => p.id === planoId) || null;
  const ciclos = plano ? ciclosDoPlano(dados, plano.id) : [];
  // Condição de pagamento = período + forma de pagar; só vale se o plano tem o período ativo.
  const condicoes = dados.condicoes.filter(c => ciclos.some(x => x.ciclo === c.ciclo));
  const condicao = condicoes.find(c => c.chave === condicaoChave) || null;
  const cicloSel = condicao ? ciclos.find(c => c.ciclo === condicao.ciclo) : null;
  const vendaveis = dados.precos.filter(p => p.item_id !== 'base' && p.ativo && ITEM_POR_ID[p.item_id]);

  const extrasOk = plano?.modalidade === 'pacote' ? extrasDoPacote(plano, extras, dados.precos) : [];
  const itens = plano ? [...itensDoPlano(plano, escolhidos), ...extrasOk] : [];
  // Plano com faixas: a escola paga a menor faixa que comporta os alunos contratados e os ativos.
  const porFaixa = !!plano?.faixas;
  const faixa = porFaixa ? faixaDoPlano(plano, Math.max(n, ativos)) : null;
  const mensal = plano ? mensalidade(plano, porFaixa ? Math.max(n, ativos) : n, dados.precos, escolhidos, extrasOk) : 0;
  const base = plano && cicloSel ? implantacaoBase(plano, cicloSel) : 0;
  const impl = implantacaoFinal(base, descTipo, desc, dados.config.desconto_implantacao_max_percent);
  const motivoFalta = Number(desc) > 0 && motivo.trim().length < 3;
  const vencOk = !!venc && venc >= hoje;
  const semCadastro = !escola?.cnpj || !escola?.email;
  const previa = plano && cicloSel && condicao && vencOk && !impl.erro
    ? previaCobrancas({ mensal, condicao, meses: cicloSel.meses ?? 1, implantacao: impl.final, inicio: inicio || hoje, primeiroVencimento: venc })
    : null;
  const pronto = !!previa && n >= 1 && (!porFaixa || !!faixa) && !motivoFalta && !semCadastro && features;

  // O que muda nos módulos da escola: itens vendáveis ligados hoje x depois.
  const mudancas = useMemo(() => {
    if (!features) return { ligar: [], desligar: [] };
    const depois = new Set(itens);
    const venda = ITENS.filter(i => (i.grupo === 'modulo' || i.grupo === 'adicional') && i.keys.length);
    return {
      ligar: venda.filter(i => depois.has(i.id) && estadoDoItem(features, i) !== 'on').map(i => i.nome),
      desligar: venda.filter(i => !depois.has(i.id) && estadoDoItem(features, i) !== 'off').map(i => i.nome),
    };
  }, [features, itens]);

  const contratar = async () => {
    setSalvando(true);
    const { data: id, error } = await supabase.rpc('contratar_plano_com_condicao', {
      p_school_id: schoolId, p_plano_id: plano.id, p_condicao: condicao.chave, p_alunos: porFaixa ? faixa : n,
      p_itens: plano.modalidade === 'por_aluno' ? escolhidos : null,
      p_extras: extrasOk.length ? extrasOk : null,
      p_desconto_tipo: Number(desc) > 0 ? descTipo : null,
      p_desconto: Number(desc) > 0 ? Number(desc) : 0,
      p_motivo: Number(desc) > 0 ? motivo.trim() : null,
      p_inicio: inicio || null,
      p_primeiro_vencimento: venc,
    });
    if (error) { setSalvando(false); setConfirmando(false); return toast.error(error.message || 'Não foi possível contratar o plano.'); }
    const { data: cobs } = await supabase.from('zela_cobrancas')
      .select('id, tipo, numero, vencimento, valor, invoice_url').eq('contratacao_id', id).order('numero').limit(20);
    setSalvando(false);
    toast.success('Contratação registrada. Ela fica aguardando o pagamento da 1ª parcela.');
    setCriada({ id, cobrancas: cobs || [] });
  };

  const copiarMensagem = async () => {
    const r = gerarMensagemCobranca({ escola, cobranca: criada?.cobrancas?.[0], aVista: condicao?.pagamento === 'a_vista' });
    if (!r.ok) return toast.error(r.erro);
    try { await navigator.clipboard.writeText(r.mensagem); toast.success('Mensagem copiada.'); } catch { toast.error('Não foi possível copiar.'); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-6 bg-ink/70 backdrop-blur-sm">
      <div className="bg-dev-surface sm:rounded-zela-xl border border-dev-border shadow-2xl w-full h-full sm:w-full sm:h-auto sm:max-w-4xl overflow-hidden sm:max-h-[calc(100vh-3rem)] flex flex-col text-dev-text">
        <div className="px-4 sm:px-6 py-4 border-b border-dev-border flex justify-between items-center bg-dev-bg shrink-0">
          <div>
            <h3 className="font-bold text-dev-text text-lg flex items-center gap-2">
              <FileSignature size={20} className="text-dev-primary" />
              Contratar plano
            </h3>
            <p className="text-xs text-dev-text-muted mt-0.5">{escola?.name} · {ativos} aluno(s) ativo(s)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-dev-text-muted hover:text-dev-text p-2"><X size={20} /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto scrollbar-none">
        {criada ? (
          <div className="space-y-3">
            <p className="text-sm">Contratação registrada para <b>{escola?.name}</b>, aguardando o pagamento da 1ª parcela.</p>
            <div className={card}><TabelaParcelas parcelas={criada.cobrancas.map(c => ({ numero: c.numero, vencimento: c.vencimento, valor: Number(c.valor) }))} mensal={condicao?.pagamento === 'mes_a_mes'} /></div>
            {!criada.cobrancas[0]?.invoice_url && <p className="text-xs text-dev-text-muted">O link de pagamento ainda não foi gerado. A geração pelo Asaas entra na próxima etapa; até lá a mensagem não pode ser copiada.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnNeutro} onClick={copiarMensagem} disabled={!criada.cobrancas[0]?.invoice_url}><Copy size={14} /> Copiar mensagem</button>
              <button type="button" className={btnPrimario} onClick={onDone}><Check size={14} /> Concluir</button>
            </div>
          </div>
        ) : confirmando ? (
          <div className="space-y-3">
            <p className="text-sm">Confirme a contratação de <b>{plano.nome}</b> ({rotuloCondicao(condicao)}) para {escola?.name}.</p>
            <div className={card}>
              <p className="text-sm">Vai ligar: <b>{mudancas.ligar.join(', ') || 'nada'}</b></p>
              <p className="text-sm mt-1">Vai desligar: <b>{mudancas.desligar.join(', ') || 'nada'}</b></p>
              <p className="text-sm mt-1">Total a cobrar: <b>{brl(previa.totalGeral)}</b> em {previa.parcelas.length} parcela(s), a 1ª vence em <b>{formatarData(venc)}</b>.</p>
              <p className="text-xs text-dev-text-muted mt-2">A contratação fica aguardando pagamento. Só quando a 1ª parcela for paga ela vira ativa, os módulos mudam e a contratação anterior é encerrada.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnNeutro} onClick={() => setConfirmando(false)} disabled={salvando}>Voltar</button>
              <button type="button" className={btnPrimario} onClick={contratar} disabled={salvando}>{salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirmar contratação</button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={rotulo} htmlFor="ct-alunos">Alunos contratados</label><input id="ct-alunos" type="number" min="1" className={campo} value={alunos} onChange={e => setAlunos(e.target.value)} /></div>
              <div><label className={rotulo} htmlFor="ct-ini">Início</label><input id="ct-ini" type="date" className={campo} value={inicio} onChange={e => setInicio(e.target.value)} /></div>
              <div>
                <label className={rotulo} htmlFor="ct-mod">Modalidade</label>
                <select id="ct-mod" className={campo} value={modalidadeOk} onChange={e => { setModalidade(e.target.value); setPlanoId(''); setCondicaoChave(''); }}>
                  <option value="pacote">Pacote</option>
                  {permitidas.includes('por_aluno') && <option value="por_aluno">Por aluno</option>}
                </select>
              </div>
              <div>
                <label className={rotulo} htmlFor="ct-plano">Plano</label>
                <select id="ct-plano" className={campo} value={planoId} onChange={e => { setPlanoId(e.target.value); setCondicaoChave(''); }}>
                  <option value="">Escolha</option>
                  {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={rotulo} htmlFor="ct-cond">Condição de pagamento</label>
                <select id="ct-cond" className={campo} value={condicaoChave} onChange={e => setCondicaoChave(e.target.value)} disabled={!plano}>
                  <option value="">Escolha</option>
                  {condicoes.map(c => <option key={c.chave} value={c.chave}>{rotuloCondicao(c)}</option>)}
                </select>
              </div>
              <div><label className={rotulo} htmlFor="ct-venc">Vencimento da 1ª parcela</label><input id="ct-venc" type="date" min={hoje} className={campo} value={venc} onChange={e => setVenc(e.target.value)} /></div>
            </div>
            {semCadastro && <p className="text-xs text-error">A escola precisa de CNPJ e e-mail cadastrados antes de contratar.</p>}
            {!permitidas.includes('por_aluno') && <p className="text-xs text-warning">Acima de {dados.config.limite_alunos_por_aluno} alunos só vale o pacote.</p>}
            {porFaixa && (faixa
              ? <p className="text-xs text-dev-text-muted">Faixa do plano: até {faixa} alunos (a maior entre os contratados e os {ativos} ativos).</p>
              : <p className="text-xs text-warning">Acima da maior faixa deste plano. Escolha outro plano.</p>)}

            {plano?.modalidade === 'por_aluno' && (
              <div>
                <p className={rotulo}>Módulos (o plano base é sempre incluso)</p>
                <div className="flex flex-wrap gap-2">
                  {vendaveis.map(p => (
                    <label key={p.item_id} className="flex items-center gap-2 text-sm bg-dev-surface border border-dev-border rounded-zela-md px-3 py-1.5">
                      <input type="checkbox" checked={escolhidos.includes(p.item_id)} onChange={() => setEscolhidos(e => e.includes(p.item_id) ? e.filter(i => i !== p.item_id) : [...e, p.item_id])} />
                      {ITEM_POR_ID[p.item_id].nome}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {plano?.modalidade === 'pacote' && (
              <div>
                <p className={rotulo}>Módulos e adicionais avulsos (somados à mensalidade do pacote)</p>
                <div className="flex flex-wrap gap-2">
                  {vendaveis.filter(p => (plano.itens || []).includes(p.item_id) || Number(p.valor) > 0).map(p => {
                    const incluso = (plano.itens || []).includes(p.item_id);
                    const requer = ITEM_POR_ID[p.item_id].requer;
                    const semRequisito = !incluso && !!requer && !(plano.itens || []).includes(requer) && !extrasOk.includes(requer);
                    return (
                      <label key={p.item_id} className={`flex items-center gap-2 text-sm bg-dev-surface border border-dev-border rounded-zela-md px-3 py-1.5 ${incluso || semRequisito ? 'opacity-60' : ''}`}>
                        <input type="checkbox" checked={incluso || extrasOk.includes(p.item_id)} disabled={incluso || semRequisito}
                          onChange={() => setExtras(e => e.includes(p.item_id) ? e.filter(i => i !== p.item_id) : [...e, p.item_id])} />
                        {ITEM_POR_ID[p.item_id].nome}
                        <span className="text-xs text-dev-text-muted">
                          {incluso ? 'incluso no plano' : semRequisito ? `requer ${ITEM_POR_ID[requer]?.nome || requer}` : `${brl(p.valor)}${p.tipo_cobranca === 'por_aluno' ? ' por aluno' : ' por mês'}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {plano && cicloSel && condicao && (
              <div className={card}>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between"><dt className="text-dev-text-muted">Mensalidade cheia</dt><dd className="font-medium">{brl(mensal)}</dd></div>
                  {previa && <div className="flex justify-between"><dt className="text-dev-text-muted">Sistema no período{previa.descontoPercent > 0 ? ` (${previa.descontoPercent}% off)` : ''}</dt><dd className="font-medium">{brl(previa.totalSistema)}</dd></div>}
                  <div className="flex justify-between"><dt className="text-dev-text-muted">Implantação</dt><dd>{brl(base)}</dd></div>
                  <div className="flex justify-between"><dt className="text-dev-text-muted">Implantação com desconto</dt><dd className="font-medium">{brl(impl.final)}</dd></div>
                  {previa && <div className="flex justify-between border-t border-dev-border pt-1"><dt className="text-dev-text-muted">Total a cobrar</dt><dd className="font-bold">{brl(previa.totalGeral)}</dd></div>}
                </dl>
                <div className="grid grid-cols-[1fr_1fr] gap-2 mt-3">
                  <div>
                    <label className={rotulo} htmlFor="ct-dt">Desconto na implantação</label>
                    <div className="flex gap-2">
                      <select id="ct-dt" className={`${campo} w-24`} value={descTipo} onChange={e => setDescTipo(e.target.value)}><option value="percent">%</option><option value="valor">R$</option></select>
                      <input type="number" min="0" step="0.01" className={campo} value={desc} onChange={e => setDesc(e.target.value)} aria-label="Valor do desconto" />
                    </div>
                  </div>
                  <div><label className={rotulo} htmlFor="ct-mot">Motivo (obrigatório com desconto)</label><input id="ct-mot" className={campo} value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} /></div>
                </div>
                {impl.erro && <p className="text-xs text-error mt-2">{impl.erro}</p>}
                {motivoFalta && <p className="text-xs text-error mt-2">Informe o motivo do desconto.</p>}
                {!vencOk && <p className="text-xs text-error mt-2">O vencimento da 1ª parcela não pode ser no passado.</p>}
                {previa && <TabelaParcelas parcelas={previa.parcelas} mensal={condicao.pagamento === 'mes_a_mes'} />}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className={btnNeutro} onClick={onClose}>Cancelar</button>
              <button type="button" className={btnPrimario} disabled={!pronto} onClick={() => setConfirmando(true)}>Revisar e contratar</button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function TabelaParcelas({ parcelas, mensal }) {
  return (
    <div className="mt-3">
      <p className={rotulo}>{mensal ? 'Primeira cobrança (as seguintes são geradas todo mês)' : 'Parcelas'}</p>
      <ul className="text-sm divide-y divide-dev-border">
        {parcelas.map(p => (
          <li key={p.numero} className="flex justify-between py-1">
            <span className="text-dev-text-muted">{p.numero}ª, vence em {formatarData(p.vencimento)}</span>
            <span className="font-medium">{brl(p.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Versão autônoma para a Gestão de Escolas: carrega os dados só quando abre.
export function ContratarPlanoDaEscola({ schoolId, onClose }) {
  const dados = usePlanosZela();
  if (dados.loading) {
    return createPortal(<div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>, document.body);
  }
  return <ContratarPlanoModal dados={dados} schoolId={schoolId} onClose={onClose} onDone={onClose} />;
}
