import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Pencil, Copy, Power, X, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { usePlanosZela } from '../hooks/usePlanosZela';
import { ITEM_POR_ID } from '../lib/modulosCatalogo';
import { CICLOS, brl, sugestaoDePacote, passouDoLimite } from '../lib/planosZela';
import { DeveloperPlanosSimulador, DeveloperPlanosContratacoes } from './DeveloperPlanosContratacao';

// Portal do Dev · Planos (PLANO_MENU_PLANOS_DEV.md). Formas de contratação da
// ESCOLA com o Zela (não é a mensalidade da família). O menu escolhe itens do
// catálogo (modulosCatalogo.js); módulo novo continua exigindo código.

const ABAS = [
  { id: 'planos', label: 'Planos' },
  { id: 'precos', label: 'Preços dos módulos' },
  { id: 'simulador', label: 'Simulador' },
  { id: 'contratacoes', label: 'Contratações' },
];
const MODALIDADE = { por_aluno: 'Por aluno', pacote: 'Pacote' };
const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const rotulo = 'block text-[11px] font-bold uppercase tracking-wide text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-zela-md text-sm font-medium transition-all disabled:opacity-50';
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;
const btnNeutro = `${btn} border border-dev-border text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high`;

export default function DeveloperPlanos({ initialTab = 'planos' }) {
  const dados = usePlanosZela();
  const [aba, setAba] = useState(initialTab);

  const nomeItem = (id) => ITEM_POR_ID[id]?.nome || id;
  const alertas = useMemo(() => dados.contratacoes.filter(ct => {
    const plano = dados.planos.find(p => p.id === ct.plano_id);
    return passouDoLimite({ modalidade: plano?.modalidade }, dados.alunosAtivos[ct.school_id] || 0, dados.config.limite_alunos_por_aluno);
  }).length, [dados.contratacoes, dados.planos, dados.alunosAtivos, dados.config]);

  if (dados.loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-dev-text-muted" /></div>;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 text-dev-text">
      {dados.erro && <p className="text-sm text-error">Não foi possível carregar tudo: {dados.erro}</p>}
      {alertas > 0 && (
        <button type="button" onClick={() => setAba('contratacoes')} className="w-full flex items-center gap-2 text-left text-sm px-4 py-3 rounded-zela-lg bg-amber-500/10 border border-amber-500/40 text-amber-300">
          <AlertTriangle size={16} className="shrink-0" />
          {alertas === 1 ? '1 escola por aluno passou do limite de alunos.' : `${alertas} escolas por aluno passaram do limite de alunos.`} Migre para um pacote.
        </button>
      )}
      <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-dev-border">
        {ABAS.map(a => (
          <button key={a.id} type="button" onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${aba === a.id ? 'border-dev-primary text-dev-primary' : 'border-transparent text-dev-text-muted hover:text-dev-text'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'planos' && <AbaPlanos dados={dados} nomeItem={nomeItem} />}
      {aba === 'precos' && <AbaPrecos dados={dados} />}
      {aba === 'simulador' && <DeveloperPlanosSimulador dados={dados} />}
      {aba === 'contratacoes' && <DeveloperPlanosContratacoes dados={dados} />}
    </div>
  );
}

// ═══ Preços dos módulos ═══
function AbaPrecos({ dados }) {
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(null);
  const { config } = dados;
  const [cfg, setCfg] = useState(null);

  const valorDe = (p, k) => rascunho[p.item_id]?.[k] ?? p[k];
  const mudar = (p, k, v) => setRascunho(r => ({ ...r, [p.item_id]: { ...r[p.item_id], [k]: v } }));
  const sujo = (p) => !!rascunho[p.item_id] && Object.keys(rascunho[p.item_id]).some(k => String(rascunho[p.item_id][k]) !== String(p[k]));

  const salvar = async (p) => {
    const valor = Number(valorDe(p, 'valor'));
    const custo = Number(valorDe(p, 'custo_estimado'));
    if (!(valor >= 0) || !(custo >= 0)) return toast.error('Informe valores maiores ou iguais a zero.');
    setSalvando(p.item_id);
    const { error } = await supabase.from('zela_modulo_precos').update({
      valor, custo_estimado: custo, tipo_cobranca: valorDe(p, 'tipo_cobranca'), ativo: valorDe(p, 'ativo'),
    }).eq('item_id', p.item_id);
    setSalvando(null);
    if (error) return toast.error(error.message || 'Não foi possível salvar o preço.');
    toast.success('Preço salvo. Contratações vigentes não mudam.');
    setRascunho(r => { const n = { ...r }; delete n[p.item_id]; return n; });
    dados.recarregar();
  };

  const salvarConfig = async () => {
    const c = cfg;
    const { error } = await supabase.from('zela_config_comercial').update({
      limite_alunos_por_aluno: Number(c.limite_alunos_por_aluno),
      desconto_implantacao_max_percent: Number(c.desconto_implantacao_max_percent),
      implantacao_min: Number(c.implantacao_min),
      implantacao_max: Number(c.implantacao_max),
    }).eq('id', true);
    if (error) return toast.error(error.message || 'Não foi possível salvar a configuração.');
    toast.success('Configuração comercial salva.');
    setCfg(null);
    dados.recarregar();
  };

  const c = cfg || config;
  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm text-dev-text-muted mb-3">Preço por aluno por mês de cada item. O plano base é sempre incluso. Itens com cobrança fixa somam um valor mensal fixo. Desativar tira o item das novas contratações; as vigentes continuam iguais.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-dev-text-muted">
                <th className="py-2 pr-3">Item</th><th className="py-2 pr-3">Cobrança</th><th className="py-2 pr-3">Valor</th><th className="py-2 pr-3">Custo estimado</th><th className="py-2 pr-3">Ativo</th><th />
              </tr>
            </thead>
            <tbody>
              {dados.precos.map(p => {
                const item = ITEM_POR_ID[p.item_id];
                const emBreve = item?.emBreve;
                return (
                  <tr key={p.item_id} className="border-t border-dev-border">
                    <td className="py-2 pr-3 font-medium">{item?.nome || p.item_id}{emBreve && <span className="ml-2 text-[10px] uppercase text-dev-text-muted">Em breve</span>}</td>
                    <td className="py-2 pr-3">
                      <select className={campo} value={valorDe(p, 'tipo_cobranca')} onChange={e => mudar(p, 'tipo_cobranca', e.target.value)} disabled={p.item_id === 'base'} aria-label={`Tipo de cobrança de ${item?.nome}`}>
                        <option value="por_aluno">Por aluno</option>
                        <option value="fixo_mensal">Fixo mensal</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3"><input type="number" min="0" step="0.01" className={`${campo} w-28`} value={valorDe(p, 'valor')} onChange={e => mudar(p, 'valor', e.target.value)} aria-label={`Valor de ${item?.nome}`} /></td>
                    <td className="py-2 pr-3"><input type="number" min="0" step="0.01" className={`${campo} w-28`} value={valorDe(p, 'custo_estimado')} onChange={e => mudar(p, 'custo_estimado', e.target.value)} aria-label={`Custo estimado de ${item?.nome}`} /></td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" checked={valorDe(p, 'ativo')} disabled={p.item_id === 'base'} onChange={e => mudar(p, 'ativo', e.target.checked)} aria-label={`Ativar ${item?.nome}`} />
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" className={btnPrimario} disabled={!sujo(p) || salvando === p.item_id} onClick={() => salvar(p)}>
                        {salvando === p.item_id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={card}>
        <p className="text-sm font-bold mb-3">Regras comerciais</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className={rotulo} htmlFor="cfg-lim">Limite de alunos (por aluno)</label><input id="cfg-lim" type="number" min="1" className={campo} value={c.limite_alunos_por_aluno} onChange={e => setCfg({ ...c, limite_alunos_por_aluno: e.target.value })} /></div>
          <div><label className={rotulo} htmlFor="cfg-desc">Desconto máximo na implantação (%)</label><input id="cfg-desc" type="number" min="0" max="100" className={campo} value={c.desconto_implantacao_max_percent} onChange={e => setCfg({ ...c, desconto_implantacao_max_percent: e.target.value })} /></div>
          <div><label className={rotulo} htmlFor="cfg-min">Implantação mínima (R$)</label><input id="cfg-min" type="number" min="0" className={campo} value={c.implantacao_min} onChange={e => setCfg({ ...c, implantacao_min: e.target.value })} /></div>
          <div><label className={rotulo} htmlFor="cfg-max">Implantação máxima (R$)</label><input id="cfg-max" type="number" min="0" className={campo} value={c.implantacao_max} onChange={e => setCfg({ ...c, implantacao_max: e.target.value })} /></div>
        </div>
        <div className="mt-3 flex justify-end"><button type="button" className={btnPrimario} disabled={!cfg} onClick={salvarConfig}><Check size={14} /> Salvar regras</button></div>
      </div>
    </div>
  );
}

// ═══ Planos ═══
const VAZIO = { nome: '', modalidade: 'pacote', itens: [], preco_por_aluno: '', minimo_mensal: '', implantacao_valor: '', descricao: '', alunos_min: '', alunos_max: '' };

function AbaPlanos({ dados, nomeItem }) {
  const [editando, setEditando] = useState(null); // { plano, ciclos }
  const usos = useMemo(() => {
    const m = {};
    for (const ct of dados.contratacoes) m[ct.plano_id] = (m[ct.plano_id] || 0) + 1;
    return m;
  }, [dados.contratacoes]);

  const abrirNovo = () => setEditando({ plano: { ...VAZIO }, ciclos: CICLOS.map(c => ({ ciclo: c.id, meses: c.meses, desconto_percent: 0, implantacao_valor: '', ativo: c.id === 'MENSAL' })) });
  const abrir = (p, duplicar = false) => {
    const existentes = dados.ciclos.filter(c => c.plano_id === p.id);
    const ciclos = CICLOS.map(c => {
      const e = existentes.find(x => x.ciclo === c.id);
      return { ciclo: c.id, meses: c.meses, desconto_percent: e?.desconto_percent ?? 0, implantacao_valor: e?.implantacao_valor ?? '', ativo: e ? e.ativo : false };
    });
    setEditando({
      plano: duplicar ? { ...p, id: undefined, nome: `${p.nome} (cópia)` } : { ...p },
      ciclos,
    });
  };
  const alternarAtivo = async (p) => {
    const { error } = await supabase.from('zela_planos').update({ ativo: !p.ativo }).eq('id', p.id);
    if (error) return toast.error(error.message || 'Não foi possível alterar o plano.');
    toast.success(p.ativo ? 'Plano desativado. As contratações vigentes continuam.' : 'Plano reativado.');
    dados.recarregar();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button type="button" className={btnPrimario} onClick={abrirNovo}><Plus size={14} /> Novo plano</button></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {dados.planos.map(p => {
          const ciclosAtivos = dados.ciclos.filter(c => c.plano_id === p.id && c.ativo);
          return (
            <div key={p.id} className={`${card} ${p.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-base">{p.nome}</p>
                  <p className="text-[11px] uppercase tracking-wide text-dev-text-muted">{MODALIDADE[p.modalidade]}{p.ativo ? '' : ' · desativado'}</p>
                </div>
                <span className="text-xs text-dev-text-muted whitespace-nowrap">{usos[p.id] || 0} escola(s)</span>
              </div>
              {p.descricao && <p className="text-sm text-dev-text-muted mt-2">{p.descricao}</p>}
              <dl className="text-sm mt-3 space-y-1">
                <div className="flex justify-between"><dt className="text-dev-text-muted">Itens</dt><dd className="text-right">{p.modalidade === 'por_aluno' ? 'Escolhidos na contratação' : ['Plano base', ...p.itens.map(nomeItem)].join(', ')}</dd></div>
                {p.modalidade === 'pacote' && <div className="flex justify-between"><dt className="text-dev-text-muted">Por aluno</dt><dd>{brl(p.preco_por_aluno)}</dd></div>}
                <div className="flex justify-between"><dt className="text-dev-text-muted">Mínimo mensal</dt><dd>{brl(p.minimo_mensal)}</dd></div>
                <div className="flex justify-between"><dt className="text-dev-text-muted">Implantação</dt><dd>{brl(p.implantacao_valor)}</dd></div>
                <div className="flex justify-between"><dt className="text-dev-text-muted">Ciclos</dt><dd>{ciclosAtivos.map(c => `${CICLOS.find(x => x.id === c.ciclo)?.label} ${c.desconto_percent}%`).join(' · ') || 'Nenhum'}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2 mt-4">
                <button type="button" className={btnNeutro} onClick={() => abrir(p)}><Pencil size={14} /> Editar</button>
                <button type="button" className={btnNeutro} onClick={() => abrir(p, true)}><Copy size={14} /> Duplicar</button>
                <button type="button" className={btnNeutro} onClick={() => alternarAtivo(p)}><Power size={14} /> {p.ativo ? 'Desativar' : 'Reativar'}</button>
              </div>
            </div>
          );
        })}
      </div>
      {editando && <EditorPlano estado={editando} dados={dados} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); dados.recarregar(); }} />}
    </div>
  );
}

function EditorPlano({ estado, dados, onClose, onSaved }) {
  const [plano, setPlano] = useState(estado.plano);
  const [ciclos, setCiclos] = useState(estado.ciclos);
  const [salvando, setSalvando] = useState(false);
  const { config } = dados;
  const vendaveis = dados.precos.filter(p => p.item_id !== 'base' && ITEM_POR_ID[p.item_id] && (p.ativo || plano.itens.includes(p.item_id)));
  const ehPacote = plano.modalidade === 'pacote';
  const sugestao = ehPacote ? sugestaoDePacote(plano.itens, plano.preco_por_aluno, dados.precos) : null;

  const alternarItem = (id) => setPlano(p => ({ ...p, itens: p.itens.includes(id) ? p.itens.filter(i => i !== id) : [...p.itens, id] }));
  const mudarCiclo = (id, k, v) => setCiclos(cs => cs.map(c => c.ciclo === id ? { ...c, [k]: v } : c));

  const salvar = async () => {
    const nome = plano.nome.trim();
    if (!nome) return toast.error('Informe o nome do plano.');
    const impl = Number(plano.implantacao_valor);
    if (!(impl >= config.implantacao_min && impl <= config.implantacao_max)) {
      return toast.error(`A implantação deve ficar entre ${brl(config.implantacao_min)} e ${brl(config.implantacao_max)}.`);
    }
    if (ehPacote && !(Number(plano.preco_por_aluno) > 0)) return toast.error('Informe o preço por aluno do pacote.');
    if (!ciclos.some(c => c.ativo)) return toast.error('Deixe pelo menos um ciclo ativo.');
    for (const c of ciclos) {
      if (Number(c.desconto_percent) < 0 || Number(c.desconto_percent) > 50) return toast.error('O desconto do ciclo vai de 0 a 50 por cento.');
      if (c.implantacao_valor !== '' && !(Number(c.implantacao_valor) >= config.implantacao_min && Number(c.implantacao_valor) <= config.implantacao_max)) {
        return toast.error(`A implantação do ciclo deve ficar entre ${brl(config.implantacao_min)} e ${brl(config.implantacao_max)}.`);
      }
    }

    const corpo = {
      nome, modalidade: plano.modalidade, itens: ehPacote ? plano.itens : [],
      preco_por_aluno: ehPacote ? Number(plano.preco_por_aluno) : 0,
      minimo_mensal: Number(plano.minimo_mensal || 0),
      implantacao_valor: impl,
      descricao: plano.descricao?.trim() || null,
      alunos_min: plano.alunos_min === '' || plano.alunos_min == null ? null : Number(plano.alunos_min),
      alunos_max: plano.alunos_max === '' || plano.alunos_max == null ? null : Number(plano.alunos_max),
    };
    setSalvando(true);
    let planoId = plano.id;
    if (planoId) {
      const { error } = await supabase.from('zela_planos').update(corpo).eq('id', planoId);
      if (error) { setSalvando(false); return toast.error(error.message || 'Não foi possível salvar o plano.'); }
    } else {
      const { data, error } = await supabase.from('zela_planos').insert({ ...corpo, ordem: dados.planos.length + 1 }).select('id').single();
      if (error) { setSalvando(false); return toast.error(error.message || 'Não foi possível criar o plano.'); }
      planoId = data.id;
    }
    const linhas = ciclos
      .filter(c => !(plano.modalidade === 'por_aluno' && c.ciclo !== 'MENSAL'))
      .map(c => ({
        plano_id: planoId, ciclo: c.ciclo, meses: c.meses, ativo: !!c.ativo,
        desconto_percent: Number(c.desconto_percent || 0),
        implantacao_valor: c.implantacao_valor === '' || c.implantacao_valor == null ? null : Number(c.implantacao_valor),
      }));
    const { error: eC } = await supabase.from('zela_plano_ciclos').upsert(linhas, { onConflict: 'plano_id,ciclo' });
    setSalvando(false);
    if (eC) return toast.error(eC.message || 'O plano foi salvo, mas os ciclos não.');
    toast.success('Plano salvo. Vale para novas contratações.');
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-dev-bg border border-dev-border rounded-zela-lg p-5 space-y-4 my-8">
        <div className="flex items-center justify-between">
          <p className="font-bold text-lg">{plano.id ? 'Editar plano' : 'Novo plano'}</p>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-dev-text-muted hover:text-dev-text"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={rotulo} htmlFor="pl-nome">Nome</label><input id="pl-nome" className={campo} value={plano.nome} maxLength={60} onChange={e => setPlano({ ...plano, nome: e.target.value })} /></div>
          <div>
            <label className={rotulo} htmlFor="pl-mod">Modalidade</label>
            <select id="pl-mod" className={campo} value={plano.modalidade} disabled={!!plano.id} onChange={e => {
              const m = e.target.value;
              setPlano({ ...plano, modalidade: m });
              if (m === 'por_aluno') setCiclos(cs => cs.map(c => ({ ...c, ativo: c.ciclo === 'MENSAL' })));
            }}>
              <option value="pacote">Pacote</option>
              <option value="por_aluno">Por aluno</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className={rotulo} htmlFor="pl-desc">Descrição</label><input id="pl-desc" className={campo} value={plano.descricao || ''} maxLength={500} onChange={e => setPlano({ ...plano, descricao: e.target.value })} /></div>
        </div>

        {ehPacote && (
          <div>
            <p className={rotulo}>Itens além do plano base (sempre incluso)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {vendaveis.map(p => (
                <label key={p.item_id} className="flex items-center gap-2 text-sm bg-dev-surface border border-dev-border rounded-zela-md px-3 py-2">
                  <input type="checkbox" checked={plano.itens.includes(p.item_id)} onChange={() => alternarItem(p.item_id)} />
                  <span className="flex-1">{ITEM_POR_ID[p.item_id].nome}</span>
                  <span className="text-dev-text-muted text-xs">{brl(p.valor)}{p.tipo_cobranca === 'fixo_mensal' ? ' fixo' : ''}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ehPacote && <div><label className={rotulo} htmlFor="pl-pa">Preço por aluno (R$)</label><input id="pl-pa" type="number" min="0" step="0.01" className={campo} value={plano.preco_por_aluno} onChange={e => setPlano({ ...plano, preco_por_aluno: e.target.value })} /></div>}
          <div><label className={rotulo} htmlFor="pl-min">Mínimo mensal (R$)</label><input id="pl-min" type="number" min="0" step="0.01" className={campo} value={plano.minimo_mensal} onChange={e => setPlano({ ...plano, minimo_mensal: e.target.value })} /></div>
          <div><label className={rotulo} htmlFor="pl-imp">Implantação (R$)</label><input id="pl-imp" type="number" min="0" step="0.01" className={campo} value={plano.implantacao_valor} onChange={e => setPlano({ ...plano, implantacao_valor: e.target.value })} /></div>
        </div>
        {sugestao && sugestao.soma > 0 && (
          <p className="text-xs text-dev-text-muted">Soma dos itens avulsos: {brl(sugestao.soma)} por aluno. {Number(plano.preco_por_aluno) > 0 && `Seu preço dá ${sugestao.desconto.toString().replace('.', ',')} por cento de desconto sobre o avulso.`}</p>
        )}

        <div>
          <p className={rotulo}>Ciclos{plano.modalidade === 'por_aluno' ? ' (por aluno é só mensal)' : ''}</p>
          <div className="space-y-2">
            {ciclos.map(c => {
              const bloqueado = plano.modalidade === 'por_aluno' && c.ciclo !== 'MENSAL';
              return (
                <div key={c.ciclo} className={`grid grid-cols-[auto_1fr_1fr_1fr] gap-2 items-center bg-dev-surface border border-dev-border rounded-zela-md px-3 py-2 ${bloqueado ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={!!c.ativo && !bloqueado} disabled={bloqueado} onChange={e => mudarCiclo(c.ciclo, 'ativo', e.target.checked)} aria-label={`Ativar ciclo ${c.ciclo}`} />
                  <span className="text-sm font-medium">{CICLOS.find(x => x.id === c.ciclo).label}</span>
                  <input type="number" min="0" max="50" step="0.5" className={campo} disabled={bloqueado} value={c.desconto_percent} onChange={e => mudarCiclo(c.ciclo, 'desconto_percent', e.target.value)} aria-label={`Desconto do ciclo ${c.ciclo} em porcentagem`} placeholder="Desconto %" />
                  <input type="number" min="0" step="0.01" className={campo} disabled={bloqueado} value={c.implantacao_valor} onChange={e => mudarCiclo(c.ciclo, 'implantacao_valor', e.target.value)} aria-label={`Implantação do ciclo ${c.ciclo}`} placeholder="Implantação própria" />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-dev-text-muted mt-1">Colunas: ativar, desconto em porcentagem (0 a 50) e implantação própria do ciclo (vazio usa a do plano).</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnNeutro} onClick={onClose}>Cancelar</button>
          <button type="button" className={btnPrimario} disabled={salvando} onClick={salvar}>{salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar plano</button>
        </div>
      </div>
    </div>
  );
}
