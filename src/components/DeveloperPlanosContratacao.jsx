import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Check, AlertTriangle, FileSignature } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { usePlanosZela } from '../hooks/usePlanosZela';
import { ITENS, ITEM_POR_ID, estadoDoItem } from '../lib/modulosCatalogo';
import {
  CICLOS, brl, mensalidade, valorDoCiclo, implantacaoBase, implantacaoFinal, modalidadesPermitidas, passouDoLimite,
  diasParaVencer, formatarData, arredondar,
} from '../lib/planosZela';

// Simulador, Contratações e o modal Contratar (também aberto pela Gestão de
// Escolas). A RPC contratar_plano_escola recalcula tudo no servidor; o que
// aparece aqui é só prévia.

const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const rotulo = 'block text-[11px] font-bold uppercase tracking-wide text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-zela-md text-sm font-medium transition-all disabled:opacity-50';
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;
const btnNeutro = `${btn} border border-dev-border text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high`;

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
        {!permitidas.includes('por_aluno') && <p className="text-sm text-amber-300 mt-3">Acima de {dados.config.limite_alunos_por_aluno} alunos só vale o pacote.</p>}
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
            <tr className="text-left text-[11px] uppercase tracking-wide text-dev-text-muted bg-dev-surface">
              <th className="p-3">Escola</th><th className="p-3">Plano</th><th className="p-3">Ciclo</th><th className="p-3">Alunos</th><th className="p-3">Mensal</th><th className="p-3">Vencimento</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ escola, ct, ativos }) => {
              const plano = ct ? planoPor[ct.plano_id] : null;
              const alerta = ct && passouDoLimite({ modalidade: plano?.modalidade }, ativos, dados.config.limite_alunos_por_aluno);
              const dias = ct ? diasParaVencer(ct.fim) : null;
              return (
                <tr key={escola.id} className="border-t border-dev-border">
                  <td className="p-3 font-medium">{escola.name}</td>
                  <td className="p-3">{plano?.nome || <span className="text-dev-text-muted">Sem contratação</span>}</td>
                  <td className="p-3">{ct ? CICLOS.find(c => c.id === ct.ciclo)?.label : ''}</td>
                  <td className="p-3">
                    {ct ? ct.alunos_contratados : ''}{' '}
                    <span className="text-dev-text-muted text-xs">({ativos} ativos)</span>
                    {alerta && <span className="ml-2 inline-flex items-center gap-1 text-amber-300 text-xs"><AlertTriangle size={12} /> passou do limite, migre para pacote</span>}
                  </td>
                  <td className="p-3">{ct ? brl(ct.valor_mensal) : ''}</td>
                  <td className={`p-3 ${dias !== null && dias < 0 ? 'text-error' : dias !== null && dias <= 30 ? 'text-amber-300' : ''}`}>{ct ? `${formatarData(ct.fim)}${dias !== null && dias < 0 ? ' · vencida' : dias !== null && dias <= 30 ? ` · ${dias} dia(s)` : ''}` : ''}</td>
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
  const [ciclo, setCiclo] = useState('');
  const [escolhidos, setEscolhidos] = useState([]);
  const [descTipo, setDescTipo] = useState('percent');
  const [desc, setDesc] = useState('');
  const [motivo, setMotivo] = useState('');
  const [inicio, setInicio] = useState(new Date().toISOString().slice(0, 10));
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
  const cicloSel = ciclos.find(c => c.ciclo === ciclo) || null;
  const vendaveis = dados.precos.filter(p => p.item_id !== 'base' && p.ativo && ITEM_POR_ID[p.item_id]);

  const itens = plano ? itensDoPlano(plano, escolhidos) : [];
  const mensal = plano ? mensalidade(plano, n, dados.precos, escolhidos) : 0;
  const valorCiclo = plano && cicloSel ? valorDoCiclo(mensal, cicloSel) : 0;
  const base = plano && cicloSel ? implantacaoBase(plano, cicloSel) : 0;
  const impl = implantacaoFinal(base, descTipo, desc, dados.config.desconto_implantacao_max_percent);
  const motivoFalta = Number(desc) > 0 && motivo.trim().length < 3;
  const pronto = !!plano && !!cicloSel && n >= 1 && !impl.erro && !motivoFalta && features;

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
    const { error } = await supabase.rpc('contratar_plano_escola', {
      p_school_id: schoolId, p_plano_id: plano.id, p_ciclo: cicloSel.ciclo, p_alunos: n,
      p_itens: plano.modalidade === 'por_aluno' ? escolhidos : null,
      p_desconto_tipo: Number(desc) > 0 ? descTipo : null,
      p_desconto: Number(desc) > 0 ? Number(desc) : 0,
      p_motivo: Number(desc) > 0 ? motivo.trim() : null,
      p_inicio: inicio || null,
    });
    setSalvando(false);
    if (error) { setConfirmando(false); return toast.error(error.message || 'Não foi possível contratar o plano.'); }
    toast.success('Plano contratado e módulos atualizados.');
    onDone();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-6 bg-slate-900/70 backdrop-blur-sm">
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
        {confirmando ? (
          <div className="space-y-3">
            <p className="text-sm">Confirme a contratação de <b>{plano.nome}</b> ({cicloSel.ciclo.toLowerCase()}) para {escola?.name}.</p>
            <div className={card}>
              <p className="text-sm">Vai ligar: <b>{mudancas.ligar.join(', ') || 'nada'}</b></p>
              <p className="text-sm mt-1">Vai desligar: <b>{mudancas.desligar.join(', ') || 'nada'}</b></p>
              <p className="text-xs text-dev-text-muted mt-2">A contratação anterior desta escola é encerrada. O histórico de módulos registra a mudança.</p>
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
                <select id="ct-mod" className={campo} value={modalidadeOk} onChange={e => { setModalidade(e.target.value); setPlanoId(''); setCiclo(''); }}>
                  <option value="pacote">Pacote</option>
                  {permitidas.includes('por_aluno') && <option value="por_aluno">Por aluno</option>}
                </select>
              </div>
              <div>
                <label className={rotulo} htmlFor="ct-plano">Plano</label>
                <select id="ct-plano" className={campo} value={planoId} onChange={e => { setPlanoId(e.target.value); setCiclo(''); }}>
                  <option value="">Escolha</option>
                  {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={rotulo} htmlFor="ct-ciclo">Ciclo</label>
                <select id="ct-ciclo" className={campo} value={ciclo} onChange={e => setCiclo(e.target.value)} disabled={!plano}>
                  <option value="">Escolha</option>
                  {ciclos.map(c => <option key={c.id} value={c.ciclo}>{CICLOS.find(x => x.id === c.ciclo)?.label}{c.desconto_percent > 0 ? ` (${c.desconto_percent}% off)` : ''}</option>)}
                </select>
              </div>
            </div>
            {!permitidas.includes('por_aluno') && <p className="text-xs text-amber-300">Acima de {dados.config.limite_alunos_por_aluno} alunos só vale o pacote.</p>}

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

            {plano && cicloSel && (
              <div className={card}>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between"><dt className="text-dev-text-muted">Mensalidade</dt><dd className="font-medium">{brl(mensal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-dev-text-muted">Valor do ciclo</dt><dd className="font-medium">{brl(valorCiclo)}</dd></div>
                  <div className="flex justify-between"><dt className="text-dev-text-muted">Implantação</dt><dd>{brl(base)}</dd></div>
                  <div className="flex justify-between"><dt className="text-dev-text-muted">Implantação com desconto</dt><dd className="font-medium">{brl(impl.final)}</dd></div>
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

// Versão autônoma para a Gestão de Escolas: carrega os dados só quando abre.
export function ContratarPlanoDaEscola({ schoolId, onClose }) {
  const dados = usePlanosZela();
  if (dados.loading) {
    return createPortal(<div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>, document.body);
  }
  return <ContratarPlanoModal dados={dados} schoolId={schoolId} onClose={onClose} onDone={onClose} />;
}
