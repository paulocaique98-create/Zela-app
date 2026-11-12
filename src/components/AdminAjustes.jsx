import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, X, LogIn, LogOut, Pencil, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { agruparEventosPorDia, getBrasiliaDateStr } from '../utils/attendanceUtils';
import AttendanceEditTodayModal from './AttendanceEditTodayModal';

const STUDENT_COLS = 'id, name, turma, contracted_hours, contracted_entry_time, contracted_exit_time, weekly_schedule, isento_hora_extra';

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
}
function fmtDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// Menu "Lançamento manual": a escola lança/edita entrada e saída de qualquer dia,
// inclusive de aluno SEM nenhum registro no dia (o que Presença e Histórico
// não permitem). Usa o mesmo modal e a mesma RPC de sempre
// (request_attendance_manual_entry / request_attendance_correction), então
// motivo obrigatório, auditoria, cobrança e isolamento por escola vêm do servidor.
export default function AdminAjustes({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.school_id || currentSchool?.id || currentUser?.school_id;
  const today = getBrasiliaDateStr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    if (!schoolId || !from) return;
    const end = to && to >= from ? to : from;
    setLoading(true);
    try {
      const raw = await buscarTodos(() => supabase
        .from('attendance_logs')
        .select(`id, event_type, event_time, corrected, student_id, students:student_id (${STUDENT_COLS})`)
        .eq('school_id', schoolId)
        .gte('event_time', `${from}T00:00:00-03:00`)
        .lte('event_time', `${end}T23:59:59-03:00`)
        .order('student_id')
        .order('event_time')
        .order('id'));
      const grouped = agruparEventosPorDia(raw).map(g => ({
        key: `${g.student_id}_${g.date}`,
        dateStr: g.date,
        student: g.studentData ? { ...g.studentData, id: g.student_id } : null,
        entryLog: g.entryLog,
        exitLog: g.exitLog,
      })).filter(r => r.student);
      grouped.sort((a, b) => b.dateStr.localeCompare(a.dateStr) || a.student.name.localeCompare(b.student.name));
      setRows(grouped);
    } catch (err) {
      console.error('Erro ao carregar ajustes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schoolId, from, to]);

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim();
    return t ? rows.filter(r => r.student.name.toLowerCase().includes(t)) : rows;
  }, [rows, search]);

  return (
    <div className="h-full flex flex-col gap-4 bg-white -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-2xl md:rounded-none shadow-none sm:shadow-sm md:shadow-none border-0 sm:border sm:border-outline-variant md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      <div className="flex items-start justify-between gap-3 flex-wrap shrink-0">
        <p className="text-xs text-on-surface-variant">Lance ou corrija entrada e saída de qualquer dia, mesmo de aluno sem registro.</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:opacity-90 px-4 py-2.5 rounded-xl transition">
          <Plus size={16} /> Adicionar
        </button>
      </div>

      <div className="shrink-0 flex flex-wrap items-end gap-3 bg-white border border-outline-variant rounded-xl p-3">
        <label className="text-[11px] font-bold text-on-surface-variant">De
          <input type="date" value={from} max={today} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className="block mt-1 px-3 py-2 border border-outline-variant rounded-lg text-sm" />
        </label>
        <label className="text-[11px] font-bold text-on-surface-variant">Até
          <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="block mt-1 px-3 py-2 border border-outline-variant rounded-lg text-sm" />
        </label>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar aluno" className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-lg text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-on-surface-variant"><Loader2 className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-on-surface-variant text-center py-10">Nenhum registro no período. Use "Adicionar" para lançar um horário.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3 pr-1 content-start">
          {filtered.map(r => (
            <div key={r.key} className="flex items-center justify-between gap-3 bg-white border border-outline-variant rounded-xl p-3">
              <div className="min-w-0">
                <p className="font-bold text-sm text-on-surface break-words">{r.student.name}</p>
                <p className="text-[11px] text-on-surface-variant">{fmtDateStr(r.dateStr)}{r.student.turma ? ` · ${r.student.turma}` : ''}</p>
              </div>
              <div className="flex items-center gap-4 text-sm font-bold shrink-0">
                <span className="flex items-center gap-1 text-primary"><LogIn size={13} />{fmtTime(r.entryLog?.event_time) || '—'}</span>
                <span className="flex items-center gap-1 text-error"><LogOut size={13} />{fmtTime(r.exitLog?.event_time) || '—'}</span>
              </div>
              <button onClick={() => setEditTarget({ student: r.student, entryLog: r.entryLog, exitLog: r.exitLog, dateStr: r.dateStr })}
                className="flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/40 px-2.5 py-1.5 rounded-lg transition shrink-0">
                <Pencil size={12} /> Editar
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddPicker
          schoolId={schoolId}
          defaultDate={to || today}
          maxDate={today}
          onClose={() => setShowAdd(false)}
          onPick={(target) => { setShowAdd(false); setEditTarget(target); }}
        />
      )}

      {editTarget && (
        <AttendanceEditTodayModal
          student={editTarget.student}
          entryLog={editTarget.entryLog}
          exitLog={editTarget.exitLog}
          targetDateStr={editTarget.dateStr}
          currentUser={currentUser}
          billingConfig={currentSchool?.billing_config}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// Passo 1 do "Adicionar": escolher aluno e data. Se o aluno já tiver
// entrada/saída naquele dia, elas vêm preenchidas (evita registro duplicado).
function AddPicker({ schoolId, defaultDate, maxDate, onClose, onPick }) {
  const [students, setStudents] = useState([]);
  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState(null);
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await buscarTodos(() => supabase
          .from('students')
          .select(STUDENT_COLS)
          .eq('school_id', schoolId)
          .order('name', { ascending: true }));
        if (alive) setStudents(data || []);
      } catch (err) {
        console.error('Erro ao carregar alunos:', err);
        if (alive) setError('Não foi possível carregar os alunos.');
      }
    })();
    return () => { alive = false; };
  }, [schoolId]);

  const list = useMemo(() => {
    const t = term.toLowerCase().trim();
    return (t ? students.filter(s => s.name.toLowerCase().includes(t)) : students).slice(0, 50);
  }, [students, term]);

  const next = async () => {
    if (!chosen || !date) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('attendance_logs')
        .select('id, event_type, event_time, corrected')
        .eq('student_id', chosen.id)
        .gte('event_time', `${date}T00:00:00-03:00`)
        .lte('event_time', `${date}T23:59:59-03:00`)
        .order('event_time', { ascending: true });
      if (err) throw err;
      const entryLog = (data || []).find(l => l.event_type === 'entry') || null;
      const exitLog = [...(data || [])].reverse().find(l => l.event_type === 'exit') || null;
      onPick({ student: chosen, entryLog, exitLog, dateStr: date });
    } catch (err) {
      console.error('Erro ao consultar registros do dia:', err);
      setError('Não foi possível consultar o dia. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[998] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant">
          <h3 className="font-bold text-sm text-on-surface">Lançar horário</h3>
          <button onClick={onClose} className="p-2 text-on-surface-variant/70 hover:bg-surface-container rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block text-[11px] font-bold text-on-surface-variant">Dia
            <input type="date" value={date} max={maxDate} onChange={e => setDate(e.target.value)} className="block w-full mt-1 px-3 py-2 border border-outline-variant rounded-lg text-sm" />
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
            <input autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="Buscar aluno" className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-lg text-sm" />
          </div>
          <div className="max-h-56 overflow-y-auto border border-outline-variant rounded-lg divide-y divide-outline-variant">
            {list.map(s => (
              <button key={s.id} onClick={() => setChosen(s)}
                className={`w-full text-left px-3 py-2 text-sm ${chosen?.id === s.id ? 'bg-primary/10 font-bold text-primary' : 'hover:bg-surface-container'}`}>
                {s.name}{s.turma ? <span className="text-[11px] text-on-surface-variant"> · {s.turma}</span> : null}
              </button>
            ))}
            {list.length === 0 && <p className="text-xs text-on-surface-variant p-3">Nenhum aluno encontrado.</p>}
          </div>
          {error && <p className="text-xs text-error font-semibold">{error}</p>}
          <button onClick={next} disabled={!chosen || !date || busy}
            className="w-full text-sm font-bold text-white bg-primary py-2.5 rounded-xl disabled:opacity-40">
            {busy ? 'Consultando…' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
