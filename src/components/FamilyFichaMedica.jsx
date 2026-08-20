import React, { useEffect, useState } from 'react';
import { Heart, Loader2, Plus, Trash2, Check, ChevronDown, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BLOCKS = [
  { flagKey: 'tem_restricao_alimentar', listKey: 'restricoes_alimentares', question: 'Possui Restrição/Alergia alimentar?', placeholder: 'Ex: ALERGIA A AMENDOIM' },
  { flagKey: 'tem_restricao_saude', listKey: 'restricoes_saude', question: 'Possui Restrição de Saúde?', placeholder: 'Ex: ASMA' },
  { flagKey: 'consultou_especialista', listKey: 'especialistas', question: 'Consultou algum especialista?', placeholder: 'Ex: FONOAUDIÓLOGO' },
  { flagKey: 'faz_tratamento', listKey: 'tratamentos', question: 'Faz algum tratamento?', placeholder: 'Ex: FISIOTERAPIA' },
  { flagKey: 'usa_medicamento', listKey: 'medicamentos', question: 'Faz uso de algum medicamento?', placeholder: 'Ex: VENTOLIN, 2X AO DIA' },
  { flagKey: 'tem_habito_importante', listKey: 'habitos_importantes', question: 'Possui algum hábito importante?', placeholder: 'Ex: CHUPA CHUPETA PARA DORMIR' },
];

const emptyFicha = () => {
  const base = {};
  BLOCKS.forEach(b => { base[b.flagKey] = false; base[b.listKey] = ['']; });
  return base;
};

function YesNoListBlock({ block, value, items, onFlagChange, onItemsChange }) {
  const updateItem = (idx, text) => {
    const next = [...items];
    next[idx] = text.toUpperCase();
    onItemsChange(next);
  };
  const addItem = () => onItemsChange([...items, '']);
  const removeItem = (idx) => onItemsChange(items.length > 1 ? items.filter((_, i) => i !== idx) : ['']);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-slate-800 text-sm">{block.question}</p>
        <div className="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onFlagChange(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${value ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'}`}
          >
            SIM
          </button>
          <button
            type="button"
            onClick={() => onFlagChange(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${!value ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}
          >
            NÃO
          </button>
        </div>
      </div>

      {value && (
        <div className="space-y-2 pt-1">
          {items.map((text, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={e => updateItem(idx, e.target.value)}
                placeholder={block.placeholder}
                className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm uppercase placeholder:normal-case"
              />
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-bold text-xs px-2 py-1">
            <Plus size={14} /> Adicionar outro
          </button>
        </div>
      )}
    </div>
  );
}

export default function FamilyFichaMedica({ currentUser, currentSchool, familyStudents }) {
  const students = familyStudents || [];
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [ficha, setFicha] = useState(emptyFicha());
  const [fichaId, setFichaId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!selectedStudentId && students.length > 0) {
      setSelectedStudentId(students[0].id);
    }
  }, [students]);

  useEffect(() => {
    const load = async () => {
      if (!selectedStudentId) return;
      setIsLoading(true);
      setError('');
      setSuccessMsg('');
      try {
        const { data, error: fetchError } = await supabase
          .from('fichas_medicas')
          .select('*')
          .eq('student_id', selectedStudentId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (data) {
          const next = emptyFicha();
          BLOCKS.forEach(b => {
            next[b.flagKey] = !!data[b.flagKey];
            next[b.listKey] = data[b.listKey]?.length ? data[b.listKey] : [''];
          });
          setFicha(next);
          setFichaId(data.id);
        } else {
          setFicha(emptyFicha());
          setFichaId(null);
        }
      } catch (err) {
        console.error('[FamilyFichaMedica] Erro ao carregar ficha:', err);
        setError('Não foi possível carregar a ficha médica.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedStudentId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) return;
    setIsSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const payload = { student_id: selectedStudentId, school_id: schoolId, updated_by: currentUser.id, updated_at: new Date().toISOString() };
      BLOCKS.forEach(b => {
        payload[b.flagKey] = ficha[b.flagKey];
        payload[b.listKey] = ficha[b.flagKey] ? ficha[b.listKey].map(t => t.trim().toUpperCase()).filter(Boolean) : [];
      });

      const { data, error: upsertError } = await supabase
        .from('fichas_medicas')
        .upsert(payload, { onConflict: 'student_id' })
        .select('id')
        .single();
      if (upsertError) throw upsertError;
      setFichaId(data.id);
      setSuccessMsg('Ficha médica salva com sucesso!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('[FamilyFichaMedica] Erro ao salvar ficha:', err);
      setError('Não foi possível salvar a ficha médica.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <Heart size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ficha Médica</h2>
          <p className="text-slate-500 text-sm hidden sm:block">Preencha e atualize a ficha médica dos seus filhos.</p>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
          <Heart className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-600">Nenhum aluno vinculado a esta conta ainda.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {students.length > 1 && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><User size={12} /> Aluno</label>
              <div className="relative">
                <select
                  value={selectedStudentId || ''}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full appearance-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm pr-9"
                >
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
          )}
          {successMsg && (
            <div className="bg-green-50 border border-green-100 text-green-700 p-3 rounded-xl text-sm font-medium">{successMsg}</div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-3">
              {BLOCKS.map(block => (
                <YesNoListBlock
                  key={block.flagKey}
                  block={block}
                  value={ficha[block.flagKey]}
                  items={ficha[block.listKey]}
                  onFlagChange={(v) => setFicha(prev => ({ ...prev, [block.flagKey]: v }))}
                  onItemsChange={(items) => setFicha(prev => ({ ...prev, [block.listKey]: items }))}
                />
              ))}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-3 rounded-xl font-bold transition-all active:scale-95 text-sm"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {fichaId ? 'Salvar alterações' : 'Salvar Ficha Médica'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
