import React, { useState, useEffect } from 'react';
import { HeartPulse, Save, CheckCircle2, Loader2, ChevronDown, ChevronUp, Baby } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────
// Perguntas da ficha médica
// ─────────────────────────────────────────────
const QUESTIONS = [
  { key: 'food_restriction', label: 'Possui restrições alimentares?' },
  { key: 'health_condition', label: 'Tem alguma condição de saúde?' },
  { key: 'specialist',       label: 'Já consultou algum especialista?' },
  { key: 'treatment',        label: 'Faz algum tratamento?' },
  { key: 'allergy',          label: 'Possui alguma alergia?' },
  { key: 'medication',       label: 'Precisa de medicamento?' },
  { key: 'habit',            label: 'Possui algum hábito importante?' },
];

const emptyMedical = () =>
  QUESTIONS.reduce((acc, q) => ({ ...acc, [q.key]: false, [`${q.key}_detail`]: '' }), {});

// ─────────────────────────────────────────────
// Componente: card de um aluno (expansível)
// ─────────────────────────────────────────────
function StudentMedicalCard({ student, onSave }) {
  const [open, setOpen] = useState(false);
  const [medical, setMedical] = useState(() => ({
    ...emptyMedical(),
    ...(student.medical_data || {}),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (field, value) => {
    setMedical(prev => ({
      ...prev,
      [field]: value,
      // Limpa detalhe ao marcar Não
      ...(!value && field in emptyMedical() ? { [`${field}_detail`]: '' } : {}),
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ medical_data: medical })
        .eq('id', student.id);
      if (error) throw error;
      setSaved(true);
      onSave(student.id, medical);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar ficha médica:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasAny = QUESTIONS.some(q => medical[q.key] === true);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Cabeçalho do card */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${
          open ? 'bg-rose-50' : 'hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            hasAny ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400'
          }`}>
            <Baby size={20} />
          </div>
          <div className="text-left">
            <p className="font-bold text-slate-800">{student.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasAny
                ? `${QUESTIONS.filter(q => medical[q.key]).length} item(s) preenchido(s)`
                : 'Ficha em branco — clique para preencher'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasAny && (
            <span className="text-[10px] bg-rose-100 text-rose-600 font-black px-2 py-1 rounded-full">
              Preenchida
            </span>
          )}
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {/* Corpo expansível */}
      {open && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-5 bg-rose-50/20 animate-in fade-in duration-200">
          {QUESTIONS.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              {/* Pergunta + botões Sim/Não */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700 flex-1">{label}</span>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => set(key, true)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                      medical[key] === true
                        ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-rose-300 hover:text-rose-500'
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => set(key, false)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                      medical[key] === false
                        ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    Não
                  </button>
                </div>
              </div>

              {/* Campo de detalhe (aparece apenas se Sim) */}
              {medical[key] === true && (
                <textarea
                  value={medical[`${key}_detail`] || ''}
                  onChange={e => set(`${key}_detail`, e.target.value)}
                  rows={2}
                  placeholder="Descreva aqui com detalhes..."
                  className="w-full p-3 bg-white border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-300 outline-none resize-none placeholder-slate-400 animate-in fade-in duration-150"
                />
              )}
            </div>
          ))}

          {/* Botão salvar */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold px-6 py-2.5 rounded-xl transition shadow-sm disabled:opacity-70 active:scale-95"
            >
              {isSaving ? (
                <><Loader2 size={16} className="animate-spin" /> Salvando...</>
              ) : saved ? (
                <><CheckCircle2 size={16} /> Salvo!</>
              ) : (
                <><Save size={16} /> Salvar Ficha</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
export default function FamilyMedical({ currentUser, familyStudents }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, name, medical_data')
          .eq('family_id', currentUser.id)
          .order('name');
        if (!error) setStudents(data || []);
      } catch (err) {
        console.error('Erro ao buscar alunos:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStudents();
  }, [currentUser.id]);

  const handleSave = (studentId, updatedMedical) => {
    setStudents(prev =>
      prev.map(s => s.id === studentId ? { ...s, medical_data: updatedMedical } : s)
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-1">
          <div className="bg-rose-100 p-2.5 rounded-xl text-rose-600">
            <HeartPulse size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Ficha Médica</h2>
            <p className="text-sm text-slate-500">
              Preencha as informações de saúde de cada criança vinculada à sua conta.
            </p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-700 font-medium">
            ⚠️ Estas informações são confidenciais e visíveis apenas para a equipe da escola. Mantenha-as atualizadas para garantir a segurança do seu filho.
          </p>
        </div>
      </div>

      {/* Cards dos alunos */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 size={32} className="animate-spin text-rose-400" />
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <HeartPulse className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma criança vinculada à sua conta.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {students.map(student => (
            <StudentMedicalCard
              key={student.id}
              student={student}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
