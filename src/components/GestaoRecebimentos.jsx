import React, { useCallback, useEffect, useState } from 'react';
import { Upload, Download, HandCoins, Landmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { centsToBRL, formatDateBR, monthRange, parseOFXCredits, downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Tabs, Loading, EmptyState, Notice, SecondaryButton } from './GestaoShared';
import { RegistrarPagamentoModal } from './AdminFinanceiro';

const METHOD_LABELS = { pix: 'PIX', boleto: 'Boleto', credit_card: 'Cartão', link: 'Link', cash: 'Dinheiro', transfer: 'Transferência', other: 'Outro' };
const MANUAL = ['cash', 'transfer', 'other'];

// Financeiro · Recebimentos e Conciliação. Pelo Asaas, a baixa já é
// automática (e confirmada direto com o Asaas); aqui fica o que entra por
// fora: baixa manual e conferência do extrato bancário (OFX).
export default function GestaoRecebimentos({ currentUser }) {
  const [tab, setTab] = useState('recebidos');
  return (
    <PageShell description="Pagamentos recebidos e conferência com o extrato do banco.">
      <Tabs tabs={[{ id: 'recebidos', label: 'Recebidos no mês' }, { id: 'conciliar', label: 'Conciliar extrato' }]} active={tab} onChange={setTab} />
      {tab === 'recebidos' ? <Recebidos currentUser={currentUser} /> : <Conciliar currentUser={currentUser} />}
    </PageShell>
  );
}

function Recebidos({ currentUser }) {
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const range = monthRange(offset);

  useEffect(() => {
    setRows(null);
    supabase.from('financial_charges')
      .select('id, amount_cents, due_date, paid_at, payment_method, students:student_id(name)')
      .eq('school_id', currentUser.school_id).eq('status', 'PAID')
      .gte('paid_at', `${range.start}T00:00:00`).lte('paid_at', `${range.end}T23:59:59`)
      .order('paid_at', { ascending: false })
      .then(({ data, error: e }) => {
        if (e) { setError('Não foi possível carregar os recebimentos.'); setRows([]); } else setRows(data || []);
      });
  }, [currentUser.school_id, range.start, range.end]);

  const total = (rows || []).reduce((s, r) => s + r.amount_cents, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setOffset(o => o - 1)} aria-label="Mês anterior">‹</SecondaryButton>
          <span className="text-sm font-bold text-on-surface capitalize w-24 text-center">{range.label}</span>
          <SecondaryButton onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Próximo mês">›</SecondaryButton>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-on-surface-variant">Total: <strong className="text-emerald-700">{centsToBRL(total)}</strong></span>
          {rows?.length > 0 && (
            <SecondaryButton onClick={() => downloadCSV(`recebimentos-${range.start.slice(0, 7)}.csv`, rows, [
              { label: 'Aluno', value: r => r.students?.name || '' }, { label: 'Vencimento', value: r => formatDateBR(r.due_date) },
              { label: 'Pago em', value: r => formatDateBR(r.paid_at) }, { label: 'Forma', value: r => METHOD_LABELS[r.payment_method] || '' },
              { label: 'Valor', value: r => (r.amount_cents / 100).toFixed(2).replace('.', ',') },
            ])}><Download size={15} /> Planilha</SecondaryButton>
          )}
        </div>
      </div>
      <Notice>{error}</Notice>
      {rows === null ? <Loading /> : rows.length === 0 ? <EmptyState icon={HandCoins} text="Nenhum recebimento neste mês." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
              <th className="py-2 pr-3">Aluno</th><th className="py-2 pr-3">Vencimento</th><th className="py-2 pr-3">Pago em</th><th className="py-2 pr-3">Forma</th><th className="py-2 pr-3 text-right">Valor</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-outline-variant/50">
                  <td className="py-2 pr-3 font-medium text-on-surface">{r.students?.name || '·'}</td>
                  <td className="py-2 pr-3">{formatDateBR(r.due_date)}</td>
                  <td className="py-2 pr-3">{formatDateBR(r.paid_at)}</td>
                  <td className="py-2 pr-3">
                    {METHOD_LABELS[r.payment_method] || '·'}
                    {MANUAL.includes(r.payment_method) && <span className="ml-1.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">baixa manual</span>}
                  </td>
                  <td className="py-2 pr-3 text-right font-bold">{centsToBRL(r.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Conciliar({ currentUser }) {
  const [credits, setCredits] = useState(null);
  const [openCharges, setOpenCharges] = useState([]);
  const [paying, setPaying] = useState(null);
  const [done, setDone] = useState(new Set());
  const [msg, setMsg] = useState('');

  const loadOpen = useCallback(async () => {
    const { data } = await supabase.from('financial_charges')
      .select('id, amount_cents, due_date, status, students:student_id(name)')
      .eq('school_id', currentUser.school_id).in('status', ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE']);
    setOpenCharges(data || []);
  }, [currentUser.school_id]);

  useEffect(() => { loadOpen(); }, [loadOpen]);

  const handleFile = async (file) => {
    if (!file) return;
    setMsg('');
    const parsed = parseOFXCredits(await file.text());
    setCredits(parsed);
    if (parsed.length === 0) setMsg('Nenhuma entrada (crédito) encontrada neste extrato.');
  };

  const candidatesFor = (credit) => openCharges
    .filter(c => c.amount_cents === credit.amount_cents)
    .filter(c => !credit.date || Math.abs(new Date(c.due_date) - new Date(credit.date)) <= 20 * 86400000)
    .sort((a, b) => Math.abs(new Date(a.due_date) - new Date(credit.date)) - Math.abs(new Date(b.due_date) - new Date(credit.date)));

  return (
    <div className="space-y-3">
      <p className="text-sm text-on-surface-variant">
        Envie o extrato do banco no formato OFX (exportado pelo internet banking). Para cada entrada, o Zela sugere a cobrança em aberto de mesmo valor com vencimento próximo; ao confirmar, a baixa é feita e o Asaas é avisado.
      </p>
      <label htmlFor="ofx-file" className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary text-white font-bold rounded-zela-md text-sm cursor-pointer hover:bg-primary-container">
        <Upload size={15} /> Enviar extrato OFX
        <input id="ofx-file" type="file" accept=".ofx,.OFX,text/plain" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
      </label>
      <Notice type="success">{msg && msg.startsWith('Baixa') ? msg : ''}</Notice>
      {msg && !msg.startsWith('Baixa') && <p className="text-sm text-on-surface-variant">{msg}</p>}
      {credits && credits.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
              <th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Descrição no extrato</th><th className="py-2 pr-3 text-right">Valor</th><th className="py-2 pr-3">Cobrança sugerida</th>
            </tr></thead>
            <tbody>
              {credits.map(cr => {
                const cands = candidatesFor(cr);
                return (
                  <tr key={cr.id} className="border-b border-outline-variant/50 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateBR(cr.date)}</td>
                    <td className="py-2 pr-3 text-on-surface-variant">{cr.memo || '·'}</td>
                    <td className="py-2 pr-3 text-right font-bold">{centsToBRL(cr.amount_cents)}</td>
                    <td className="py-2 pr-3">
                      {done.has(cr.id) ? <span className="text-xs font-bold text-emerald-700">Baixa feita</span>
                        : cands.length === 0 ? <span className="text-xs text-on-surface-variant flex items-center gap-1"><Landmark size={12} /> Sem cobrança correspondente</span>
                        : (
                          <div className="space-y-1">
                            {cands.slice(0, 3).map(c => (
                              <button key={c.id} onClick={() => setPaying({ charge: c, credit: cr })} className="block text-left text-xs font-bold text-primary hover:underline">
                                {c.students?.name || 'Aluno'} · vence {formatDateBR(c.due_date)}
                              </button>
                            ))}
                          </div>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {paying && (
        <RegistrarPagamentoModal
          currentUser={currentUser}
          charge={paying.charge}
          presetDate={paying.credit.date}
          presetAmountCents={paying.credit.amount_cents}
          onClose={() => setPaying(null)}
          onDone={() => {
            setDone(prev => new Set(prev).add(paying.credit.id));
            setPaying(null);
            setMsg('Baixa registrada.');
            loadOpen();
          }}
        />
      )}
    </div>
  );
}
