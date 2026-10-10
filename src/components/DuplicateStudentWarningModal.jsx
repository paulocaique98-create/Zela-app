import React, { useState } from 'react';
import { AlertTriangle, X, Loader2, Link2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Aparece antes de aprovar um autocadastro (ou criar um aluno pelo Admin)
// quando já existe um aluno com o MESMO NOME cadastrado por outro
// responsável na escola. Sem essa checagem, cada responsável que se
// cadastra sozinho (pai de um lado, mãe de outro, por exemplo) cria sua
// própria cópia do mesmo filho — foi exatamente o que aconteceu com 8
// alunos duplicados nesta escola antes dessa proteção existir.
//
// `matches`: [{ newStudent: {id, name}, existing: {id, name, family_id, family_name} }]
export default function DuplicateStudentWarningModal({ matches, onClose, onResolved }) {
  // Por padrão marca "é o mesmo aluno" pra todos — é o caso mais comum
  // (mesmo nome na mesma escola quase sempre é a mesma criança).
  const [decisions, setDecisions] = useState(() =>
    Object.fromEntries(matches.map(m => [m.newStudent.id, true]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id) => setDecisions(prev => ({ ...prev, [id]: !prev[id] }));

  const handleConfirm = async () => {
    setIsSaving(true);
    setError('');
    try {
      for (const match of matches) {
        if (!decisions[match.newStudent.id]) continue; // "são crianças diferentes" — não mexe em nada

        // Vincula o responsável (titular da cópia nova) como 2º responsável
        // do aluno já existente, e remove a cópia duplicada recém-criada.
        const { error: linkError } = await supabase.from('student_guardians').insert({
          student_id: match.existing.id,
          guardian_id: match.newStudent.guardianId,
          school_id: match.existing.school_id,
          is_primary: false,
          // Nunca financeiro aqui: o aluno já existente tem o dele, e o banco
          // aceita só um por aluno (student_guardians_um_financeiro_por_aluno).
          // Trocar quem paga: campo "Responsável financeiro" do cadastro.
          is_financial: false,
          relationship: 'Responsável',
        });
        // Ignora conflito de vínculo já existente (idempotente) — qualquer
        // outro erro interrompe e é mostrado pro admin.
        if (linkError && linkError.code !== '23505') throw linkError;

        const { error: deleteError } = await supabase.from('students').delete().eq('id', match.newStudent.id);
        if (deleteError) throw deleteError;
      }
      onResolved();
    } catch (err) {
      console.error('Erro ao resolver duplicidade:', err);
      setError(err.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-outline-variant">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-brass-50 text-warning p-2.5 rounded-xl shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-on-surface text-sm">Possível aluno duplicado</h3>
              <p className="text-xs text-on-surface-variant">Confirme antes de aprovar o cadastro</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-lg transition shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Já existe um aluno com esse nome nesta escola, cadastrado por outro responsável. Se for a mesma criança,
            o certo é vincular como 2º responsável em vez de criar um registro novo (evita duas contas de presença
            e cobrança separadas para o mesmo filho).
          </p>

          {matches.map(m => (
            <div key={m.newStudent.id} className="border border-outline-variant rounded-xl p-3">
              <p className="text-sm font-bold text-on-surface">{m.newStudent.name}</p>
              <p className="text-xs text-on-surface-variant mb-3">
                Já cadastrado por <span className="font-semibold">{m.existing.family_name}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDecisions(prev => ({ ...prev, [m.newStudent.id]: true }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border-2 transition ${
                    decisions[m.newStudent.id] ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-outline-variant text-on-surface-variant'
                  }`}
                >
                  <Link2 size={13} /> Mesmo aluno, vincular
                </button>
                <button
                  type="button"
                  onClick={() => toggle(m.newStudent.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border-2 transition ${
                    !decisions[m.newStudent.id] ? 'bg-ink border-outline text-white' : 'bg-white border-outline-variant text-on-surface-variant'
                  }`}
                >
                  <UserPlus size={13} /> Crianças diferentes
                </button>
              </div>
            </div>
          ))}

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
            onClick={handleConfirm}
            disabled={isSaving}
            className="flex-[1.5] font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 text-white bg-primary hover:bg-primary disabled:opacity-60"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            Confirmar e aprovar cadastro
          </button>
        </div>
      </div>
    </div>
  );
}
