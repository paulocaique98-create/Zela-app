import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardCheck, Loader2, Check, X as XIcon, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ATTENDANCE_CORRECTION_REASONS } from '../lib/constants';
import { approveAttendanceCorrection } from '../lib/attendanceCorrections';

function reasonLabel(code) {
  return ATTENDANCE_CORRECTION_REASONS.find(r => r.value === code)?.label || code;
}

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS = {
  applied: { label: 'Aplicada', cls: 'bg-green-100 text-green-700' },
  pending: { label: 'Aguardando aprovação', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprovada', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejeitada', cls: 'bg-red-100 text-red-600' },
};

// Fila de aprovação + histórico de correções manuais de horário. Correções
// que não aumentam a cobrança já chegam aqui como 'applied' (aplicadas na
// hora); as que aumentam ficam 'pending' até outro admin da escola aprovar
// — nunca quem pediu (a RPC approve_attendance_correction já garante isso,
// os botões aqui só refletem essa regra na UI).
export default function AdminAttendanceCorrections({ currentUser }) {
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState(null);
  const [error, setError] = useState('');

  const fetchCorrections = useCallback(async () => {
    if (!currentUser?.school_id) return;
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('attendance_corrections')
        .select(`
          id, event_type, action_type, original_event_time, new_event_time, reason_code, reason_detail,
          minutes_delta, increases_billing, requested_by, requested_at, status, reviewed_by, reviewed_at,
          students:student_id (name)
        `)
        .eq('school_id', currentUser.school_id)
        .order('requested_at', { ascending: false })
        .limit(200);
      if (fetchError) throw fetchError;
      setCorrections(data || []);
    } catch (err) {
      console.error('Erro ao buscar correções de presença:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.school_id]);

  useEffect(() => { fetchCorrections(); }, [fetchCorrections]);

  const pending = corrections.filter(c => c.status === 'pending');
  const resolved = corrections.filter(c => c.status !== 'pending');

  const handleReview = async (correction, approve) => {
    setActingOn(correction.id);
    setError('');
    try {
      await approveAttendanceCorrection(correction.id, approve);
      await fetchCorrections();
    } catch (err) {
      console.error('Erro ao revisar correção:', err);
      setError(err.message || 'Não foi possível concluir a revisão.');
    } finally {
      setActingOn(null);
    }
  };

  const renderCard = (c, { reviewable }) => {
    const status = STATUS_LABELS[c.status] || { label: c.status, cls: 'bg-slate-100 text-slate-600' };
    const isOwnRequest = c.requested_by === currentUser?.id;
    return (
      <div key={c.id} className="p-4 border border-outline-variant rounded-zela-lg bg-white shadow-sm space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-sm text-on-surface truncate">{c.students?.name || '—'}</p>
            <p className="text-xs text-on-surface-variant/70">
              {c.action_type === 'delete' ? (
                <>
                  Marcação de {c.event_type === 'entry' ? 'entrada' : 'saída'} de{' '}
                  <span className="font-mono font-bold">{formatTime(c.original_event_time)}</span> removida (indevida)
                </>
              ) : (
                <>
                  {c.event_type === 'entry' ? 'Entrada' : 'Saída'} corrigida de{' '}
                  <span className="font-mono font-bold">{formatTime(c.original_event_time)}</span> para{' '}
                  <span className="font-mono font-bold">{formatTime(c.new_event_time)}</span>
                </>
              )}
            </p>
          </div>
          <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded-md ${status.cls}`}>{status.label}</span>
        </div>

        <p className="text-xs text-on-surface-variant">
          <span className="font-semibold">Motivo:</span> {reasonLabel(c.reason_code)}
          {c.reason_detail ? ` — ${c.reason_detail}` : ''}
        </p>

        {c.increases_billing && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
            <AlertTriangle size={13} /> Aumenta a cobrança em {c.minutes_delta} min
          </p>
        )}

        <p className="text-[11px] text-on-surface-variant/70 flex items-center gap-1">
          <Clock size={11} /> Solicitada em {formatWhen(c.requested_at)}
          {c.reviewed_at ? ` · Revisada em ${formatWhen(c.reviewed_at)}` : ''}
        </p>

        {reviewable && (
          isOwnRequest ? (
            <p className="text-[11px] italic text-on-surface-variant/70">Você solicitou esta correção — outro admin precisa aprovar.</p>
          ) : (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleReview(c, true)}
                disabled={actingOn === c.id}
                className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition"
              >
                {actingOn === c.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aprovar
              </button>
              <button
                onClick={() => handleReview(c, false)}
                disabled={actingOn === c.id}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 font-bold py-2 rounded-lg text-xs transition"
              >
                <XIcon size={13} /> Rejeitar
              </button>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <ClipboardCheck size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Correções de Presença</h2>
          <p className="text-small text-on-surface-variant">Correções manuais de horário, com aprovação quando aumentam a cobrança.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium shrink-0">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant/70">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-2">
                Aguardando aprovação {pending.length > 0 ? `(${pending.length})` : ''}
              </h3>
              {pending.length === 0 ? (
                <p className="text-sm text-on-surface-variant/70 italic">Nenhuma correção pendente no momento.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pending.map(c => renderCard(c, { reviewable: true }))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-2">Histórico</h3>
              {resolved.length === 0 ? (
                <p className="text-sm text-on-surface-variant/70 italic">Nenhuma correção registrada ainda.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {resolved.map(c => renderCard(c, { reviewable: false }))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
