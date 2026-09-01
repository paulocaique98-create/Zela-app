import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, X, AlertCircle, Loader2, RefreshCw, KeyRound, Percent, FileText, Receipt, Settings2, CheckCircle2, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';

const CYCLE_LABELS = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual' };
const CYCLES = ['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'];

const CONTRACT_STATUS_LABELS = { active: 'Ativo', paused: 'Pausado', cancelled: 'Cancelado' };
const CONTRACT_STATUS_CLASSES = {
  active: 'bg-green-50 text-green-700 border-green-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const CHARGE_STATUS_LABELS = { PENDING: 'Pendente', AWAITING_PAYMENT: 'Aguardando', PAID: 'Pago', OVERDUE: 'Atrasado', CANCELLED: 'Cancelado', REFUNDED: 'Estornado', FAILED: 'Falhou' };
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
    <div className="h-full flex flex-col bg-white p-3 md:p-4 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
          <Wallet size={22} />
        </div>
        <h2 className="text-xl font-black text-on-surface">Financeiro</h2>
      </div>

      {/* Sub-abas */}
      <div className="flex gap-1 mb-3 border-b border-outline-variant shrink-0 -mt-1">
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

function ContratosTab({ currentUser }) {
  const [contracts, setContracts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchContracts = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('financial_contracts')
        .select('id, billing_cycle, amount_cents, status, first_due_date, gateway_subscription_id, created_at, students:student_id(name), guardian:financial_guardian_id(name, email)')
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
        <p className="text-xs text-on-surface-variant">Contratos financeiros (mensalidades) vinculados a alunos desta escola.</p>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={fetchContracts} title="Atualizar" className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md transition">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md shadow-sm transition text-sm"
          >
            <Plus size={16} /> Novo contrato
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" /> {errorMsg}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-variant"><Loader2 className="animate-spin" size={24} /></div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
          <FileText className="text-outline-variant mb-2" size={32} />
          <p className="text-on-surface-variant font-medium text-sm">Nenhum contrato criado ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
                <th className="py-2 pr-3">Aluno</th>
                <th className="py-2 pr-3">Responsável</th>
                <th className="py-2 pr-3">Ciclo</th>
                <th className="py-2 pr-3">Valor</th>
                <th className="py-2 pr-3">1º Vencimento</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => (
                <tr key={c.id} className="border-b border-outline-variant/50">
                  <td className="py-2 pr-3 font-medium text-on-surface">{c.students?.name || '—'}</td>
                  <td className="py-2 pr-3 text-on-surface-variant">{c.guardian?.name || '—'}</td>
                  <td className="py-2 pr-3">{CYCLE_LABELS[c.billing_cycle] || c.billing_cycle}</td>
                  <td className="py-2 pr-3 font-bold">{centsToBRL(c.amount_cents)}</td>
                  <td className="py-2 pr-3">{c.first_due_date ? new Date(c.first_due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${CONTRACT_STATUS_CLASSES[c.status] || ''}`}>
                      {CONTRACT_STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {c.status === 'active' && (
                      <button
                        onClick={() => setCancelTarget(c)}
                        className="text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-zela-md transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <NovoContratoModal
          currentUser={currentUser}
          onClose={() => setIsModalOpen(false)}
          onCreated={() => { setIsModalOpen(false); fetchContracts(); }}
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
  const [students, setStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [form, setForm] = useState({
    student_id: '',
    billing_cycle: 'MONTHLY',
    base_monthly_amount_cents: '',
    first_due_date: '',
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
    if (!form.student_id || !form.base_monthly_amount_cents || !form.first_due_date) {
      setErrorMsg('Preencha aluno, valor mensal base e data do 1º vencimento.');
      return;
    }
    setIsSaving(true);
    try {
      const amountReais = parseFloat(String(form.base_monthly_amount_cents).replace(',', '.'));
      if (!amountReais || amountReais <= 0) throw new Error('Valor mensal inválido.');

      const { data, error } = await supabase.functions.invoke('create-financial-contract', {
        body: {
          student_id: form.student_id,
          billing_cycle: form.billing_cycle,
          base_monthly_amount_cents: Math.round(amountReais * 100),
          first_due_date: form.first_due_date,
          billing_type: form.billing_type,
          description: form.description || undefined,
        },
      });
      if (error) {
        const serverMsg = error.context?.body ? await parseFnErrorBody(error) : null;
        throw new Error(serverMsg || error.message);
      }
      if (data?.error) throw new Error(data.error);
      onCreated();
    } catch (err) {
      console.error('Erro ao criar contrato:', err);
      setErrorMsg(err.message || 'Erro ao criar contrato.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-on-surface">Novo contrato financeiro</h3>
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-full transition"><X size={18} /></button>
        </div>

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
            {!isLoadingStudents && students.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Nenhum aluno cadastrado ainda nesta escola.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Ciclo de cobrança</label>
              <select
                value={form.billing_cycle}
                onChange={e => setForm({ ...form, billing_cycle: e.target.value })}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              >
                {CYCLES.map(c => <option key={c} value={c}>{CYCLE_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Valor mensal base (R$)</label>
              <input
                required
                type="text"
                inputMode="decimal"
                placeholder="Ex: 850,00"
                value={form.base_monthly_amount_cents}
                onChange={e => setForm({ ...form, base_monthly_amount_cents: e.target.value })}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-on-surface-variant -mt-1">
            O valor final por ciclo é calculado no servidor (mensal × meses do ciclo, com o desconto configurado em Configuração aplicado automaticamente).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">1º Vencimento</label>
              <input
                required
                type="date"
                value={form.first_due_date}
                onChange={e => setForm({ ...form, first_due_date: e.target.value })}
                className="w-full p-2.5 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
              />
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
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Descrição (opcional)</label>
            <input
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
            <button type="submit" disabled={isSaving} className="flex-[1.5] bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Criar contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function parseFnErrorBody(error) {
  try {
    const body = await error.context.json();
    return body?.error || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────── COBRANÇAS ───────────────────────────────

function CobrancasTab({ currentUser }) {
  const [charges, setCharges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAvulsaModalOpen, setIsAvulsaModalOpen] = useState(false);

  const fetchCharges = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      let query = supabase
        .from('financial_charges')
        .select('id, due_date, amount_cents, status, payment_method, payment_link, boleto_url, pix_copy_paste, paid_at, students:student_id(name)')
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
                <th className="py-2 pr-3">Aluno</th>
                <th className="py-2 pr-3">Vencimento</th>
                <th className="py-2 pr-3">Valor</th>
                <th className="py-2 pr-3">Método</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Link</th>
              </tr>
            </thead>
            <tbody>
              {charges.map(c => {
                const link = c.payment_link || c.boleto_url;
                return (
                  <tr key={c.id} className="border-b border-outline-variant/50">
                    <td className="py-2 pr-3 font-medium text-on-surface">{c.students?.name || '—'}</td>
                    <td className="py-2 pr-3">{c.due_date ? new Date(c.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="py-2 pr-3 font-bold">{centsToBRL(c.amount_cents)}</td>
                    <td className="py-2 pr-3 uppercase text-xs text-on-surface-variant">{c.payment_method || '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${CHARGE_STATUS_CLASSES[c.status] || ''}`}>
                        {CHARGE_STATUS_LABELS[c.status] || c.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                          Abrir <ExternalLink size={12} />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

function ConfigTab({ currentUser }) {
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
