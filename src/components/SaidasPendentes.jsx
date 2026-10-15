import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Clock, RefreshCw, Loader2, X, CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ATTENDANCE_CORRECTION_REASONS } from '../lib/constants';
import { evaluateCorrectionImpact } from '../lib/attendanceCorrections';
import { listSaidasPendentes, lancarSaidaPendente, podeLancarSaida, ontemBrasilia } from '../lib/saidasPendentes';

const horaBR = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

// Meia-noite local do dia "YYYY-MM-DD" somada ao "HH:MM" digitado.
function isoDoDia(dateStr, timeValue) {
  if (!dateStr || !timeValue) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeValue.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

function ModalLancar({ alunos, dia, students, billingConfig, currentUser, onClose, onSaved }) {
  const [time, setTime] = useState('');
  const [reasonCode, setReasonCode] = useState('ESQUECEU_REGISTRAR');
  const [reasonDetail, setReasonDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const exitIso = useMemo(() => isoDoDia(dia, time), [dia, time]);
  const antesDaEntrada = exitIso && alunos.some(a => new Date(exitIso) <= new Date(a.entry_time));

  // Prévia usando as mesmas funções do relatório de horas extras. O servidor
  // recalcula e decide de verdade; isto só avisa antes de enviar.
  const geraHoraExtra = useMemo(() => {
    if (!exitIso) return null;
    return alunos.some(a => {
      const s = students[a.student_id];
      if (!s) return false;
      try {
        return evaluateCorrectionImpact({ eventType: 'exit', originalIso: null, newIso: exitIso, otherIso: a.entry_time, student: s, billingConfig }).increasesBilling;
      } catch { return false; }
    });
  }, [exitIso, alunos, students, billingConfig]);

  const precisaAprovacao = geraHoraExtra && currentUser?.role !== 'gestao';
  const canSubmit = exitIso && !antesDaEntrada && reasonCode && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    const falhas = [];
    let pendentes = 0;
    for (const a of alunos) {
      try {
        let minutesDelta = 0;
        const s = students[a.student_id];
        if (s) {
          try { minutesDelta = evaluateCorrectionImpact({ eventType: 'exit', originalIso: null, newIso: exitIso, otherIso: a.entry_time, student: s, billingConfig }).minutesDelta || 0; } catch { /* servidor recalcula */ }
        }
        const r = await lancarSaidaPendente({
          studentId: a.student_id, exitIso, reasonCode, reasonDetail, minutesDelta,
          schoolId: currentUser?.school_id, actorId: currentUser?.id,
        });
        if (r?.status === 'pending') pendentes += 1;
      } catch (err) {
        console.error('Erro ao lançar saída:', err);
        falhas.push(`${a.student_name}: ${err.message || 'erro'}`);
      }
    }
    setSaving(false);
    if (falhas.length) {
      setError(falhas.join('\n'));
      onSaved({ parcial: true });
      return;
    }
    onSaved({ pendentes });
  };

  return (
    <div className="fixed inset-0 z-[999] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-outline-variant">
          <div className="min-w-0">
            <h3 className="font-bold text-on-surface text-sm">Registrar saída</h3>
            <p className="text-xs text-on-surface-variant font-semibold break-words">
              {alunos.length === 1 ? alunos[0].student_name : `${alunos.length} alunos`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-lg transition shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-error mb-1.5"><LogOut size={13} /> Horário da saída</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-outline-variant rounded-xl text-lg font-mono font-bold text-on-surface focus:ring-2 focus:ring-primary outline-none text-center" />
            {antesDaEntrada && <p className="text-[11px] text-error mt-1">A saída precisa ser depois da entrada.</p>}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5">Motivo</label>
            <select value={reasonCode} onChange={e => setReasonCode(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-outline-variant rounded-xl text-sm text-on-surface focus:ring-2 focus:ring-primary outline-none">
              {ATTENDANCE_CORRECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5">Observação (opcional)</label>
            <textarea value={reasonDetail} onChange={e => setReasonDetail(e.target.value)} rows={2}
              className="w-full px-3 py-2 bg-white border border-outline-variant rounded-xl text-sm text-on-surface focus:ring-2 focus:ring-primary outline-none resize-none" />
          </div>
          {precisaAprovacao && (
            <div className="flex gap-2 bg-brass-50 text-warning rounded-xl p-3 text-xs font-semibold">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Esse horário gera hora extra. A saída ficará aguardando a aprovação da Gestão.</span>
            </div>
          )}
          {error && <p className="text-xs text-error font-semibold whitespace-pre-line">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-outline-variant">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold text-on-surface-variant bg-surface-container rounded-xl">Cancelar</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-primary rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {precisaAprovacao ? 'Solicitar saída' : 'Registrar saída'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SaidasPendentes({ currentUser, currentSchool, onChanged }) {
  const podeLancar = podeLancarSaida(currentUser?.role);
  const ontem = ontemBrasilia();
  const [dia, setDia] = useState(ontem);
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [modal, setModal] = useState(null); // array de linhas
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listSaidasPendentes(dia);
      setRows(data);
      setSelecionados(new Set());
      onChanged?.(data.filter(r => !r.awaiting_approval).length);
      // Dados de horário contratado, só para a prévia de hora extra. Se a
      // leitura falhar, a prévia some e o servidor decide do mesmo jeito.
      if (podeLancar && data.length) {
        const { data: st } = await supabase
          .from('students')
          .select('id, contracted_entry_time, contracted_exit_time, weekly_schedule, isento_hora_extra')
          .in('id', data.map(r => r.student_id));
        setStudents(Object.fromEntries((st || []).map(s => [s.id, s])));
      }
    } catch (err) {
      console.error('Erro ao carregar saídas pendentes:', err);
      setError('Não foi possível carregar a lista. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [dia, podeLancar, onChanged]);

  useEffect(() => { carregar(); }, [carregar]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const r of rows) {
      const k = r.turma || 'Sem turma';
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(r);
    }
    return [...mapa.entries()];
  }, [rows]);

  const toggle = (id) => setSelecionados(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const lancaveis = rows.filter(r => !r.awaiting_approval);
  const diaLabel = new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const aoSalvar = ({ pendentes = 0, parcial = false } = {}) => {
    setModal(null);
    if (!parcial) setAviso(pendentes ? `${pendentes} saída(s) enviada(s) para aprovação da Gestão.` : 'Saída registrada.');
    carregar();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-on-surface">Saídas pendentes</h2>
          <p className="text-xs text-on-surface-variant capitalize">{diaLabel}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant mb-1">Dia</label>
            <input type="date" value={dia} max={ontem} onChange={e => e.target.value && setDia(e.target.value)}
              className="px-3 py-2 bg-white border border-outline-variant rounded-xl text-sm text-on-surface" />
          </div>
          <button onClick={carregar} title="Atualizar" className="p-2.5 bg-white border border-outline-variant rounded-xl text-on-surface-variant hover:text-on-surface">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant">
        Alunos que tiveram a entrada registrada neste dia e não tiveram a saída. Quem não veio à escola não aparece aqui.
      </p>

      {aviso && <div className="bg-success/10 text-success text-xs font-semibold rounded-xl p-3">{aviso}</div>}
      {error && <div className="bg-error/10 text-error text-xs font-semibold rounded-xl p-3">{error}</div>}

      {podeLancar && selecionados.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-primary text-white rounded-xl p-3">
          <span className="text-sm font-bold">{selecionados.size} selecionado(s)</span>
          <button onClick={() => setModal(rows.filter(r => selecionados.has(r.student_id)))}
            className="px-4 py-2 bg-white text-primary text-sm font-bold rounded-lg">Registrar saída</button>
        </div>
      )}

      {loading && !rows.length ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
      ) : !rows.length ? (
        <div className="text-center py-12 text-on-surface-variant">
          <CheckCircle2 className="mx-auto mb-2 text-success" />
          <p className="text-sm font-semibold">Nenhum aluno sem saída neste dia.</p>
        </div>
      ) : (
        grupos.map(([turma, lista]) => (
          <section key={turma} className="space-y-2">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">{turma}</h3>
            <div className="bg-white border border-outline-variant rounded-2xl divide-y divide-outline-variant">
              {lista.map(r => (
                <div key={r.student_id} className="flex items-center gap-3 p-3">
                  {podeLancar && !r.awaiting_approval && (
                    <input type="checkbox" checked={selecionados.has(r.student_id)} onChange={() => toggle(r.student_id)} className="size-4 accent-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-on-surface break-words">{r.student_name}</p>
                    <p className="text-[11px] text-on-surface-variant flex items-center gap-1">
                      <Clock size={11} /> Entrada às {horaBR(r.entry_time)}
                      {r.recorded_by_name ? ` por ${r.recorded_by_name}` : ''}
                    </p>
                  </div>
                  {r.awaiting_approval ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-warning bg-brass-50 px-2 py-1 rounded-lg shrink-0">
                      <Hourglass size={12} /> Aguardando aprovação
                    </span>
                  ) : podeLancar ? (
                    <button onClick={() => setModal([r])} className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-2 rounded-lg shrink-0">
                      Registrar saída
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {podeLancar && lancaveis.length > 1 && selecionados.size === 0 && (
        <button onClick={() => setSelecionados(new Set(lancaveis.map(r => r.student_id)))}
          className="text-xs font-bold text-primary underline">Selecionar todos</button>
      )}

      {modal && (
        <ModalLancar
          alunos={modal} dia={dia} students={students}
          billingConfig={currentSchool?.billing_config}
          currentUser={currentUser}
          onClose={() => setModal(null)} onSaved={aoSalvar}
        />
      )}
    </div>
  );
}
