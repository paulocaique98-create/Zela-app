import React, { useMemo, useState } from 'react';
import { X, Clock, AlertTriangle, Loader2, ShieldCheck, LogIn, LogOut } from 'lucide-react';
import { ATTENDANCE_CORRECTION_REASONS } from '../lib/constants';
import { evaluateCorrectionImpact, requestAttendanceCorrection, requestManualAttendanceEntry } from '../lib/attendanceCorrections';

// "HH:MM" a partir de um ISO, no fuso do navegador (mesmo fuso da escola).
function toTimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Combina a DATA-ALVO (fixa, nunca editável aqui -- "hoje" por padrão, ou o
// dia do registro em telas como o Histórico) com o "HH:MM" digitado --
// pedido explícito: o admin nunca deveria precisar mexer na data, só na
// hora. targetDate é sempre meia-noite LOCAL daquele dia (ver
// dateStrToLocalDate abaixo), então somar h/m dá o instante certo no fuso
// da escola.
function isoFromTime(timeValue, targetDate) {
  if (!timeValue) return null;
  const [h, m] = timeValue.split(':').map(Number);
  const d = new Date(targetDate);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// "YYYY-MM-DD" -> Date à meia-noite local -- evita o problema clássico de
// `new Date('YYYY-MM-DD')` interpretar como UTC e "voltar um dia" em fusos
// negativos (Brasília).
function dateStrToLocalDate(dateStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Editor único de horário -- substitui os dois lápis separados
// (Entrada / Saída) por um só botão "Editar horário" que abre entrada E
// saída juntas, sempre para UM dia específico (targetDateStr, "YYYY-MM-DD";
// hoje por padrão). Cobre os dois casos:
//   1. Já existe um registro (attendance_logs) daquele lado -- corrige o
//      horário (mesmo caminho de sempre, request_attendance_correction).
//   2. Nunca existiu registro daquele lado (ex: a saída nunca passou pelo
//      totem) -- LANÇA o horário do zero (request_attendance_manual_entry,
//      novidade desta tela).
export default function AttendanceEditTodayModal({ student, entryLog, exitLog, targetDateStr, currentUser, billingConfig, onClose, onSaved }) {
  const targetDate = useMemo(() => dateStrToLocalDate(targetDateStr), [targetDateStr]);
  const [entryTime, setEntryTime] = useState(toTimeValue(entryLog?.event_time));
  const [exitTime, setExitTime] = useState(toTimeValue(exitLog?.event_time));
  const [reasonCode, setReasonCode] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const todayLabel = targetDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const entryIso = useMemo(() => isoFromTime(entryTime, targetDate), [entryTime, targetDate]);
  const exitIso = useMemo(() => isoFromTime(exitTime, targetDate), [exitTime, targetDate]);

  const entryOriginalTime = toTimeValue(entryLog?.event_time);
  const exitOriginalTime = toTimeValue(exitLog?.event_time);
  const entryChanged = entryTime !== entryOriginalTime;
  const exitChanged = exitTime !== exitOriginalTime;

  // Não dá pra "apagar" um horário já registrado por aqui -- só corrigir ou
  // lançar um novo. Limpar um campo que já tinha valor é bloqueado (existe
  // um fluxo próprio pra remover marcação fantasma, ver
  // AttendanceMarkingDeleteModal).
  const entryCleared = Boolean(entryOriginalTime) && !entryTime;
  const exitCleared = Boolean(exitOriginalTime) && !exitTime;

  const entryImpact = useMemo(() => {
    if (!entryChanged || !entryIso) return null;
    return evaluateCorrectionImpact({ eventType: 'entry', originalIso: entryLog?.event_time || null, newIso: entryIso, student, billingConfig });
  }, [entryChanged, entryIso, entryLog, student, billingConfig]);

  const exitImpact = useMemo(() => {
    if (!exitChanged || !exitIso) return null;
    return evaluateCorrectionImpact({ eventType: 'exit', originalIso: exitLog?.event_time || null, newIso: exitIso, student, billingConfig });
  }, [exitChanged, exitIso, exitLog, student, billingConfig]);

  const anyIncreasesBilling = Boolean(entryImpact?.increasesBilling || exitImpact?.increasesBilling);
  const hasAnyChange = (entryChanged && entryIso) || (exitChanged && exitIso);
  const canSubmit = hasAnyChange && !entryCleared && !exitCleared && reasonCode && !isSaving;

  const saveSide = async (eventType, log, iso, impact) => {
    if (log) {
      return requestAttendanceCorrection({
        logId: log.id,
        newEventTime: iso,
        newEventType: null,
        reasonCode,
        reasonDetail,
        impact,
        schoolId: currentUser?.school_id,
        actorId: currentUser?.id,
      });
    }
    return requestManualAttendanceEntry({
      studentId: student.id,
      eventType,
      newEventTime: iso,
      reasonCode,
      reasonDetail,
      impact,
      schoolId: currentUser?.school_id,
      actorId: currentUser?.id,
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setError('');
    try {
      if (entryChanged && entryIso) await saveSide('entry', entryLog, entryIso, entryImpact);
      if (exitChanged && exitIso) await saveSide('exit', exitLog, exitIso, exitImpact);
      onSaved?.();
    } catch (err) {
      console.error('Erro ao editar horário:', err);
      setError(err.message || 'Não foi possível salvar. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const fieldCls = (cleared) => `w-full px-3 py-2.5 bg-white border rounded-xl text-lg font-mono font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none text-center ${cleared ? 'border-red-300' : 'border-slate-300'}`;

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl shrink-0">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-sm">Editar horário</h3>
              <p className="text-xs text-slate-600 font-semibold break-words">{student?.name}</p>
              <p className="text-xs text-slate-500 capitalize">{todayLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-1.5">
                <LogIn size={13} /> Entrada
              </label>
              <input
                type="time"
                value={entryTime}
                onChange={e => setEntryTime(e.target.value)}
                className={fieldCls(entryCleared)}
              />
              {!entryOriginalTime && (
                <p className="text-[10px] text-slate-400 mt-1">Ainda não registrada nesse dia -- preencher aqui lança o horário.</p>
              )}
              {entryCleared && (
                <p className="text-[10px] text-red-600 mt-1">Não dá pra apagar por aqui -- volte ao horário original ou use "Remover marcação".</p>
              )}
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-rose-500 uppercase tracking-wide mb-1.5">
                <LogOut size={13} /> Saída
              </label>
              <input
                type="time"
                value={exitTime}
                onChange={e => setExitTime(e.target.value)}
                className={fieldCls(exitCleared)}
              />
              {!exitOriginalTime && (
                <p className="text-[10px] text-slate-400 mt-1">Ainda não registrada nesse dia -- preencher aqui lança o horário.</p>
              )}
              {exitCleared && (
                <p className="text-[10px] text-red-600 mt-1">Não dá pra apagar por aqui -- volte ao horário original ou use "Remover marcação".</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1.5 block">Motivo da correção *</label>
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

          {hasAnyChange && (
            anyIncreasesBilling ? (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Essa alteração aumenta a cobrança de hora extra deste aluno nesse dia.
                  Não entra em vigor sozinha: fica pendente até outro administrador
                  da escola aprovar.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl p-3">
                <ShieldCheck size={16} className="text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-800 leading-relaxed">
                  Essa alteração não aumenta a cobrança. Aplica imediatamente e fica
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
            {anyIncreasesBilling ? 'Enviar para aprovação' : 'Salvar horário'}
          </button>
        </div>
      </div>
    </div>
  );
}
