import React, { useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { listarTarefasDaFamilia, ordenarTarefas, estaVencida } from './lib/tarefas';
import { mensagemDeErro } from './lib/estrutura';

const hoje = () => new Date().toLocaleDateString('en-CA');
const formatarData = (iso) => iso.split('-').reverse().join('/');

// Fase 5B do Método Tradicional: a família lê as tarefas da turma do filho
// (a RLS de trad_tarefas já filtra por students.family_id; aqui só separa por
// turma quando há mais de um filho).
export default function FamilyTarefas({ currentUser, currentSchool, familyStudents }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [tarefas, setTarefas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    listarTarefasDaFamilia(schoolId)
      .then(t => { if (ativo) setTarefas(t); })
      .catch(e => { if (ativo) setErro(mensagemDeErro(e)); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [schoolId]);

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  const turmas = [...new Set((familyStudents || []).map(s => s.turma).filter(Boolean))];
  const hojeIso = hoje();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Tarefas</h2>
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3">{erro}</p>}
      {tarefas.length === 0 ? (
        <p className="text-sm text-on-surface-variant">As tarefas publicadas pelos professores aparecem aqui.</p>
      ) : turmas.map(turma => {
        const daTurma = ordenarTarefas(tarefas.filter(t => t.turma_nome === turma), hojeIso);
        if (daTurma.length === 0) return null;
        const alunos = (familyStudents || []).filter(s => s.turma === turma).map(s => s.name).join(', ');
        return (
          <section key={turma} className="space-y-2">
            <h3 className="font-bold text-on-surface">{turma}<span className="font-normal text-on-surface-variant text-sm"> · {alunos}</span></h3>
            {daTurma.map(t => (
              <article key={t.id} className="bg-surface-container-low rounded-zela-md p-4 space-y-1">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-on-surface break-words">{t.titulo}</h4>
                    <p className="text-xs text-on-surface-variant">{t.disciplina_nome}</p>
                  </div>
                  <span className={`text-sm ${estaVencida(t, hojeIso) ? 'text-on-surface-variant' : 'text-brass font-bold'}`}>
                    Entrega {formatarData(t.data_entrega)}
                  </span>
                </div>
                {t.descricao && <p className="text-sm text-on-surface whitespace-pre-wrap break-words">{t.descricao}</p>}
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
