import React, { useState } from 'react';
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { ATTENDANCE_CORRECTION_REASONS } from '../lib/constants';
import { deleteStaleAttendanceMarking } from '../lib/attendanceCorrections';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Remove uma marcação de entrada/saída sem nenhum registro em
// attendance_logs por trás — típico de uma solicitação que foi cancelada
// mas deixou o horário gravado em students.today_entry/today_exit (ver
// App.jsx > rejectStudentStatus). Sempre exige motivo e sempre fica
// registrada em Correções de Presença, mesmo aplicando na hora.
export default function AttendanceMarkingDeleteModal({ student, eventType, staleTime, currentUser, onClose, onDeleted }) {
  const [reasonCode, setReasonCode] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reasonCode || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const result = await deleteStaleAttendanceMarking({
        studentId: student.id,
        eventType,
        reasonCode,
        reasonDetail,
        schoolId: currentUser?.school_id,
        actorId: currentUser?.id,
      });
      onDeleted?.(result);
    } catch (err) {
      console.error('Erro ao remover marcação:', err);
      setError(err.message || 'Não foi possível remover a marcação. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-outline-variant">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-error/10 text-error p-2.5 rounded-xl shrink-0">
              <Trash2 size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-on-surface text-sm">Remover marcação indevida</h3>
              <p className="text-xs text-on-surface-variant truncate">{student?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-lg transition shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2.5 bg-brass-50 border border-warning/40 rounded-xl p-3">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning leading-relaxed">
              Essa {eventType === 'entry' ? 'entrada' : 'saída'} de <span className="font-mono font-bold">{formatTime(staleTime)}</span> não
              tem nenhum registro confirmado por trás — normalmente sobra de uma solicitação que foi cancelada. Removê-la não apaga nenhum
              histórico oficial, só limpa esse horário da tela.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-on-surface-variant mb-1.5 block">Motivo</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">Selecione um motivo</option>
              {ATTENDANCE_CORRECTION_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-on-surface-variant mb-1.5 block">Detalhe (opcional)</label>
            <textarea
              value={reasonDetail}
              onChange={e => setReasonDetail(e.target.value)}
              rows={2}
              placeholder="Algum detalhe adicional sobre o ocorrido"
              className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl text-sm text-on-surface focus:ring-2 focus:ring-primary outline-none resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error/40 rounded-xl text-xs text-error font-medium">{error}</div>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-bold py-3 rounded-xl transition text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reasonCode || isSaving}
            className="flex-[1.5] font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 text-white bg-error hover:bg-error disabled:bg-outline-variant disabled:text-on-surface-variant"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
            Remover marcação
          </button>
        </div>
      </div>
    </div>
  );
}
