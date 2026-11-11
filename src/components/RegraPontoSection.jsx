import React, { useEffect, useState } from 'react';
import { Loader2, Save, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Regra da escola para decidir se um registro isolado do dia é entrada ou
// saída (pendências de ponto). Lê/grava school_attendance_rules (RLS: só a
// Gestão altera).
export default function RegraPontoSection({ schoolId, userId }) {
  const [horas, setHoras] = useState('');
  const [fixo, setFixo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!schoolId) return;
    supabase.from('school_attendance_rules')
      .select('entry_limit_hours, entry_limit_fixed')
      .eq('school_id', schoolId).maybeSingle()
      .then(({ data }) => {
        setHoras(data?.entry_limit_hours != null ? String(data.entry_limit_hours) : '');
        setFixo(data?.entry_limit_fixed ? data.entry_limit_fixed.slice(0, 5) : '');
        setLoading(false);
      });
  }, [schoolId]);

  const salvar = async () => {
    setSaving(true);
    setMsg({ type: '', text: '' });
    const h = horas === '' ? null : Number(horas);
    if (h != null && (!Number.isFinite(h) || h < 0 || h > 24)) {
      setSaving(false);
      setMsg({ type: 'error', text: 'Informe um número de horas entre 0 e 24.' });
      return;
    }
    const { error } = await supabase.from('school_attendance_rules').upsert({
      school_id: schoolId,
      entry_limit_hours: h,
      entry_limit_fixed: fixo || null,
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    setMsg(error ? { type: 'error', text: 'Não foi possível salvar. Tente novamente.' } : { type: 'ok', text: 'Regra salva.' });
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-on-surface"><Clock size={16} /> Entrada ou saída pendente</h3>
        <p className="text-xs text-on-surface-variant mt-1">
          Quando o aluno tem um único registro no dia, o sistema usa o horário limite para decidir se
          falta a entrada ou a saída. Registro a partir do limite é tratado como saída, então falta a entrada.
        </p>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5">
          Horas após o horário de entrada contratado do aluno
        </label>
        <input type="number" min="0" max="24" step="0.5" value={horas} onChange={e => setHoras(e.target.value)}
          placeholder="Ex.: 4 (entrada 10h → limite 14h)"
          className="w-full max-w-xs px-3 py-2.5 bg-white border border-outline-variant rounded-xl text-sm" />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5">
          Horário limite fixo (para alunos sem horário contratado)
        </label>
        <input type="time" value={fixo} onChange={e => setFixo(e.target.value)}
          className="w-full max-w-xs px-3 py-2.5 bg-white border border-outline-variant rounded-xl text-sm" />
      </div>
      <p className="text-[11px] text-on-surface-variant">Deixe os dois vazios para manter o comportamento antigo (tudo vira saída pendente).</p>
      {msg.text && <p className={`text-xs font-semibold ${msg.type === 'error' ? 'text-error' : 'text-success'}`}>{msg.text}</p>}
      <button type="button" onClick={salvar} disabled={saving}
        className="px-4 py-2.5 text-sm font-bold text-white bg-primary rounded-xl disabled:opacity-40 flex items-center gap-2">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar regra
      </button>
    </div>
  );
}
