import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, HandCoins } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { centsToBRL, formatDateBR, monthRange, downloadCSV } from '../lib/gestaoUtils';
import GestaoExtrato from './GestaoExtrato';
import { PageShell, Tabs, Loading, EmptyState, Notice, SecondaryButton, ResponsiveTable } from './GestaoShared';

const METHOD_LABELS = { pix: 'PIX', boleto: 'Boleto', credit_card: 'Cartão', link: 'Link', cash: 'Dinheiro', transfer: 'Transferência', other: 'Outro' };
const MANUAL = ['cash', 'transfer', 'other'];

// Financeiro, Recebimentos e Conciliação. Pelo Asaas, a baixa já é
// automática (e confirmada direto com o Asaas); aqui fica o que entra por
// fora: baixa manual e conferência do extrato bancário (OFX).
export default function GestaoRecebimentos({ currentUser }) {
  const [tab, setTab] = useState('recebidos');
  return (
    <PageShell infoOnMobile description="Pagamentos recebidos e conferência com o extrato do banco.">
      <Tabs tabs={[{ id: 'recebidos', label: 'Recebidos no mês' }, { id: 'extrato', label: 'Extrato' }]} active={tab} onChange={setTab} equalOnMobile />
      {tab === 'recebidos' ? <Recebidos currentUser={currentUser} /> : <GestaoExtrato currentUser={currentUser} />}
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setOffset(o => o - 1)} aria-label="Mês anterior"><ChevronLeft size={18} aria-hidden="true" /></SecondaryButton>
          <span className="flex-1 sm:flex-none text-sm font-bold text-on-surface capitalize sm:w-24 text-center">{range.label}</span>
          <SecondaryButton onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Próximo mês"><ChevronRight size={18} aria-hidden="true" /></SecondaryButton>
        </div>
        <div className="flex items-center justify-between sm:justify-start gap-3 bg-surface-container-lowest border border-outline-variant rounded-zela-lg px-4 py-3 sm:bg-transparent sm:border-0 sm:rounded-none sm:p-0">
          <div className="flex flex-col sm:block text-on-surface-variant">
            <span className="text-xs sm:text-sm">Total<span className="sm:hidden"> recebido no mês</span><span className="hidden sm:inline">:</span>{' '}</span>
            <strong className="text-success text-h3 sm:text-sm">{centsToBRL(total)}</strong>
          </div>
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
        <ResponsiveTable
          rows={rows}
          columns={[
            { label: 'Aluno', primary: true, render: r => r.students?.name || '·' },
            { label: 'Vencimento', render: r => formatDateBR(r.due_date) },
            { label: 'Pago em', render: r => formatDateBR(r.paid_at) },
            { label: 'Forma', render: r => (
              <>
                {METHOD_LABELS[r.payment_method] || '·'}
                {MANUAL.includes(r.payment_method) && <span className="ml-1.5 text-[10px] font-bold bg-warning/10 text-warning border border-warning/30 px-1.5 py-0.5 rounded-sm">baixa manual</span>}
              </>
            ) },
            { label: 'Valor', align: 'right', className: 'font-bold', render: r => centsToBRL(r.amount_cents) },
          ]}
        />
      )}
    </div>
  );
}
