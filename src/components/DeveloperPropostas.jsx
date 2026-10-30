import React, { useMemo, useState } from 'react';
import { Loader2, FileDown, AlertTriangle } from 'lucide-react';
import { usePlanosZela } from '../hooks/usePlanosZela';
import { toast } from '../lib/toast';
import { ITEM_POR_ID } from '../lib/modulosCatalogo';
import { CICLO_POR_ID, brl, modalidadesPermitidas } from '../lib/planosZela';
import { montarProposta } from '../lib/proposta';
import { linkWhatsapp } from '../lib/captacao';

// Menu Propostas (Portal do Dev): escolhe a escola, o plano e os módulos e gera o
// PDF no navegador. Nada é gravado; só os contatos do Zela ficam neste aparelho.

const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4 space-y-3';
const campo = 'w-full bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const campoCurto = campo.replace('w-full', 'w-28 shrink-0');
const rotulo = 'block text-[11px] font-bold text-dev-text-muted mb-1';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-zela-md text-sm font-medium transition-all disabled:opacity-50';
const btnPrimario = `${btn} bg-dev-primary-container text-dev-primary hover:brightness-110`;
const CHAVE_CONTATOS = 'zela_proposta_contatos';

const lerContatos = () => { try { return JSON.parse(localStorage.getItem(CHAVE_CONTATOS)) || {}; } catch { return {}; } };

export default function DeveloperPropostas() {
  const dados = usePlanosZela();
  const [escolaId, setEscolaId] = useState('');
  const [prospect, setProspect] = useState({ nome: '', contato: '' });
  const [alunos, setAlunos] = useState('');
  const [modalidade, setModalidade] = useState('pacote');
  const [planoId, setPlanoId] = useState('');
  const [ciclo, setCiclo] = useState('');
  const [escolhidos, setEscolhidos] = useState([]);
  const [extras, setExtras] = useState([]);
  const [mTipo, setMTipo] = useState('percent');
  const [mValor, setMValor] = useState('');
  const [mRecorrente, setMRecorrente] = useState(true);
  const [mMeses, setMMeses] = useState('');
  const [iTipo, setITipo] = useState('percent');
  const [iValor, setIValor] = useState('');
  const [validade, setValidade] = useState(15);
  const [contatos, setContatos] = useState(lerContatos);
  const [gerando, setGerando] = useState(false);

  const escola = dados.escolas.find(e => e.id === escolaId) || null;
  const nAlunos = Math.max(Number(alunos) || 0, 0);
  const permitidas = modalidadesPermitidas(nAlunos || 1, dados.config.limite_alunos_por_aluno);
  const modalidadeOk = permitidas.includes(modalidade) ? modalidade : 'pacote';
  const planos = dados.planos.filter(p => p.ativo && p.modalidade === modalidadeOk);
  const plano = planos.find(p => p.id === planoId) || null;
  const ciclos = plano ? dados.ciclos.filter(c => c.plano_id === plano.id && c.ativo) : [];
  const cicloSel = ciclos.find(c => c.ciclo === ciclo) || null;
  const vendaveis = dados.precos.filter(p => p.item_id !== 'base' && p.ativo && ITEM_POR_ID[p.item_id] && ITEM_POR_ID[p.item_id].grupo !== 'tecnico');
  const doPlano = new Set(plano?.itens || []);

  const alternar = (lista, setLista, id) => setLista(lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]);
  const salvarContato = (k, v) => {
    const novo = { ...contatos, [k]: v };
    setContatos(novo);
    try { localStorage.setItem(CHAVE_CONTATOS, JSON.stringify(novo)); } catch { /* sem armazenamento: segue só em memória */ }
  };

  const proposta = useMemo(() => montarProposta({
    cliente: { nome: escola ? escola.name : prospect.nome, contato: escola ? '' : prospect.contato },
    plano, ciclo: cicloSel, alunos: nAlunos, escolhidos, extras, precos: dados.precos, config: dados.config,
    descontoMensal: { tipo: mTipo, valor: mValor, recorrente: mRecorrente, meses: mMeses },
    descontoImplantacao: { tipo: iTipo, valor: iValor },
    validadeDias: validade, contatos,
  }), [escola, prospect, plano, cicloSel, nAlunos, escolhidos, extras, dados.precos, dados.config, mTipo, mValor, mRecorrente, mMeses, iTipo, iValor, validade, contatos]);

  const semContato = !linkWhatsapp(contatos.whatsapp);
  const podeGerar = !proposta.erro && !semContato && !gerando;

  const gerar = async () => {
    setGerando(true);
    try {
      const { gerarPropostaPdf } = await import('../lib/propostaPdf');
      await gerarPropostaPdf(proposta);
    } catch (e) {
      toast.error('Não foi possível gerar o PDF.');
      console.error(e);
    } finally { setGerando(false); }
  };

  if (dados.loading) return <div className="flex-1 flex items-center justify-center p-10"><Loader2 className="animate-spin text-dev-text-muted" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
      <div>
        <h2 className="text-lg font-bold text-dev-text">Propostas</h2>
        <p className="text-sm text-dev-text-muted">Monte a proposta e baixe o PDF. Nada fica salvo no sistema: o PDF é gerado na hora com os preços atuais.</p>
      </div>
      {dados.erro && <p className="text-sm text-error">Não foi possível carregar todos os dados: {dados.erro}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={card}>
          <h3 className="text-sm font-bold text-dev-text">Escola</h3>
          <div>
            <label className={rotulo} htmlFor="prop-escola">Escola cadastrada</label>
            <select id="prop-escola" className={campo} value={escolaId} onChange={e => setEscolaId(e.target.value)}>
              <option value="">Outra escola (prospect)</option>
              {dados.escolas.filter(e => e.is_active !== false).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {!escola && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={rotulo} htmlFor="prop-nome">Nome da escola</label><input id="prop-nome" className={campo} value={prospect.nome} onChange={e => setProspect({ ...prospect, nome: e.target.value })} /></div>
              <div><label className={rotulo} htmlFor="prop-contato">A/C (opcional)</label><input id="prop-contato" className={campo} value={prospect.contato} onChange={e => setProspect({ ...prospect, contato: e.target.value })} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={rotulo} htmlFor="prop-alunos">Alunos</label><input id="prop-alunos" type="number" min="1" className={campo} value={alunos} onChange={e => setAlunos(e.target.value)} /></div>
            <div><label className={rotulo} htmlFor="prop-validade">Validade (dias)</label><input id="prop-validade" type="number" min="1" className={campo} value={validade} onChange={e => setValidade(e.target.value)} /></div>
          </div>
        </section>

        <section className={card}>
          <h3 className="text-sm font-bold text-dev-text">Contato dos botões do PDF</h3>
          <div>
            <label className={rotulo} htmlFor="prop-wa">WhatsApp do Zela (Aceitar Proposta e Tirar Dúvida)</label>
            <input id="prop-wa" inputMode="tel" placeholder="(11) 99999 0000" className={campo} value={contatos.whatsapp || ''} onChange={e => salvarContato('whatsapp', e.target.value)} />
          </div>
          <p className="text-xs text-dev-text-muted">Fica salvo só neste aparelho.</p>
        </section>

        <section className={`${card} lg:col-span-2`}>
          <h3 className="text-sm font-bold text-dev-text">Plano e módulos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={rotulo} htmlFor="prop-mod">Modalidade</label>
              <select id="prop-mod" className={campo} value={modalidadeOk} onChange={e => { setModalidade(e.target.value); setPlanoId(''); setCiclo(''); setEscolhidos([]); setExtras([]); }}>
                {permitidas.includes('por_aluno') && <option value="por_aluno">Por aluno</option>}
                <option value="pacote">Pacote</option>
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="prop-plano">Plano</label>
              <select id="prop-plano" className={campo} value={planoId} onChange={e => { setPlanoId(e.target.value); setCiclo(''); setExtras([]); }}>
                <option value="">Escolha</option>
                {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="prop-ciclo">Ciclo</label>
              <select id="prop-ciclo" className={campo} value={ciclo} onChange={e => setCiclo(e.target.value)} disabled={!plano}>
                <option value="">Escolha</option>
                {ciclos.map(c => <option key={c.id} value={c.ciclo}>{CICLO_POR_ID[c.ciclo]?.label}{Number(c.desconto_percent) > 0 ? ` (${c.desconto_percent} por cento de desconto)` : ''}</option>)}
              </select>
            </div>
          </div>
          {plano && (
            <div>
              <p className={rotulo}>{plano.modalidade === 'pacote' ? 'Adicionais avulsos além do pacote' : 'Módulos e adicionais'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {vendaveis.filter(p => plano.modalidade === 'por_aluno' || !doPlano.has(p.item_id)).map(p => {
                  const lista = plano.modalidade === 'pacote' ? extras : escolhidos;
                  const setLista = plano.modalidade === 'pacote' ? setExtras : setEscolhidos;
                  return (
                    <label key={p.item_id} className="flex items-center gap-2 text-sm text-dev-text cursor-pointer">
                      <input type="checkbox" checked={lista.includes(p.item_id)} onChange={() => alternar(lista, setLista, p.item_id)} />
                      {ITEM_POR_ID[p.item_id].nome} <span className="text-dev-text-muted text-xs">{brl(p.valor)}{p.tipo_cobranca === 'por_aluno' ? ' por aluno' : ' por mês'}</span>
                    </label>
                  );
                })}
              </div>
              {plano.modalidade === 'pacote' && <p className="text-xs text-dev-text-muted mt-2">Já inclusos no pacote: {(plano.itens || []).map(id => ITEM_POR_ID[id]?.nome || id).join(', ') || 'só o plano base'}.</p>}
            </div>
          )}
        </section>

        <section className={`${card} lg:col-span-2`}>
          <h3 className="text-sm font-bold text-dev-text">Descontos (opcional)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className={rotulo}>Na mensalidade (máximo {dados.config.desconto_mensalidade_max_percent} por cento)</p>
              <div className="flex gap-2">
                <select aria-label="Tipo do desconto na mensalidade" className={campoCurto} value={mTipo} onChange={e => setMTipo(e.target.value)}><option value="percent">Por cento</option><option value="valor">R$</option></select>
                <input aria-label="Valor do desconto na mensalidade" type="number" min="0" className={`${campo} min-w-0`} value={mValor} onChange={e => setMValor(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-dev-text"><input type="checkbox" checked={mRecorrente} onChange={e => setMRecorrente(e.target.checked)} /> Vale em todo o ciclo</label>
              {!mRecorrente && <input aria-label="Meses de desconto" type="number" min="1" placeholder="Quantos meses" className={campo} value={mMeses} onChange={e => setMMeses(e.target.value)} />}
            </div>
            <div className="space-y-2">
              <p className={rotulo}>Na implantação</p>
              <div className="flex gap-2">
                <select aria-label="Tipo do desconto na implantação" className={campoCurto} value={iTipo} onChange={e => setITipo(e.target.value)}><option value="percent">Por cento</option><option value="valor">R$</option></select>
                <input aria-label="Valor do desconto na implantação" type="number" min="0" className={`${campo} min-w-0`} value={iValor} onChange={e => setIValor(e.target.value)} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className={card}>
        <h3 className="text-sm font-bold text-dev-text">Resumo</h3>
        {proposta.erro ? (
          <p className="text-sm text-dev-text-muted flex items-center gap-2"><AlertTriangle size={14} /> {proposta.erro}</p>
        ) : (
          <div className="text-sm text-dev-text space-y-1">
            <p>Mensalidade: <strong>{brl(proposta.valores.mensalComDesconto ?? proposta.valores.mensalCheia)}</strong>{proposta.valores.mensalComDesconto !== null && <span className="text-dev-text-muted"> (cheia {brl(proposta.valores.mensalCheia)})</span>}</p>
            <p>Valor do ciclo {proposta.ciclo.label.toLowerCase()}: <strong>{brl(proposta.valores.valorCiclo)}</strong></p>
            {proposta.valores.implantacaoBase > 0 && <p>Implantação: <strong>{brl(proposta.valores.implantacao)}</strong></p>}
            <p className="text-dev-text-muted">{proposta.itens.length} módulo(s) ou adicional(is) além do plano base. Válida até {proposta.validadeAte}.</p>
          </div>
        )}
        {semContato && <p className="text-xs text-warning">Preencha um WhatsApp válido do Zela (com DDD) para os botões do PDF funcionarem.</p>}
        <button type="button" className={btnPrimario} disabled={!podeGerar} onClick={gerar}>
          {gerando ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Gerar PDF
        </button>
      </section>
    </div>
  );
}
