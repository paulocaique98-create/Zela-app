import { createPortal } from 'react-dom';
import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { usePlanosZela } from '../hooks/usePlanosZela';
import { ITEM_POR_ID } from '../lib/modulosCatalogo';
import { CICLO_POR_ID, brl, diasParaVencer, formatarData, situacaoContrato, mensalVigente } from '../lib/planosZela';

// Painel de contratos (Portal do Dev), Fase 1: lista e ficha somente leitura.
// Os dados vêm de school_contratacoes via usePlanosZela; nada é gravado aqui.
// Faturamento, contrato e NFS-e entram nas fases seguintes.

const campo = 'bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text';
const COR_SITUACAO = { Ativo: 'text-success', Vencido: 'text-error', Inativo: 'text-dev-text-muted' };
const ABAS_FICHA = [
  { id: 'dados', label: 'Dados' },
  { id: 'faturamento', label: 'Faturamento' },
  { id: 'historico', label: 'Histórico' },
  { id: 'reajustes', label: 'Reajustes' },
];
const VENCIMENTOS = [
  { id: 'todos', label: 'Todos os vencimentos' },
  { id: '30', label: 'Vence em até 30 dias' },
  { id: '90', label: 'Vence em até 90 dias' },
];

export default function DeveloperPainelContratos() {
  const dados = usePlanosZela();
  const [filtroSituacao, setFiltroSituacao] = useState('todas');
  const [filtroPlano, setFiltroPlano] = useState('todos');
  const [filtroVenc, setFiltroVenc] = useState('todos');
  const [aberta, setAberta] = useState(null);

  const planoPor = useMemo(() => Object.fromEntries(dados.planos.map(p => [p.id, p])), [dados.planos]);
  const ctPor = useMemo(() => Object.fromEntries(dados.contratacoes.map(c => [c.school_id, c])), [dados.contratacoes]);

  const linhas = useMemo(() => dados.escolas.map(escola => {
    const ct = ctPor[escola.id] || null;
    return { escola, ct, plano: ct ? planoPor[ct.plano_id] : null, situacao: situacaoContrato(ct, escola.is_active), dias: ct ? diasParaVencer(ct.fim) : null };
  }), [dados.escolas, ctPor, planoPor]);

  const visiveis = linhas.filter(l => {
    if (filtroSituacao !== 'todas' && l.situacao !== filtroSituacao) return false;
    if (filtroPlano !== 'todos' && l.ct?.plano_id !== filtroPlano) return false;
    if (filtroVenc !== 'todos' && !(l.dias !== null && l.dias >= 0 && l.dias <= Number(filtroVenc))) return false;
    return true;
  });
  const selecionada = aberta ? linhas.find(l => l.escola.id === aberta) : null;

  if (dados.loading) return <div className="flex-1 flex items-center justify-center p-10"><Loader2 className="animate-spin text-dev-text-muted" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
      <div>
        <h2 className="text-lg font-bold text-dev-text">Painel de contratos</h2>
        <p className="text-sm text-dev-text-muted">Contratação de cada escola com o Zela. Somente leitura: para trocar plano ou desconto, use o menu Planos.</p>
      </div>
      {dados.erro && <p className="text-sm text-error">Não foi possível carregar todos os dados: {dados.erro}</p>}

      <div className="flex flex-wrap gap-2">
        <select aria-label="Situação" className={campo} value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value)}>
          <option value="todas">Todas as situações</option>
          <option value="Ativo">Ativo</option>
          <option value="Vencido">Vencido</option>
          <option value="Inativo">Inativo</option>
        </select>
        <select aria-label="Plano" className={campo} value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}>
          <option value="todos">Todos os planos</option>
          {dados.planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select aria-label="Vencimento" className={campo} value={filtroVenc} onChange={e => setFiltroVenc(e.target.value)}>
          {VENCIMENTOS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto border border-dev-border rounded-zela-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-dev-text-muted bg-dev-surface">
              <th className="p-3">Escola</th><th className="p-3">Plano</th><th className="p-3">Ciclo</th>
              <th className="p-3">Mensal cheia</th><th className="p-3">Mensal com desconto</th><th className="p-3">Vencimento</th><th className="p-3">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ escola, ct, plano, situacao, dias }) => {
              const vigente = ct ? mensalVigente(ct) : 0;
              return (
                <tr key={escola.id} className="border-t border-dev-border hover:bg-dev-surface cursor-pointer" onClick={() => setAberta(escola.id)}>
                  <td className="p-3 font-medium">
                    <button type="button" className="text-left hover:underline" onClick={e => { e.stopPropagation(); setAberta(escola.id); }}>{escola.name}</button>
                  </td>
                  <td className="p-3">{plano?.nome || <span className="text-dev-text-muted">Sem contratação</span>}</td>
                  <td className="p-3">{ct ? CICLO_POR_ID[ct.ciclo]?.label : ''}</td>
                  <td className="p-3">{ct ? brl(ct.valor_mensal) : ''}</td>
                  <td className="p-3">{ct ? (vigente !== Number(ct.valor_mensal) ? brl(vigente) : 'Sem desconto vigente') : ''}</td>
                  <td className={`p-3 ${dias !== null && dias < 0 ? 'text-error' : dias !== null && dias <= 30 ? 'text-warning' : ''}`}>{ct ? formatarData(ct.fim) : ''}</td>
                  <td className={`p-3 font-medium ${COR_SITUACAO[situacao]}`}>{situacao}</td>
                </tr>
              );
            })}
            {visiveis.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-dev-text-muted">Nenhuma escola com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>

      {selecionada && <FichaContratacao linha={selecionada} onClose={() => setAberta(null)} />}
    </div>
  );
}

function Linha({ rotulo, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-dev-border text-sm">
      <span className="text-dev-text-muted">{rotulo}</span>
      <span className="text-right text-dev-text">{children}</span>
    </div>
  );
}

function FichaContratacao({ linha, onClose }) {
  const { escola, ct, plano, situacao } = linha;
  const [aba, setAba] = useState('dados');
  const itens = (ct?.itens || []).map(id => ITEM_POR_ID[id]?.nome || id);
  const temDesconto = ct && Number(ct.mensal_desconto) > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="w-full max-w-lg h-full bg-dev-bg border-l border-dev-border overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Contratação de ${escola.name}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-dev-text">{escola.name}</h3>
            <p className={`text-xs font-medium ${COR_SITUACAO[situacao]}`}>{situacao}</p>
          </div>
          <button type="button" aria-label="Fechar" className="p-2 text-dev-text-muted hover:text-dev-text" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-dev-border" role="tablist">
          {ABAS_FICHA.map(a => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${aba === a.id ? 'border-dev-primary text-dev-primary' : 'border-transparent text-dev-text-muted hover:text-dev-text'}`}>
              {a.label}
            </button>
          ))}
        </div>

        {aba === 'dados' && (!ct ? <p className="text-sm text-dev-text-muted">Esta escola não tem contratação ativa.</p> : (
          <div>
            <Linha rotulo="Plano">{plano?.nome || ct.plano_id}</Linha>
            <Linha rotulo="Ciclo">{CICLO_POR_ID[ct.ciclo]?.label}</Linha>
            <Linha rotulo="Início">{formatarData(ct.inicio)}</Linha>
            <Linha rotulo="Fim">{formatarData(ct.fim)}</Linha>
            <Linha rotulo="Alunos contratados">{ct.alunos_contratados}</Linha>
            <Linha rotulo="Mensalidade cheia">{brl(ct.valor_mensal)}</Linha>
            <Linha rotulo="Valor do ciclo">{brl(ct.valor_ciclo)}</Linha>
            <Linha rotulo="Implantação">{brl(ct.implantacao_final)}</Linha>
            <div className="py-2 border-b border-dev-border text-sm">
              <p className="text-dev-text-muted mb-1">Itens</p>
              <p className="text-dev-text">{itens.length ? itens.join(', ') : 'Nenhum item registrado'}</p>
            </div>
            <div className="py-2 text-sm">
              <p className="text-dev-text-muted mb-1">Desconto na mensalidade</p>
              {temDesconto ? (
                <p className="text-dev-text">
                  {brl(ct.mensal_desconto)} por mês, {ct.mensal_desconto_recorrente ? 'recorrente, vale até o fim do ciclo' : `por ${ct.mensal_desconto_meses} mês(es) desde o início`}. Mensalidade com desconto: {brl(ct.valor_mensal_com_desconto)}.
                  {ct.desconto_motivo ? ` Motivo: ${ct.desconto_motivo}.` : ''}
                </p>
              ) : <p className="text-dev-text">Sem desconto</p>}
            </div>
          </div>
        ))}
        {aba === 'faturamento' && <p className="text-sm text-dev-text-muted">Cobranças do Zela para a escola entram na Fase 2, depois que a conta de cobrança do Zela estiver definida.</p>}
        {aba === 'historico' && <p className="text-sm text-dev-text-muted">O histórico de ações do contrato entra junto com as ações do painel (Fase 2).</p>}
        {aba === 'reajustes' && <p className="text-sm text-dev-text-muted">Reajustes entram na Fase 4.</p>}
      </aside>
    </div>,
    document.body,
  );
}
