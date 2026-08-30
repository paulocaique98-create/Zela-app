import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, AlertCircle, Loader2, Receipt, ExternalLink, Copy, Check, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CYCLE_LABELS = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual' };

const CHARGE_STATUS_LABELS = { PENDING: 'Pendente', AWAITING_PAYMENT: 'Aguardando pagamento', PAID: 'Pago', OVERDUE: 'Atrasado', CANCELLED: 'Cancelado', REFUNDED: 'Estornado', FAILED: 'Falhou' };
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

// Só o responsável FINANCEIRO de verdade (is_financial_guardian(), checado
// antes de montar este menu no FamilyPortal) chega até aqui — leitura
// apenas, RLS já garante que só vê as próprias cobranças (Fase 6).
export default function FamilyFinanceiro() {
  const [contracts, setContracts] = useState([]);
  const [charges, setCharges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [contractsRes, chargesRes] = await Promise.all([
        supabase
          .from('financial_contracts')
          .select('id, billing_cycle, amount_cents, status, students:student_id(name)')
          .eq('status', 'active'),
        supabase
          .from('financial_charges')
          .select('id, due_date, amount_cents, status, payment_method, payment_link, boleto_url, pix_copy_paste, paid_at, students:student_id(name)')
          .order('due_date', { ascending: false }),
      ]);
      if (contractsRes.error) throw contractsRes.error;
      if (chargesRes.error) throw chargesRes.error;
      setContracts(contractsRes.data || []);
      setCharges(chargesRes.data || []);
    } catch (err) {
      console.error('Erro ao buscar dados financeiros:', err);
      setErrorMsg('Erro ao carregar seus dados financeiros: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCopyPix = async (id, code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Erro ao copiar código PIX:', err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white p-3 md:p-4 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
          <Wallet size={22} />
        </div>
        <h2 className="text-xl font-black text-on-surface">Financeiro</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {errorMsg && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" /> {errorMsg}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant"><Loader2 className="animate-spin" size={24} /></div>
        ) : (
          <>
            {/* Contratos ativos */}
            {contracts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase">Meus contratos ativos</h3>
                {contracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 bg-surface-container-low border border-outline-variant rounded-zela-md">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{c.students?.name || '—'}</p>
                      <p className="text-xs text-on-surface-variant">{CYCLE_LABELS[c.billing_cycle] || c.billing_cycle}</p>
                    </div>
                    <p className="text-sm font-black text-primary shrink-0">{centsToBRL(c.amount_cents)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Cobranças */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase">Cobranças</h3>
              {charges.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
                  <Receipt className="text-outline-variant mb-2" size={32} />
                  <p className="text-on-surface-variant font-medium text-sm">Nenhuma cobrança por aqui ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {charges.map(charge => {
                    const isOpen = ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'].includes(charge.status);
                    return (
                      <div key={charge.id} className={`p-3 border rounded-zela-lg ${charge.status === 'OVERDUE' ? 'bg-red-50/40 border-red-200' : 'bg-white border-outline-variant'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-on-surface truncate">{charge.students?.name || '—'}</p>
                            <p className="text-xs text-on-surface-variant">
                              Vencimento: {charge.due_date ? new Date(charge.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-base font-black text-on-surface">{centsToBRL(charge.amount_cents)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${CHARGE_STATUS_CLASSES[charge.status] || ''}`}>
                              {CHARGE_STATUS_LABELS[charge.status] || charge.status}
                            </span>
                          </div>
                        </div>

                        {charge.status === 'PAID' && charge.paid_at && (
                          <p className="text-xs text-green-700 font-bold flex items-center gap-1 mt-1">
                            <CheckCircle2 size={13} /> Pago em {new Date(charge.paid_at).toLocaleDateString('pt-BR')}
                          </p>
                        )}

                        {isOpen && (
                          <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-outline-variant/50">
                            {charge.pix_copy_paste && (
                              <button
                                onClick={() => handleCopyPix(charge.id, charge.pix_copy_paste)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold rounded-zela-md transition text-xs"
                              >
                                {copiedId === charge.id ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> PIX Copia e Cola</>}
                              </button>
                            )}
                            {charge.boleto_url && (
                              <a href={charge.boleto_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-low hover:bg-primary/10 hover:text-primary border border-outline-variant text-on-surface-variant font-bold rounded-zela-md transition text-xs">
                                <ExternalLink size={13} /> Ver boleto
                              </a>
                            )}
                            {charge.payment_link && (
                              <a href={charge.payment_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md transition text-xs">
                                <ExternalLink size={13} /> Pagar agora
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
