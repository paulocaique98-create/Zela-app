import React, { useMemo, useState } from 'react';
import { X, Clock, AlertTriangle, Loader2, ShieldCheck, ArrowLeftRight, LogIn, LogOut } from 'lucide-react';
import { ATTENDANCE_CORRECTION_REASONS } from '../lib/constants';
import { evaluateCorrectionImpact, requestAttendanceCorrection } from '../lib/attendanceCorrections';

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Correção manual de um horário de check-in/check-out já registrado. Nunca
// sobrescreve o valor original (fica guardado em attendance_logs.original_event_time
// pela RPC) e sempre exige motivo. Se a correção aumenta a cobrança de hora
// extra, fica pendente de aprovação de outro admin em vez de aplicar na hora
// — ver request_attendance_correction() e o plano de correção de presença.
export default function AttendanceCorrectionModal({ log, student, currentUser, billingConfig, onClose, onSaved }) {
  const [newValue, setNewValue] = useState(toDatetimeLocalValue(log.event_time));
  // Período de adaptação das biometrias: quando a entrada da manhã não é
  // reconhecida, o aluno fica "idle" o dia todo, e o reconhecimento na saída
  // é lido pelo totem como uma NOVA entrada, não como a saída real — o
  // registro fica gravado com o tipo errado, não só com o horário errado.
  // Esse toggle deixa o admin corrigir o TIPO do evento também.
  const [eventType, setEventType] = useState(log.event_type);
  const [reasonCode, setReasonCode] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const newIso = useMemo(() => {
    if (!newValue) return null;
    // datetime-local não carrega fuso — interpreta como horário local do
    // navegador, que no contexto da escola é o mesmo fuso de Brasília.
    return new Date(newValue).toISOString();
  }, [newValue]);

  const typeChanged = eventType !== log.event_type;

  const impact = useMemo(() => {
    if (!newIso) return null;
    return evaluateCorrectionImpact({
      eventType,
      // Trocando o tipo, o "antes" não existe mais nesse lado (não havia
      // saída/entrada real registrada) — compara contra null pra tratar como
      // 0 de excedente antes da correção, não contra o horário do tipo errado.
      originalIso: typeChanged ? null : log.event_time,
      newIso,
      student,
      billingConfig,
    });
  }, [newIso, eventType, typeChanged, log.event_time, student, billingConfig]);

  const changed = (newIso && newIso !== log.event_time) || typeChanged;
  const canSubmit = changed && reasonCode && !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setError('');
    try {
      const result = await requestAttendanceCorrection({
        logId: log.id,
        newEventTime: newIso,
        newEventType: typeChanged ? eventType : null,
        reasonCode,
        reasonDetail,
        impact,
        schoolId: currentUser?.school_id,
        actorId: currentUser?.id,
      });
      onSaved?.(result);
    } catch (err) {
      console.error('Erro ao corrigir presença:', err);
      setError(err.message || 'Não foi possível salvar a correção. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl shrink-0">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-sm">Corrigir {eventType === 'entry' ? 'entrada' : 'saída'}</h3>
              <p className="text-xs text-slate-500 truncate">{student?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Troca de tipo: comum no período de adaptação das biometrias — a
              entrada da manhã não foi reconhecida, o aluno fica pendente o
              dia todo, e o reconhecimento na saída é gravado como uma NOVA
              entrada em vez da saída real. */}
          <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${typeChanged ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              {eventType === 'entry' ? (
                <span className="flex items-center gap-1.5 text-indigo-600"><LogIn size={15} /> Entrada</span>
              ) : (
                <span className="flex items-center gap-1.5 text-rose-500"><LogOut size={15} /> Saída</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEventType(t => (t === 'entry' ? 'exit' : 'entry'))}
              title="Este registro foi gravado com o tipo errado (ex: saída registrada como entrada)"
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition"
            >
              <ArrowLeftRight size={13} /> Trocar para {eventType === 'entry' ? 'saída' : 'entrada'}
            </button>
          </div>
          {typeChanged && (
            <p className="text-[11px] text-indigo-700 -mt-2">
              Este registro vai passar de {log.event_type === 'entry' ? 'entrada' : 'saída'} para {eventType === 'entry' ? 'entrada' : 'saída'}.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Horário registrado</p>
              <p className="font-mono font-bold text-slate-700">{formatTime(log.event_time)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Horário correto</p>
              <input
                type="datetime-local"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                className="w-full px-2 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block">Motivo da correção</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Selecione um motivo</option>
              {ATTENDANCE_CORRECTION_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block">Detalhe (opcional)</label>
            <textarea
              value={reasonDetail}
              onChange={e => setReasonDetail(e.target.value)}
              rows={2}
              placeholder="Algum detalhe adicional sobre o ocorrido"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>

          {changed && impact && (
            impact.increasesBilling ? (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Essa correção aumenta a cobrança de hora extra deste aluno no dia
                  (de {impact.minutosAntes} para {impact.minutosDepois} minutos). Ela
                  não entra em vigor sozinha: fica pendente até outro administrador
                  da escola aprovar.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl p-3">
                <ShieldCheck size={16} className="text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-800 leading-relaxed">
                  Essa correção não aumenta a cobrança. Aplica imediatamente e fica
                  visível para a família no Histórico.
                </p>
              </div>
            )
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">{error}</div>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-[1.5] font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            {impact?.increasesBilling ? 'Enviar para aprovação' : 'Salvar correção'}
          </button>
        </div>
      </div>
    </div>
  );
}
