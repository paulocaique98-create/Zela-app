import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Loader2, Receipt, ExternalLink, Copy, Check, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CYCLE_LABELS = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual' };

const CHARGE_STATUS_LABELS = { PENDING: 'Pendente', AWAITING_PAYMENT: 'Aguardando pagamento', PAID: 'Pago', OVERDUE: 'Atrasado', CANCELLED: 'Cancelado', REFUNDED: 'Estornado', FAILED: 'Falhou' };
const CHARGE_STATUS_CLASSES = {
  PENDING: 'bg-surface-container text-on-surface border-outline-variant',
  AWAITING_PAYMENT: 'bg-primary/10 text-primary border-primary/30',
  PAID: 'bg-success/10 text-success border-success/30',
  OVERDUE: 'bg-error/10 text-error border-error/30',
  CANCELLED: 'bg-surface-container text-on-surface-variant border-outline-variant',
  REFUNDED: 'bg-primary/10 text-primary border-primary/30',
  FAILED: 'bg-error/10 text-error border-error/30',
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
  const [acordos, setAcordos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [contractsRes, chargesRes, acordosRes] = await Promise.all([
        supabase
          .from('financial_contracts')
          .select('id, billing_cycle, amount_cents, status, students:student_id(name)')
          .eq('status', 'active'),
        supabase
          .from('financial_charges')
          .select('id, due_date, amount_cents, status, payment_method, payment_link, boleto_url, pix_copy_paste, paid_at, students:student_id(name)')
          .order('due_date', { ascending: false }),
        supabase
          .from('debt_agreements')
          .select('id, status, valor_acordado_cents, parcelas, students:student_id(name), debt_agreement_installments(id, numero, amount_cents, due_date, financial_charges(status))')
          .in('status', ['ativo', 'quitado', 'rompido'])
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (contractsRes.error) throw contractsRes.error;
      if (chargesRes.error) throw chargesRes.error;
      setContracts(contractsRes.data || []);
      setCharges(chargesRes.data || []);
      // Acordo é complemento: se falhar, o resto da tela continua.
      setAcordos(acordosRes.error ? [] : (acordosRes.data || []));
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
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 p-2.5 sm:p-3 md:p-4 rounded-none sm:rounded-zela-xl shadow-none sm:shadow-sm border-0 sm:border sm:border-outline-variant md:rounded-none md:shadow-none md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Título "Financeiro" e ícone removidos (o Header do app já mostra o
          nome da tela dinamicamente). */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {errorMsg && (
          <div className="p-2 bg-error/10 border border-error/30 rounded-zela-md text-sm text-error font-medium flex items-center gap-2">
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
                <h3 className="text-xs font-bold text-on-surface-variant">Meus contratos ativos</h3>
                {contracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 bg-surface-container-low border border-outline-variant rounded-zela-md">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{c.students?.name || '—'}</p>
                      <p className="text-xs text-on-surface-variant">{CYCLE_LABELS[c.billing_cycle] || c.billing_cycle}</p>
                    </div>
                    <p className="text-sm font-semibold text-primary shrink-0">{centsToBRL(c.amount_cents)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Acordos de dívida */}
            {acordos.map(a => (
              <div key={a.id} className="space-y-2 p-3 bg-surface-container-low border border-outline-variant rounded-zela-md">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-on-surface-variant">Acordo de dívida, {a.students?.name || 'aluno'}</h3>
                  <span className="text-xs font-bold text-primary">{{ ativo: 'Ativo', quitado: 'Quitado', rompido: 'Rompido' }[a.status]}</span>
                </div>
                <p className="text-sm text-on-surface">{a.parcelas}x, total <strong>{centsToBRL(a.valor_acordado_cents)}</strong></p>
                <ul className="text-xs text-on-surface-variant space-y-0.5">
                  {[...(a.debt_agreement_installments || [])].sort((x, y) => x.numero - y.numero).map(p => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>Parcela {p.numero}, vence em {new Date(p.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                      <span>{centsToBRL(p.amount_cents)}{p.financial_charges?.status === 'PAID' ? ', paga' : ''}</span>
                    </li>
                  ))}
                </ul>
                {a.status === 'ativo' && <p className="text-xs text-on-surface-variant">Pague cada parcela pelo link na lista de cobranças abaixo.</p>}
              </div>
            ))}

            {/* Cobranças */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-on-surface-variant">Cobranças</h3>
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
                      <div key={charge.id} className={`p-3 border rounded-zela-lg ${charge.status === 'OVERDUE' ? 'bg-error/10/40 border-error/30' : 'bg-white border-outline-variant'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-on-surface truncate">{charge.students?.name || '—'}</p>
                            <p className="text-xs text-on-surface-variant">
                              Vencimento: {charge.due_date ? new Date(charge.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-base font-semibold text-on-surface">{centsToBRL(charge.amount_cents)}</span>
                            <span className={`px-2 py-0.5 rounded-sm text-xs font-bold border ${CHARGE_STATUS_CLASSES[charge.status] || ''}`}>
                              {CHARGE_STATUS_LABELS[charge.status] || charge.status}
                            </span>
                          </div>
                        </div>

                        {charge.status === 'PAID' && charge.paid_at && (
                          <p className="text-xs text-success font-bold flex items-center gap-1 mt-1">
                            <CheckCircle2 size={13} /> Pago em {new Date(charge.paid_at).toLocaleDateString('pt-BR')}
                          </p>
                        )}

                        {isOpen && (
                          <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-outline-variant/50">
                            {charge.pix_copy_paste && (
                              <button
                                onClick={() => handleCopyPix(charge.id, charge.pix_copy_paste)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 hover:bg-success/10 text-success border border-success/30 font-bold rounded-zela-md transition text-xs"
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
