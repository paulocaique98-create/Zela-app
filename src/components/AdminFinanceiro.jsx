import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ResponsiveTable } from './GestaoShared';
import { Plus, X, AlertCircle, Loader2, RefreshCw, KeyRound, Percent, FileText, Receipt, Settings2, CheckCircle2, ExternalLink, HandCoins } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';
import { uploadFile, buildSafeFileName } from '../lib/storage';
import { carregarContextoDeMensalidades, montarLinhasDeMensalidade } from '../lib/mensalidadesData';
import { chamarFuncaoFinanceira } from '../lib/funcoesFinanceiras';
import { todayISO } from '../lib/gestaoUtils';
import {
  anoDoPreco, valorMensalEquivalente, rotuloDoPlano, mensagemSemPreco, ROTULO_SITUACAO_DA_MENSALIDADE,
} from '../../supabase/functions/_shared/planPricing.ts';

const CYCLE_LABELS = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual' };
const CYCLES = ['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'];

const CONTRACT_STATUS_LABELS = { active: 'Ativo', paused: 'Pausado', cancelled: 'Cancelado' };
const CONTRACT_STATUS_CLASSES = {
  active: 'bg-green-50 text-green-700 border-green-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const CHARGE_STATUS_LABELS = { PENDING: 'Pendente', AWAITING_PAYMENT: 'Aguardando', PAID: 'Pago', OVERDUE: 'Atrasado', CANCELLED: 'Cancelado', REFUNDED: 'Estornado', FAILED: 'Falhou' };
const CHARGE_STATUS_CLASSES = {
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
  AWAITING_PAYMENT: 'bg-blue-50 text-blue-700 border-blue-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  OVERDUE: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  REFUNDED: 'bg-purple-50 text-purple-700 border-purple-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
};

function centsToBRL(cents) {
  return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TABS = [
  { id: 'contratos', label: 'Contratos', icon: FileText },
  { id: 'cobrancas', label: 'Cobranças', icon: Receipt },
  { id: 'config', label: 'Configuração', icon: Settings2 },
];

export default function AdminFinanceiro({ currentUser, currentSchool }) {
  const [tab, setTab] = useState('contratos');

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 p-2.5 sm:p-3 md:p-4 rounded-none sm:rounded-zela-xl shadow-none sm:shadow-sm border-0 sm:border sm:border-outline-variant md:rounded-none md:shadow-none md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Título "Financeiro" e ícone removidos (o Header do app já mostra o
          nome da tela dinamicamente); sub-abas ganham o espaço. */}

      {/* Sub-abas */}
      <div className="flex gap-1 mb-3 border-b border-outline-variant shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'contratos' && <ContratosTab currentUser={currentUser} />}
        {tab === 'cobrancas' && <CobrancasTab currentUser={currentUser} />}
        {tab === 'config' && <ConfigTab currentUser={currentUser} currentSchool={currentSchool} />}
      </div>
    </div>
  );
}

// ─────────────────────────────── CONTRATOS ───────────────────────────────

export function ContratosTab({ currentUser }) {
  const [contracts, setContracts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [painelVersao, setPainelVersao] = useState(0);

  const fetchContracts = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('financial_contracts')
        .select('id, billing_cycle, amount_cents, status, first_due_date, gateway_subscription_id, created_at, ciclo_horas, turno, students:student_id(name), guardian:financial_guardian_id(name, email)')
        .eq('school_id', currentUser.school_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setContracts(data || []);
    } catch (err) {
      console.error('Erro ao buscar contratos:', err);
      setErrorMsg('Erro ao buscar contratos: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.school_id]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('financial_contracts')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', cancelTarget.id);
      if (error) throw error;
      setCancelTarget(null);
      fetchContracts();
    } catch (err) {
      console.error('Erro ao cancelar contrato:', err);
      setErrorMsg('Erro ao cancelar contrato: ' + err.message);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-on-surface-variant">Mensalidades dos alunos, cobradas automaticamente pelo Asaas. O preço vem de Financeiro · Planos.</p>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={fetchContracts} title="Atualizar" className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md transition">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md shadow-sm transition text-sm"
          >
            <Plus size={16} /> Nova mensalidade
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" /> {errorMsg}
        </div>
      )}

      <AguardandoMensalidade currentUser={currentUser} versao={painelVersao} onCriou={() => { fetchContracts(); setPainelVersao(v => v + 1); }} />

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-variant"><Loader2 className="animate-spin" size={24} /></div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
          <FileText className="text-outline-variant mb-2" size={32} />
          <p className="text-on-surface-variant font-medium text-sm">Nenhuma mensalidade criada ainda.</p>
        </div>
      ) : (
        <ResponsiveTable
          rows={contracts}
          columns={[
            { label: 'Aluno', primary: true, render: c => c.students?.name || '·' },
            { label: 'Responsável', className: 'text-on-surface-variant', render: c => c.guardian?.name || '·' },
            { label: 'Plano', render: c => (c.ciclo_horas && c.turno ? `${c.ciclo_horas}h ${c.turno}` : '·') },
            { label: 'Periodicidade', render: c => CYCLE_LABELS[c.billing_cycle] || c.billing_cycle },
            { label: 'Valor', className: 'font-bold', render: c => centsToBRL(c.amount_cents) },
            { label: '1º Vencimento', render: c => (c.first_due_date ? new Date(c.first_due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '·') },
            {
              label: 'Status',
              render: c => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${CONTRACT_STATUS_CLASSES[c.status] || ''}`}>
                  {CONTRACT_STATUS_LABELS[c.status] || c.status}
                </span>
              ),
            },
            {
              label: '', actions: true, align: 'right',
              render: c => c.status === 'active' && (
                <button onClick={() => setCancelTarget(c)} className="text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-zela-md transition">
                  Cancelar
                </button>
              ),
            },
          ]}
        />
      )}

      {isModalOpen && (
        <NovoContratoModal
          currentUser={currentUser}
          onClose={() => setIsModalOpen(false)}
          onCreated={() => { setIsModalOpen(false); fetchContracts(); setPainelVersao(v => v + 1); }}
        />
      )}

      {cancelTarget && (
        <ConfirmModal
          title="Cancelar contrato"
          message={`Cancelar o contrato de ${cancelTarget.students?.name || 'este aluno'}? A assinatura no gateway continuará ativa até você cancelá-la lá também; nenhuma cobrança já emitida é apagada.`}
          confirmLabel="Cancelar contrato"
          danger
          isLoading={isCancelling}
          onConfirm={handleCancel}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

function NovoContratoModal({ currentUser, onClose, onCreated }) {
  const [ctx, setCtx] = useState(null);
  const [form, setForm] = useState({
    student_id: '',
    billing_cycle: 'MONTHLY',
    first_due_date: '',
    billing_type: 'UNDEFINED',
    description: '',
  });
  const [digitar, setDigitar] = useState(false);
  const [valorManual, setValorManual] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!currentUser?.school_id) return;
    carregarContextoDeMensalidades(currentUser.school_id)
      .then(setCtx)
      .catch(e => { setErrorMsg(e.message || 'Não foi possível carregar os alunos.'); setCtx({ alunos: [], precos: [], contratos: [], vinculos: [], condicoes: [], descontos: [], responsaveis: [] }); });
  }, [currentUser?.school_id]);

  const ano = anoDoPreco(form.first_due_date || todayISO());
  const linhas = useMemo(() => (ctx ? montarLinhasDeMensalidade(ctx, { ano, periodicidade: form.billing_cycle }) : []), [ctx, ano, form.billing_cycle]);
  const linha = linhas.find(l => l.aluno.id === form.student_id) || null;

  const manualCents = (() => {
    const n = parseFloat(String(valorManual).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  })();
  // Sem preço na tabela, ou querendo outro valor: o valor mensal é digitado.
  const usaTabela = !digitar;
  const bloqueado = linha && ['ja_tem', 'bolsista', 'sem_responsavel', 'sem_documento'].includes(linha.situacao);
  const podeEnviar = Boolean(form.student_id && form.first_due_date && linha && !bloqueado
    && (digitar ? manualCents > 0 : linha.situacao === 'pronto'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!podeEnviar) { setErrorMsg('Escolha o aluno e o 1º vencimento. Se faltar preço na tabela, digite o valor mensal.'); return; }
    setIsSaving(true);
    try {
      await chamarFuncaoFinanceira('create-financial-contract', {
        student_id: form.student_id,
        billing_cycle: form.billing_cycle,
        first_due_date: form.first_due_date,
        billing_type: form.billing_type,
        description: form.description || undefined,
        ...(digitar ? { base_monthly_amount_cents: manualCents } : {}),
      });
      onCreated();
    } catch (err) {
      console.error('Erro ao criar contrato:', err);
      setErrorMsg(err.message || 'Erro ao criar contrato.');
    } finally {
      setIsSaving(false);
    }
  };

  const previa = (() => {
    if (!linha) return null;
    if (linha.situacao === 'pronto' && usaTabela) {
      return { tom: 'ok', texto: `Tabela de ${ano} · ${rotuloDoPlano(linha.ciclo, linha.turno)}: ${centsToBRL(linha.mensalCents)} por mês${linha.descontoPercent ? ` · desconto da família ${linha.descontoPercent}%` : ''}.`, valor: linha.valorDoCicloCents };
    }
    if (digitar && manualCents > 0 && !bloqueado) {
      const cents = Math.round(manualCents * ({ MONTHLY: 1, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 }[form.billing_cycle]) * (1 - (linha.descontoPercent || 0) / 100));
      return { tom: 'ok', texto: `Valor digitado: ${centsToBRL(manualCents)} por mês${linha.descontoPercent ? ` · desconto da família ${linha.descontoPercent}%` : ''}.`, valor: cents };
    }
    if (linha.situacao === 'sem_preco') return { tom: 'aviso', texto: `${mensagemSemPreco(linha.ciclo, linha.turno, ano)} Ou digite o valor mensal abaixo.` };
    if (linha.situacao === 'sem_plano') return { tom: 'aviso', texto: `Aluno sem ${linha.faltando.join(' e sem ')} no cadastro. Complete em Financeiro · Planos ou digite o valor mensal abaixo.` };
    return { tom: 'erro', texto: `${ROTULO_SITUACAO_DA_MENSALIDADE[linha.situacao]}${linha.situacao === 'bolsista' ? `: ${linha.responsavelNome || 'a família'} não recebe cobrança.` : '.'}` };
  })();

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-on-surface">Nova mensalidade</h3>
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-full transition"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="nm-aluno" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Aluno</label>
            <select
              id="nm-aluno"
              required
              value={form.student_id}
              onChange={e => setForm({ ...form, student_id: e.target.value })}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              disabled={!ctx}
            >
              <option value="">{ctx ? 'Selecione um aluno' : 'Carregando alunos...'}</option>
              {linhas.map(l => <option key={l.aluno.id} value={l.aluno.id}>{l.aluno.name} · {rotuloDoPlano(l.ciclo, l.turno)}{l.situacao === 'ja_tem' ? ' · já tem mensalidade' : ''}</option>)}
            </select>
            {ctx && ctx.alunos.length === 0 && <p className="text-xs text-amber-600 mt-1">Nenhum aluno ativo cadastrado ainda nesta escola.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="nm-periodicidade" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Periodicidade</label>
              <select
                id="nm-periodicidade"
                value={form.billing_cycle}
                onChange={e => setForm({ ...form, billing_cycle: e.target.value })}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              >
                {CYCLES.map(c => <option key={c} value={c}>{CYCLE_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="nm-vencimento" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">1º Vencimento</label>
              <input
                id="nm-vencimento"
                required
                type="date"
                value={form.first_due_date}
                onChange={e => setForm({ ...form, first_due_date: e.target.value })}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>

          {previa && (
            <div className={`p-3 rounded-zela-md border text-sm ${previa.tom === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : previa.tom === 'aviso' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
              <p>{previa.texto}</p>
              {previa.valor ? (
                <p className="mt-1 font-bold">
                  Cada cobrança {CYCLE_LABELS[form.billing_cycle].toLowerCase()}: {centsToBRL(previa.valor)}
                  {form.billing_cycle !== 'MONTHLY' && <span className="font-normal"> · {centsToBRL(valorMensalEquivalente(previa.valor, form.billing_cycle))} por mês</span>}
                </p>
              ) : null}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input type="checkbox" checked={digitar} onChange={e => setDigitar(e.target.checked)} />
            Digitar o valor mensal em vez de usar a tabela de Planos
          </label>
          {digitar && (
            <div>
              <label htmlFor="nm-valor" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Valor mensal (R$)</label>
              <input
                id="nm-valor"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 850,00"
                value={valorManual}
                onChange={e => setValorManual(e.target.value)}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              />
              <p className="text-[11px] text-on-surface-variant/70 mt-1">O desconto da família continua sendo aplicado. A mensalidade fica marcada como valor digitado.</p>
            </div>
          )}

          <div>
            <label htmlFor="nm-forma" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Forma de pagamento</label>
            <select
              id="nm-forma"
              value={form.billing_type}
              onChange={e => setForm({ ...form, billing_type: e.target.value })}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="UNDEFINED">Link de pagamento (família escolhe)</option>
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </div>

          <div>
            <label htmlFor="nm-descricao" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Descrição (opcional)</label>
            <input
              id="nm-descricao"
              type="text"
              placeholder="Ex: Mensalidade · Turma Infantil II"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
            />
          </div>

          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" /> {errorMsg}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition text-sm disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving || !podeEnviar} className="flex-[1.5] bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Criar mensalidade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Alunos que ainda não têm mensalidade (04/10/2026): o ciclo e o turno do
// cadastro já trazem o preço da tabela de Planos e o desconto da família, e a
// Gestão confirma vários de uma vez. Quem ainda não pode receber mensalidade
// aparece com o motivo, em vez de sumir da lista.
function AguardandoMensalidade({ currentUser, versao, onCriou }) {
  const [ctx, setCtx] = useState(null);
  const [aberto, setAberto] = useState(true);
  const [periodicidade, setPeriodicidade] = useState('MONTHLY');
  const [vencimento, setVencimento] = useState('');
  const [forma, setForma] = useState('UNDEFINED');
  const [marcados, setMarcados] = useState({});
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState(null);

  useEffect(() => {
    if (!currentUser?.school_id) return;
    carregarContextoDeMensalidades(currentUser.school_id).then(setCtx).catch(e => setErro(e.message || 'Não foi possível carregar a lista.'));
  }, [currentUser?.school_id, versao]);

  const ano = anoDoPreco(vencimento || todayISO());
  const linhas = useMemo(() => (ctx ? montarLinhasDeMensalidade(ctx, { ano, periodicidade }).filter(l => l.situacao !== 'ja_tem') : []), [ctx, ano, periodicidade]);
  const prontas = linhas.filter(l => l.situacao === 'pronto');
  const escolhidos = prontas.filter(l => marcados[l.aluno.id]);

  useEffect(() => { setMarcados(m => Object.fromEntries(prontas.map(l => [l.aluno.id, m[l.aluno.id] ?? true]))); }, [ctx, ano, periodicidade]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ctx) return erro ? <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700">{erro}</div> : null;
  // Terminou o último aluno: a lista some, mas o resultado continua visível.
  if (linhas.length === 0) {
    if (!resumo) return null;
    return (
      <div className="space-y-1">
        <div className="p-2 bg-green-50 border border-green-200 rounded-zela-md text-sm text-green-700 font-medium flex items-center gap-2"><CheckCircle2 size={16} className="shrink-0" /> {resumo.criados} {resumo.criados === 1 ? 'mensalidade criada' : 'mensalidades criadas'}. Não há mais alunos aguardando.</div>
        {resumo.falhas.length > 0 && <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700">{resumo.falhas.join(' · ')}</div>}
      </div>
    );
  }

  const criar = async () => {
    setErro('');
    setResumo(null);
    if (!vencimento) { setErro('Escolha o 1º vencimento.'); return; }
    setCriando(true);
    try {
      const criados = [];
      const falhas = [];
      for (let i = 0; i < escolhidos.length; i += 40) {
        const lote = escolhidos.slice(i, i + 40);
        const data = await chamarFuncaoFinanceira('create-financial-contracts-batch', {
          mode: 'manual',
          items: lote.map(l => ({ student_id: l.aluno.id, billing_cycle: periodicidade, first_due_date: vencimento, billing_type: forma })),
        });
        for (const r of data.resultados) {
          const nome = lote.find(l => l.aluno.id === r.student_id)?.aluno.name || '';
          if (r.ok) criados.push(nome); else falhas.push(`${nome}: ${r.erro}`);
        }
      }
      setResumo({ criados: criados.length, falhas });
      onCriou();
    } catch (e) {
      setErro(e.message || 'Não foi possível criar as mensalidades.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-zela-lg">
      <button type="button" onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between gap-2 p-3 text-left">
        <span className="text-sm font-bold text-on-surface">Alunos aguardando mensalidade ({linhas.length})</span>
        <span className="text-xs text-on-surface-variant">{prontas.length} {prontas.length === 1 ? 'pronto' : 'prontos'} · {aberto ? 'recolher' : 'ver'}</span>
      </button>
      {aberto && (
        <div className="p-3 pt-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="ag-periodicidade" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Periodicidade</label>
              <select id="ag-periodicidade" value={periodicidade} onChange={e => setPeriodicidade(e.target.value)} className="w-full p-2 bg-white border border-outline-variant rounded-zela-md text-sm">
                {CYCLES.map(c => <option key={c} value={c}>{CYCLE_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ag-vencimento" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">1º vencimento</label>
              <input id="ag-vencimento" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} className="w-full p-2 bg-white border border-outline-variant rounded-zela-md text-sm" />
            </div>
            <div>
              <label htmlFor="ag-forma" className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Forma de pagamento</label>
              <select id="ag-forma" value={forma} onChange={e => setForma(e.target.value)} className="w-full p-2 bg-white border border-outline-variant rounded-zela-md text-sm">
                <option value="UNDEFINED">Link de pagamento</option>
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-on-surface-variant">Preços da tabela de {ano}. O desconto de cada família entra sozinho. Quem estiver sem preço ou sem ciclo e turno se resolve em Financeiro · Planos.</p>

          <ul className="divide-y divide-outline-variant/60 bg-white rounded-zela-md border border-outline-variant">
            {linhas.map(l => (
              <li key={l.aluno.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                {l.situacao === 'pronto' ? (
                  <input type="checkbox" aria-label={`Criar mensalidade de ${l.aluno.name}`} checked={Boolean(marcados[l.aluno.id])} onChange={e => setMarcados(m => ({ ...m, [l.aluno.id]: e.target.checked }))} />
                ) : <span className="w-[13px]" />}
                <span className="font-semibold text-on-surface flex-1 min-w-[160px]">{l.aluno.name}</span>
                <span className="text-xs text-on-surface-variant whitespace-nowrap">{rotuloDoPlano(l.ciclo, l.turno)}</span>
                {l.situacao === 'pronto' ? (
                  <span className="text-xs tabular-nums whitespace-nowrap">
                    <strong>{centsToBRL(l.valorDoCicloCents)}</strong>
                    {l.descontoPercent ? <span className="text-on-surface-variant"> · desconto {l.descontoPercent}%</span> : null}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-800 whitespace-nowrap">
                    {l.situacao === 'sem_preco' && l.ciclo && l.turno ? mensagemSemPreco(l.ciclo, l.turno, ano) : l.situacao === 'sem_plano' ? `Sem ${l.faltando.join(' e sem ')}` : ROTULO_SITUACAO_DA_MENSALIDADE[l.situacao]}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {erro && <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2"><AlertCircle size={16} className="shrink-0" /> {erro}</div>}
          {resumo && (
            <div className="space-y-1">
              <div className="p-2 bg-green-50 border border-green-200 rounded-zela-md text-sm text-green-700 font-medium flex items-center gap-2"><CheckCircle2 size={16} className="shrink-0" /> {resumo.criados} {resumo.criados === 1 ? 'mensalidade criada' : 'mensalidades criadas'}.</div>
              {resumo.falhas.length > 0 && <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700">{resumo.falhas.join(' · ')}</div>}
            </div>
          )}

          <button
            type="button"
            onClick={criar}
            disabled={criando || escolhidos.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50"
          >
            {criando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar {escolhidos.length} {escolhidos.length === 1 ? 'mensalidade' : 'mensalidades'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────── COBRANÇAS ───────────────────────────────

// initialStatus: abre já filtrada (Inadimplência = OVERDUE).
// canRegisterPayment: mostra "Registrar pagamento" (baixa manual; permissão
// financeiro.baixa_manual, conferida de novo no servidor).
export function CobrancasTab({ currentUser, initialStatus = 'all', canRegisterPayment = false }) {
  const [charges, setCharges] = useState([]);
  const [payingCharge, setPayingCharge] = useState(null);
  const [adjustingCharge, setAdjustingCharge] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [isAvulsaModalOpen, setIsAvulsaModalOpen] = useState(false);

  const fetchCharges = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      let query = supabase
        .from('financial_charges')
        .select('id, due_date, amount_cents, original_amount_cents, status, payment_method, payment_link, boleto_url, pix_copy_paste, paid_at, students:student_id(name)')
        .eq('school_id', currentUser.school_id)
        .order('due_date', { ascending: false })
        .limit(200);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      setCharges(data || []);
    } catch (err) {
      console.error('Erro ao buscar cobranças:', err);
      setErrorMsg('Erro ao buscar cobranças: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.school_id, statusFilter]);

  useEffect(() => { fetchCharges(); }, [fetchCharges]);

  const handleReprocess = async () => {
    setIsReprocessing(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('process-payment-webhook', { body: {} });
      if (error) throw error;
      const total = data?.total ?? 0;
      const processed = (data?.results || []).filter(r => r.processed).length;
      setSuccessMsg(total === 0 ? 'Nenhuma pendência encontrada.' : `${processed} de ${total} evento(s) sincronizado(s).`);
      fetchCharges();
    } catch (err) {
      console.error('Erro ao reprocessar pendências:', err);
      setErrorMsg('Erro ao reprocessar: ' + err.message);
    } finally {
      setIsReprocessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-on-surface-variant uppercase">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="p-1.5 bg-white border border-outline-variant rounded-zela-md text-sm"
          >
            <option value="all">Todos</option>
            {Object.keys(CHARGE_STATUS_LABELS).map(s => <option key={s} value={s}>{CHARGE_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={fetchCharges} title="Atualizar" className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md transition">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleReprocess}
            disabled={isReprocessing}
            title="Tenta sincronizar novamente eventos de webhook que ainda não viraram cobrança"
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-container-low hover:bg-primary/10 hover:text-primary border border-outline-variant text-on-surface-variant font-bold rounded-zela-md transition text-sm disabled:opacity-50"
          >
            {isReprocessing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Reprocessar pendências
          </button>
          <button
            onClick={() => setIsAvulsaModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md shadow-sm transition text-sm"
          >
            <Plus size={16} /> Cobrança avulsa
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" /> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-2 bg-green-50 border border-green-200 rounded-zela-md text-sm text-green-700 font-medium flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" /> {successMsg}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-variant"><Loader2 className="animate-spin" size={24} /></div>
      ) : charges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
          <Receipt className="text-outline-variant mb-2" size={32} />
          <p className="text-on-surface-variant font-medium text-sm">Nenhuma cobrança encontrada.</p>
          <p className="text-on-surface-variant/70 text-xs mt-1">Cobranças aparecem aqui quando o Asaas emite e envia o webhook.</p>
        </div>
      ) : (
        <ResponsiveTable
          rows={charges}
          columns={[
            { label: 'Aluno', primary: true, render: c => c.students?.name || '·' },
            { label: 'Vencimento', render: c => (c.due_date ? new Date(c.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '·') },
            {
              label: 'Valor', className: 'font-bold',
              render: c => (
                <span>
                  {centsToBRL(c.amount_cents)}
                  {c.original_amount_cents && c.original_amount_cents !== c.amount_cents && (
                    <span className="block text-[11px] font-normal text-on-surface-variant line-through">{centsToBRL(c.original_amount_cents)}</span>
                  )}
                </span>
              ),
            },
            { label: 'Método', className: 'uppercase text-xs text-on-surface-variant', render: c => c.payment_method || '·' },
            {
              label: 'Status',
              render: c => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${CHARGE_STATUS_CLASSES[c.status] || ''}`}>
                  {CHARGE_STATUS_LABELS[c.status] || c.status}
                </span>
              ),
            },
            {
              label: 'Link',
              render: c => {
                const link = c.payment_link || c.boleto_url;
                return link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                    Abrir <ExternalLink size={12} />
                  </a>
                ) : '·';
              },
            },
            ...(canRegisterPayment ? [{
              label: '', actions: true, align: 'right',
              render: c => ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'].includes(c.status) && (
                <span className="inline-flex items-center gap-3">
                  <button onClick={() => setAdjustingCharge(c)} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline whitespace-nowrap">
                    <Percent size={13} /> Ajustar valor
                  </button>
                  <button onClick={() => setPayingCharge(c)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline whitespace-nowrap">
                    <HandCoins size={13} /> Registrar pagamento
                  </button>
                </span>
              ),
            }] : []),
          ]}
        />
      )}

      {payingCharge && (
        <RegistrarPagamentoModal
          currentUser={currentUser}
          charge={payingCharge}
          onClose={() => setPayingCharge(null)}
          onDone={() => { setPayingCharge(null); setSuccessMsg('Pagamento registrado.'); fetchCharges(); }}
        />
      )}

      {adjustingCharge && (
        <AjustarCobrancaModal
          charge={adjustingCharge}
          onClose={() => setAdjustingCharge(null)}
          onDone={() => { setAdjustingCharge(null); setSuccessMsg('Valor da cobrança ajustado.'); fetchCharges(); }}
        />
      )}

      {isAvulsaModalOpen && (
        <NovaCobrancaAvulsaModal
          currentUser={currentUser}
          onClose={() => setIsAvulsaModalOpen(false)}
          onCreated={() => { setIsAvulsaModalOpen(false); fetchCharges(); }}
        />
      )}
    </div>
  );
}

// Ajuste do valor de UMA cobrança em aberto (04/10/2026), por exemplo um
// desconto especial em um mês. O Asaas é atualizado primeiro (Edge Function
// adjust-charge); o valor original fica guardado e o motivo vai para a
// auditoria, sem aparecer para a família.
function AjustarCobrancaModal({ charge, onClose, onDone }) {
  const [valor, setValor] = useState((charge.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  const [motivo, setMotivo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const novoCents = (() => {
    const n = parseFloat(String(valor).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  })();
  const base = charge.original_amount_cents || charge.amount_cents;
  const diferenca = novoCents ? novoCents - charge.amount_cents : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!novoCents) { setErrorMsg('Informe o novo valor, maior que zero.'); return; }
    if (novoCents === charge.amount_cents) { setErrorMsg('O novo valor é igual ao atual.'); return; }
    if (motivo.trim().length < 3) { setErrorMsg('Informe o motivo do ajuste.'); return; }
    setIsSaving(true);
    try {
      await chamarFuncaoFinanceira('adjust-charge', { charge_id: charge.id, new_amount_cents: novoCents, reason: motivo.trim() });
      onDone();
    } catch (err) {
      setErrorMsg(err.message || 'Não foi possível ajustar o valor.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-on-surface">Ajustar valor da cobrança</h3>
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-full transition"><X size={18} /></button>
        </div>
        <p className="text-sm text-on-surface-variant mb-3">
          {charge.students?.name || 'Aluno'} · vence em {charge.due_date ? new Date(charge.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '·'} · valor atual <strong>{centsToBRL(charge.amount_cents)}</strong>
          {base !== charge.amount_cents && <span> (original {centsToBRL(base)})</span>}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="aj-valor" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Novo valor (R$)</label>
            <input id="aj-valor" type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm" />
            {novoCents > 0 && diferenca !== 0 && (
              <p className={`text-xs mt-1 font-bold ${diferenca < 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {diferenca < 0 ? `Desconto de ${centsToBRL(-diferenca)} nesta cobrança` : `Acréscimo de ${centsToBRL(diferenca)} nesta cobrança`}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="aj-motivo" className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Motivo</label>
            <input id="aj-motivo" type="text" placeholder="Ex: Desconto especial de março" value={motivo} onChange={e => setMotivo(e.target.value)}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm" />
            <p className="text-[11px] text-on-surface-variant/70 mt-1">O motivo fica na auditoria. A família não vê.</p>
          </div>
          <p className="text-xs text-on-surface-variant">Só vale para esta cobrança. As próximas continuam com o valor da mensalidade.</p>
          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" /> {errorMsg}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition text-sm disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isSaving} className="flex-[1.5] bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Ajustar valor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NovaCobrancaAvulsaModal({ currentUser, onClose, onCreated }) {
  const [students, setStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [form, setForm] = useState({
    student_id: '',
    amount_cents: '',
    due_date: '',
    billing_type: 'UNDEFINED',
    description: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      if (!currentUser?.school_id) return;
      setIsLoadingStudents(true);
      const { data, error } = await supabase
        .from('students')
        .select('id, name')
        .eq('school_id', currentUser.school_id)
        .order('name', { ascending: true });
      if (!error) setStudents(data || []);
      setIsLoadingStudents(false);
    })();
  }, [currentUser?.school_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!form.student_id || !form.amount_cents || !form.due_date) {
      setErrorMsg('Preencha aluno, valor e vencimento.');
      return;
    }
    setIsSaving(true);
    try {
      const amountReais = parseFloat(String(form.amount_cents).replace(',', '.'));
      if (!amountReais || amountReais <= 0) throw new Error('Valor inválido.');

      const { data, error } = await supabase.functions.invoke('create-avulsa-charge', {
        body: {
          student_id: form.student_id,
          amount_cents: Math.round(amountReais * 100),
          due_date: form.due_date,
          billing_type: form.billing_type,
          description: form.description || undefined,
        },
      });
      if (error) {
        const serverMsg = error.context?.json ? await error.context.json().then(b => b?.error).catch(() => null) : null;
        throw new Error(serverMsg || error.message);
      }
      if (data?.error) throw new Error(data.error);
      onCreated();
    } catch (err) {
      console.error('Erro ao criar cobrança avulsa:', err);
      setErrorMsg(err.message || 'Erro ao criar cobrança.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-on-surface">Nova cobrança avulsa</h3>
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-full transition"><X size={18} /></button>
        </div>
        <p className="text-xs text-on-surface-variant -mt-2 mb-4">Cobrança única, fora da mensalidade: taxa de matrícula, material, multa etc.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Aluno</label>
            <select
              required
              value={form.student_id}
              onChange={e => setForm({ ...form, student_id: e.target.value })}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              disabled={isLoadingStudents}
            >
              <option value="">{isLoadingStudents ? 'Carregando alunos...' : 'Selecione um aluno'}</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Valor (R$)</label>
              <input
                required
                type="text"
                inputMode="decimal"
                placeholder="Ex: 150,00"
                value={form.amount_cents}
                onChange={e => setForm({ ...form, amount_cents: e.target.value })}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Vencimento</label>
              <input
                required
                type="date"
                value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Forma de pagamento</label>
            <select
              value={form.billing_type}
              onChange={e => setForm({ ...form, billing_type: e.target.value })}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="UNDEFINED">Link de pagamento (família escolhe)</option>
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Descrição (opcional)</label>
            <input
              type="text"
              placeholder="Ex: Taxa de matrícula 2027"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
            />
          </div>

          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" /> {errorMsg}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition text-sm disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="flex-[1.5] bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Criar cobrança'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────── CONFIGURAÇÃO ───────────────────────────────

export function ConfigTab({ currentUser }) {
  const [gatewayStatus, setGatewayStatus] = useState({ asaas: null, asaas_webhook: null });
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [webhookTokenInput, setWebhookTokenInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [keyMsg, setKeyMsg] = useState({ type: '', text: '' });
  const [webhookMsg, setWebhookMsg] = useState({ type: '', text: '' });

  const [discountRows, setDiscountRows] = useState([]);
  const [isLoadingDiscounts, setIsLoadingDiscounts] = useState(true);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [editingGuardianId, setEditingGuardianId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [discountMsg, setDiscountMsg] = useState({ type: '', text: '' });

  const fetchGatewayStatus = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setIsLoadingStatus(true);
    const { data, error } = await supabase
      .from('school_gateway_accounts')
      .select('gateway, updated_at, pix_key_registered')
      .eq('school_id', currentUser.school_id);
    if (!error) {
      const byGateway = {};
      (data || []).forEach(row => { byGateway[row.gateway] = row; });
      setGatewayStatus({ asaas: byGateway.asaas || null, asaas_webhook: byGateway.asaas_webhook || null });
    }
    setIsLoadingStatus(false);
  }, [currentUser?.school_id]);

  const fetchDiscounts = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setIsLoadingDiscounts(true);
    const { data, error } = await supabase
      .from('financial_billing_discounts')
      .select('guardian_id, billing_cycle, discount_percent, guardian:guardian_id(name, email)')
      .eq('school_id', currentUser.school_id);
    if (!error) {
      // Agrupa as até 4 linhas (1 por ciclo) de cada responsável numa única
      // linha de exibição — a UI trata "desconto de um responsável" como
      // uma unidade, mesmo o banco guardando 1 linha por ciclo.
      const byGuardian = {};
      (data || []).forEach(row => {
        if (!byGuardian[row.guardian_id]) {
          byGuardian[row.guardian_id] = { guardian_id: row.guardian_id, guardian: row.guardian, percents: {} };
        }
        byGuardian[row.guardian_id].percents[row.billing_cycle] = row.discount_percent;
      });
      setDiscountRows(Object.values(byGuardian));
    }
    setIsLoadingDiscounts(false);
  }, [currentUser?.school_id]);

  useEffect(() => { fetchGatewayStatus(); fetchDiscounts(); }, [fetchGatewayStatus, fetchDiscounts]);

  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    setKeyMsg({ type: '', text: '' });
    try {
      const { data, error } = await supabase.functions.invoke('set-school-gateway-key', {
        body: { gateway: 'asaas', api_key: apiKeyInput.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setKeyMsg({ type: 'success', text: 'Chave Asaas validada e salva com sucesso.' });
      setApiKeyInput('');
      fetchGatewayStatus();
    } catch (err) {
      console.error('Erro ao salvar chave Asaas:', err);
      setKeyMsg({ type: 'error', text: err.message || 'Erro ao salvar a chave.' });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSaveWebhookToken = async (e) => {
    e.preventDefault();
    if (!webhookTokenInput.trim()) return;
    setIsSavingWebhook(true);
    setWebhookMsg({ type: '', text: '' });
    try {
      const { data, error } = await supabase.functions.invoke('set-school-gateway-key', {
        body: { gateway: 'asaas_webhook', api_key: webhookTokenInput.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setWebhookMsg({ type: 'success', text: 'Token de webhook salvo com sucesso.' });
      setWebhookTokenInput('');
      fetchGatewayStatus();
    } catch (err) {
      console.error('Erro ao salvar token de webhook:', err);
      setWebhookMsg({ type: 'error', text: err.message || 'Erro ao salvar o token.' });
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleRemoveDiscount = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from('financial_billing_discounts')
        .delete()
        .eq('school_id', currentUser.school_id)
        .eq('guardian_id', removeTarget.guardian_id);
      if (error) throw error;
      setRemoveTarget(null);
      fetchDiscounts();
    } catch (err) {
      console.error('Erro ao remover desconto:', err);
      setDiscountMsg({ type: 'error', text: err.message || 'Erro ao remover desconto.' });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Chave Asaas */}
      <div className="p-4 bg-surface-container-low rounded-zela-lg border border-outline-variant">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-on-surface">Conta Asaas desta escola</h3>
        </div>
        <p className="text-xs text-on-surface-variant mb-3">
          Cada escola usa sua própria conta Asaas: o dinheiro cai direto para ela, nunca para outra escola.
          {!isLoadingStatus && gatewayStatus.asaas && (
            <span className="block mt-1 text-green-700 font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Configurada em {new Date(gatewayStatus.asaas.updated_at).toLocaleString('pt-BR')}</span>
          )}
          {!isLoadingStatus && !gatewayStatus.asaas && (
            <span className="block mt-1 text-amber-600 font-bold">Ainda não configurada.</span>
          )}
        </p>
        <form onSubmit={handleSaveApiKey} className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            placeholder={gatewayStatus.asaas ? 'Cole aqui para trocar a chave' : 'Cole a chave de API do Asaas ($aact_...)'}
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            className="flex-1 p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
          />
          <button type="submit" disabled={isSavingKey || !apiKeyInput.trim()} className="px-4 py-2.5 bg-primary hover:bg-primary-container disabled:opacity-50 text-white font-bold rounded-zela-md shadow-sm transition text-sm shrink-0 flex items-center justify-center gap-2">
            {isSavingKey ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
          </button>
        </form>
        {keyMsg.text && (
          <p className={`text-xs mt-2 font-medium ${keyMsg.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{keyMsg.text}</p>
        )}
      </div>

      {/* Token de Webhook */}
      <div className="p-4 bg-surface-container-low rounded-zela-lg border border-outline-variant">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-on-surface">Token de webhook</h3>
        </div>
        <p className="text-xs text-on-surface-variant mb-3">
          Ao criar o webhook no painel Asaas desta escola, defina um token (authToken) e cole-o aqui: é assim que sabemos que um evento recebido pertence a esta escola.
          {!isLoadingStatus && gatewayStatus.asaas_webhook && (
            <span className="block mt-1 text-green-700 font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Configurado em {new Date(gatewayStatus.asaas_webhook.updated_at).toLocaleString('pt-BR')}</span>
          )}
          {!isLoadingStatus && !gatewayStatus.asaas_webhook && (
            <span className="block mt-1 text-amber-600 font-bold">Ainda não configurado.</span>
          )}
        </p>
        <form onSubmit={handleSaveWebhookToken} className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            placeholder={gatewayStatus.asaas_webhook ? 'Cole aqui para trocar o token' : 'Cole o mesmo token definido no Asaas'}
            value={webhookTokenInput}
            onChange={e => setWebhookTokenInput(e.target.value)}
            className="flex-1 p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
          />
          <button type="submit" disabled={isSavingWebhook || !webhookTokenInput.trim()} className="px-4 py-2.5 bg-primary hover:bg-primary-container disabled:opacity-50 text-white font-bold rounded-zela-md shadow-sm transition text-sm shrink-0 flex items-center justify-center gap-2">
            {isSavingWebhook ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
          </button>
        </form>
        {webhookMsg.text && (
          <p className={`text-xs mt-2 font-medium ${webhookMsg.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{webhookMsg.text}</p>
        )}
      </div>

      {/* Descontos por responsável */}
      <div className="p-4 bg-surface-container-low rounded-zela-lg border border-outline-variant">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Percent size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-on-surface">Desconto por responsável</h3>
          </div>
          <button
            onClick={() => { setEditingGuardianId(null); setIsDiscountModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md shadow-sm transition text-xs shrink-0"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>
        <p className="text-xs text-on-surface-variant mb-3">
          O desconto é específico de cada responsável financeiro já cadastrado nesta escola, aplicado automaticamente conforme o ciclo escolhido ao criar o contrato dele.
        </p>

        {discountMsg.text && (
          <p className={`text-xs mb-2 font-medium ${discountMsg.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{discountMsg.text}</p>
        )}

        {isLoadingDiscounts ? (
          <div className="flex items-center justify-center py-6 text-on-surface-variant"><Loader2 className="animate-spin" size={20} /></div>
        ) : discountRows.length === 0 ? (
          <p className="text-xs text-on-surface-variant/70 italic py-2">Nenhum desconto configurado ainda.</p>
        ) : (
          <div className="space-y-2">
            {discountRows.map(row => (
              <div key={row.guardian_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-outline-variant rounded-zela-md">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">{row.guardian?.name || '—'}</p>
                  <p className="text-xs text-on-surface-variant/70 truncate">{row.guardian?.email}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {CYCLES.filter(c => Number(row.percents[c]) > 0).map(c => (
                    <span key={c} className="text-xs font-bold text-on-surface-variant">{CYCLE_LABELS[c]}: <span className="text-primary">{row.percents[c]}%</span></span>
                  ))}
                  {CYCLES.every(c => !(Number(row.percents[c]) > 0)) && (
                    <span className="text-xs text-on-surface-variant/60 italic">0% em todos os ciclos</span>
                  )}
                  <button
                    onClick={() => { setEditingGuardianId(row.guardian_id); setIsDiscountModalOpen(true); }}
                    className="text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-zela-md transition shrink-0"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setRemoveTarget(row)}
                    className="text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-zela-md transition shrink-0"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isDiscountModalOpen && (
        <DescontoResponsavelModal
          currentUser={currentUser}
          existingRow={discountRows.find(r => r.guardian_id === editingGuardianId) || null}
          excludeGuardianIds={discountRows.filter(r => r.guardian_id !== editingGuardianId).map(r => r.guardian_id)}
          onClose={() => setIsDiscountModalOpen(false)}
          onSaved={() => { setIsDiscountModalOpen(false); fetchDiscounts(); }}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remover desconto"
          message={`Remover o desconto configurado para ${removeTarget.guardian?.name || 'este responsável'}? Contratos já existentes não são afetados, só novos contratos deixam de aplicar esse desconto.`}
          confirmLabel="Remover"
          danger
          isLoading={isRemoving}
          onConfirm={handleRemoveDiscount}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

function DescontoResponsavelModal({ currentUser, existingRow, excludeGuardianIds, onClose, onSaved }) {
  const [guardians, setGuardians] = useState([]);
  const [isLoadingGuardians, setIsLoadingGuardians] = useState(!existingRow);
  const [guardianId, setGuardianId] = useState(existingRow?.guardian_id || '');
  const [percents, setPercents] = useState(() => {
    const initial = {};
    CYCLES.forEach(c => { initial[c] = existingRow?.percents?.[c] != null ? String(existingRow.percents[c]) : '0'; });
    return initial;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (existingRow) return; // editando: já sabemos o responsável, não precisa listar
    (async () => {
      if (!currentUser?.school_id) return;
      setIsLoadingGuardians(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('school_id', currentUser.school_id)
        .eq('role', 'family')
        .order('name', { ascending: true });
      if (!error) setGuardians((data || []).filter(g => !excludeGuardianIds.includes(g.id)));
      setIsLoadingGuardians(false);
    })();
  }, [currentUser?.school_id, existingRow, excludeGuardianIds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!guardianId) {
      setErrorMsg('Selecione um responsável.');
      return;
    }
    setIsSaving(true);
    try {
      const rows = CYCLES.map(c => ({
        school_id: currentUser.school_id,
        guardian_id: guardianId,
        billing_cycle: c,
        discount_percent: parseFloat(String(percents[c]).replace(',', '.')) || 0,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('financial_billing_discounts')
        .upsert(rows, { onConflict: 'school_id,guardian_id,billing_cycle' });
      if (error) throw error;
      onSaved();
    } catch (err) {
      console.error('Erro ao salvar desconto do responsável:', err);
      setErrorMsg(err.message || 'Erro ao salvar desconto.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-on-surface">{existingRow ? 'Editar desconto' : 'Novo desconto por responsável'}</h3>
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-full transition"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Responsável financeiro</label>
            {existingRow ? (
              <div className="p-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md text-sm font-bold text-on-surface">
                {existingRow.guardian?.name}
              </div>
            ) : (
              <select
                required
                value={guardianId}
                onChange={e => setGuardianId(e.target.value)}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
                disabled={isLoadingGuardians}
              >
                <option value="">{isLoadingGuardians ? 'Carregando...' : 'Selecione um responsável'}</option>
                {guardians.map(g => <option key={g.id} value={g.id}>{g.name} · {g.email}</option>)}
              </select>
            )}
            {!existingRow && !isLoadingGuardians && guardians.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Nenhuma família cadastrada nesta escola ainda (ou todas já têm desconto configurado).</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Desconto por ciclo</label>
            <div className="grid grid-cols-2 gap-2">
              {CYCLES.map(c => (
                <div key={c}>
                  <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase mb-0.5">{CYCLE_LABELS[c]}</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={percents[c]}
                      onChange={e => setPercents({ ...percents, [c]: e.target.value })}
                      className="w-full p-2 pr-6 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" /> {errorMsg}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition text-sm disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="flex-[1.5] bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


const MANUAL_METHODS = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX direto na conta da escola' },
  { value: 'transfer', label: 'Transferência bancária' },
  { value: 'other', label: 'Outro' },
];

// Baixa manual: avisa o Asaas ("recebido em dinheiro") e só então dá baixa
// no Zela (Edge Function register-manual-payment).
export function RegistrarPagamentoModal({ currentUser, charge, onClose, onDone, presetDate, presetAmountCents }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [date, setDate] = useState(presetDate || today);
  const [amount, setAmount] = useState(((presetAmountCents ?? charge.amount_cents) / 100).toFixed(2).replace('.', ','));
  const [method, setMethod] = useState('pix');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    const amountCents = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100);
    if (!amountCents || amountCents <= 0) { setError('Informe o valor recebido.'); return; }
    setIsSaving(true);
    try {
      let receiptPath = null;
      if (file) {
        receiptPath = `${currentUser.school_id}/recebimentos/${charge.id}-${buildSafeFileName(file)}`;
        await uploadFile('expense-attachments', receiptPath, file);
      }
      const { data, error: fnError } = await supabase.functions.invoke('register-manual-payment', {
        body: { charge_id: charge.id, payment_date: date, amount_cents: amountCents, method, note: note.trim() || null, receipt_path: receiptPath },
      });
      if (fnError || data?.error) {
        let msg = data?.error;
        if (!msg && fnError?.context && typeof fnError.context.json === 'function') {
          try { msg = (await fnError.context.json())?.error; } catch { /* corpo não era JSON */ }
        }
        throw new Error(msg || fnError?.message || 'Erro ao registrar pagamento.');
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-zela-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-on-surface">Registrar pagamento</h3>
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:bg-surface-container rounded-zela-md" aria-label="Fechar"><X size={18} /></button>
        </div>
        <p className="text-xs text-on-surface-variant">
          {charge.students?.name || 'Aluno'} · vencimento {charge.due_date ? new Date(charge.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '·'} · {centsToBRL(charge.amount_cents)}.
          O Asaas é avisado de que a cobrança foi paga por fora e deixa de cobrar a família.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[11px] font-bold uppercase text-on-surface-variant">Data do pagamento
            <input id="manual-payment-date" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className="mt-1 w-full p-2 border border-outline-variant rounded-zela-md text-sm" />
          </label>
          <label className="text-[11px] font-bold uppercase text-on-surface-variant">Valor recebido (R$)
            <input id="manual-payment-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 w-full p-2 border border-outline-variant rounded-zela-md text-sm" />
          </label>
        </div>
        <label className="block text-[11px] font-bold uppercase text-on-surface-variant">Forma de pagamento
          <select id="manual-payment-method" value={method} onChange={e => setMethod(e.target.value)} className="mt-1 w-full p-2 border border-outline-variant rounded-zela-md text-sm">
            {MANUAL_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="block text-[11px] font-bold uppercase text-on-surface-variant">Observação
          <input id="manual-payment-note" value={note} onChange={e => setNote(e.target.value)} className="mt-1 w-full p-2 border border-outline-variant rounded-zela-md text-sm" />
        </label>
        <label className="block text-[11px] font-bold uppercase text-on-surface-variant">Comprovante (opcional)
          <input id="manual-payment-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs" />
        </label>
        {error && <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container rounded-zela-md">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-zela-md text-sm disabled:opacity-50">
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <HandCoins size={14} />} Confirmar recebimento
          </button>
        </div>
      </div>
    </div>
  );
}
