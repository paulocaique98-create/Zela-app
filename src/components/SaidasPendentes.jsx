import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Clock, RefreshCw, Loader2, X, CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ATTENDANCE_CORRECTION_REASONS } from '../lib/constants';
import { evaluateCorrectionImpact } from '../lib/attendanceCorrections';
import { listPendenciasPeriodo, lancarSaidaPendente, lancarEntradaPendente, horarioContratadoDoDia, podeLancarSaida, ontemBrasilia } from '../lib/saidasPendentes';

const textoContratado = (h) => (h ? `Contratado: ${h.entry || '--:--'} às ${h.exit || '--:--'}` : 'Horário contratado não cadastrado');
const dataBR = (d) => d.split('-').reverse().join('/');
const horaBR = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

// Meia-noite local do dia "YYYY-MM-DD" somada ao "HH:MM" digitado.
function isoDoDia(dateStr, timeValue) {
  if (!dateStr || !timeValue) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeValue.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

function ModalLancar({ modo = 'saida', alunos, students, billingConfig, currentUser, onClose, onSaved }) {
  const [time, setTime] = useState('');
  const [reasonCode, setReasonCode] = useState('ESQUECEU_REGISTRAR');
  const [reasonDetail, setReasonDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Cada linha tem o próprio dia (o período pode ter vários): o horário digitado vale para o dia de cada aluno.
  const isoDe = (a) => isoDoDia(a.dia, time);
  const exitIso = time || null;
  const ehEntrada = modo === 'entrada';
  // Saída: tem de ser depois da entrada. Entrada: tem de ser antes do registro existente (que passa a ser a saída).
  const antesDaEntrada = exitIso && alunos.some(a => (ehEntrada ? new Date(isoDe(a)) >= new Date(a.entry_time) : new Date(isoDe(a)) <= new Date(a.entry_time)));

  // Prévia usando as mesmas funções do relatório de horas extras. O servidor
  // recalcula e decide de verdade; isto só avisa antes de enviar.
  const geraHoraExtra = useMemo(() => {
    if (!exitIso || ehEntrada) return null;
    return alunos.some(a => {
      const s = students[a.student_id];
      if (!s) return false;
      try {
        return evaluateCorrectionImpact({ eventType: 'exit', originalIso: null, newIso: isoDe(a), otherIso: a.entry_time, student: s, billingConfig }).increasesBilling;
      } catch { return false; }
    });
  }, [time, alunos, students, billingConfig, ehEntrada]);

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
          try { minutesDelta = evaluateCorrectionImpact({ eventType: 'exit', originalIso: null, newIso: isoDe(a), otherIso: a.entry_time, student: s, billingConfig }).minutesDelta || 0; } catch { /* servidor recalcula */ }
        }
        const r = ehEntrada
          ? await lancarEntradaPendente({
            studentId: a.student_id, entryIso: isoDe(a), reasonCode, reasonDetail, minutesDelta: 0,
            schoolId: currentUser?.school_id, actorId: currentUser?.id,
          })
          : await lancarSaidaPendente({
            studentId: a.student_id, exitIso: isoDe(a), reasonCode, reasonDetail, minutesDelta,
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
            <h3 className="font-bold text-on-surface text-sm">{ehEntrada ? 'Registrar entrada' : 'Registrar saída'}</h3>
            <p className="text-xs text-on-surface-variant font-semibold break-words">
              {alunos.length === 1 ? alunos[0].student_name : `${alunos.length} alunos`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-lg transition shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-surface-container rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
            {alunos.map(a => (
              <div key={a.student_id} className="text-[11px] text-on-surface-variant">
                {alunos.length > 1 && <p className="font-bold text-on-surface">{a.student_name}</p>}
                <p>{textoContratado(horarioContratadoDoDia(students[a.student_id], a.dia))}</p>
                <p>{dataBR(a.dia)} · {ehEntrada ? 'Registro existente (vira a saída)' : 'Entrada registrada'}: {horaBR(a.entry_time)}</p>
              </div>
            ))}
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-error mb-1.5"><LogOut size={13} /> {ehEntrada ? 'Horário da entrada' : 'Horário da saída'}</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-outline-variant rounded-xl text-lg font-mono font-bold text-on-surface focus:ring-2 focus:ring-primary outline-none text-center" />
            {antesDaEntrada && <p className="text-[11px] text-error mt-1">{ehEntrada ? 'A entrada precisa ser antes do registro existente.' : 'A saída precisa ser depois da entrada.'}</p>}
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
            {ehEntrada ? 'Registrar entrada' : precisaAprovacao ? 'Solicitar saída' : 'Registrar saída'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SaidasPendentes({ currentUser, currentSchool, onChanged }) {
  const podeLancar = podeLancarSaida(currentUser?.role);
  const ontem = ontemBrasilia();
  const [de, setDe] = useState(ontem);
  const [ate, setAte] = useState(ontem);
  const [aba, setAba] = useState('saida');
  const [todas, setTodas] = useState([]);
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
      const bruto = await listPendenciasPeriodo(de, ate);
      // Normaliza para o formato que a tela já usa (entry_time = horário do registro existente).
      const data = bruto.map(r => ({ ...r, dia: r.dia, entry_time: r.event_time, chave: `${r.student_id}|${r.dia}` }));
      setTodas(data);
      setSelecionados(new Set());
      onChanged?.(data.filter(r => r.kind === 'saida' && !r.awaiting_approval).length);
      // Dados de horário contratado, só para a prévia de hora extra. Se a
      // leitura falhar, a prévia some e o servidor decide do mesmo jeito.
      if (data.length) {
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
  }, [de, ate, onChanged]);

  useEffect(() => { if (!(de > ate || Math.round((new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 86400000) > 30)) carregar(); }, [carregar, de, ate]);
  useEffect(() => { setSelecionados(new Set()); }, [aba]);

  const rows = useMemo(() => todas.filter(r => r.kind === aba), [todas, aba]);
  const qtdEntradas = todas.filter(r => r.kind === 'entrada').length;
  const qtdSaidas = todas.length - qtdEntradas;

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
  const periodoLabel = de === ate
    ? new Date(`${de}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    : `${dataBR(de)} a ${dataBR(ate)}`;
  const diasEntre = Math.round((new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 86400000);
  const periodoInvalido = de > ate || diasEntre > 30;

  const aoSalvar = ({ pendentes = 0, parcial = false } = {}) => {
    setModal(null);
    if (!parcial) setAviso(pendentes ? `${pendentes} saída(s) enviada(s) para aprovação da Gestão.` : (aba === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.'));
    carregar();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-on-surface">{aba === 'entrada' ? 'Entradas pendentes' : 'Saídas pendentes'}</h2>
          <p className="text-xs text-on-surface-variant capitalize">{periodoLabel}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant mb-1">De</label>
            <input type="date" value={de} max={ontem} onChange={e => { if (!e.target.value) return; setDe(e.target.value); if (e.target.value > ate) setAte(e.target.value); }}
              className="px-3 py-2 bg-white border border-outline-variant rounded-xl text-sm text-on-surface" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant mb-1">Até</label>
            <input type="date" value={ate} min={de} max={ontem} onChange={e => e.target.value && setAte(e.target.value)}
              className="px-3 py-2 bg-white border border-outline-variant rounded-xl text-sm text-on-surface" />
          </div>
          <button onClick={carregar} title="Atualizar" className="p-2.5 bg-white border border-outline-variant rounded-xl text-on-surface-variant hover:text-on-surface">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {[['saida', `Saídas (${qtdSaidas})`], ['entrada', `Entradas (${qtdEntradas})`]].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`px-4 py-2 text-xs font-bold rounded-xl ${aba === id ? 'bg-primary text-white' : 'bg-white border border-outline-variant text-on-surface-variant'}`}>{label}</button>
        ))}
      </div>

      {podeLancar && lancaveis.length > 1 && selecionados.size === 0 && (
        <button onClick={() => setSelecionados(new Set(lancaveis.map(r => r.chave)))}
          className="text-xs font-bold text-primary underline">Selecionar todos</button>
      )}

      <p className="text-xs text-on-surface-variant">
        {aba === 'entrada'
          ? 'Alunos com um único registro no período, feito depois do horário limite de entrada da escola: na prática é a saída, e falta lançar a entrada.'
          : 'Alunos que tiveram a entrada registrada no período e não tiveram a saída. Quem não veio à escola não aparece aqui.'}
      </p>

      {periodoInvalido && <div className="bg-error/10 text-error text-xs font-semibold rounded-xl p-3">O período pode ter no máximo 31 dias.</div>}
      {aviso && <div className="bg-success/10 text-success text-xs font-semibold rounded-xl p-3">{aviso}</div>}
      {error && <div className="bg-error/10 text-error text-xs font-semibold rounded-xl p-3">{error}</div>}

      {podeLancar && selecionados.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-primary text-white rounded-xl p-3">
          <span className="text-sm font-bold">{selecionados.size} selecionado(s)</span>
          <button onClick={() => setModal(rows.filter(r => selecionados.has(r.chave)))}
            className="px-4 py-2 bg-white text-primary text-sm font-bold rounded-lg">{aba === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}</button>
        </div>
      )}

      {loading && !rows.length ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
      ) : !rows.length ? (
        <div className="text-center py-12 text-on-surface-variant">
          <CheckCircle2 className="mx-auto mb-2 text-success" />
          <p className="text-sm font-semibold">{aba === 'entrada' ? 'Nenhum aluno sem entrada neste período.' : 'Nenhum aluno sem saída neste período.'}</p>
        </div>
      ) : (
        grupos.map(([turma, lista]) => (
          <section key={turma} className="space-y-2">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">{turma}</h3>
            <div className="bg-white border border-outline-variant rounded-2xl divide-y divide-outline-variant">
              {lista.map(r => (
                <div key={r.chave} className="flex items-center gap-3 p-3">
                  {podeLancar && !r.awaiting_approval && (
                    <input type="checkbox" checked={selecionados.has(r.chave)} onChange={() => toggle(r.chave)} className="size-4 accent-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-on-surface break-words">{r.student_name}</p>
                    <p className="text-[11px] text-on-surface-variant flex items-center gap-1">
                      <Clock size={11} /> {dataBR(r.dia)} · {aba === 'entrada' ? 'Registro às' : 'Entrada às'} {horaBR(r.entry_time)}
                      {r.recorded_by_name ? ` por ${r.recorded_by_name}` : ''}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">{textoContratado(horarioContratadoDoDia(students[r.student_id], r.dia))}</p>
                  </div>
                  {r.awaiting_approval ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-warning bg-brass-50 px-2 py-1 rounded-lg shrink-0">
                      <Hourglass size={12} /> Aguardando aprovação
                    </span>
                  ) : podeLancar ? (
                    <button onClick={() => setModal([r])} className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-2 rounded-lg shrink-0">
                      {aba === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {modal && (
        <ModalLancar
          modo={aba} alunos={modal} students={students}
          billingConfig={currentSchool?.billing_config}
          currentUser={currentUser}
          onClose={() => setModal(null)} onSaved={aoSalvar}
        />
      )}
    </div>
  );
}
