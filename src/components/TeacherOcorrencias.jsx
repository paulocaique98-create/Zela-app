import React, { useEffect, useState } from 'react';
import { NotebookPen, Plus } from 'lucide-react';
import { PageShell, Loading, EmptyState, Notice, PrimaryButton } from './GestaoShared';
import OcorrenciaForm from './OcorrenciaForm';
import OcorrenciaCard from './OcorrenciaCard';
import { listarOcorrencias } from '../lib/ocorrencias';
import { listar } from '../tradicional/lib/estrutura';

// Professor › Acadêmico › Ocorrências (módulo `ocorrencias`). A professora
// registra para alunos das suas turmas e vê só o que ela registrou; não edita
// (o histórico é imutável) e não aplica medida disciplinar. A RLS repete tudo.
// Montessori: turmas do cadastro dela. Tradicional: turmas das atribuições.
export default function TeacherOcorrencias({ currentUser, currentSchool, method }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [turmas, setTurmas] = useState(null);
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const nomes = new Set(method === 'tradicional' ? [] : (currentUser?.turmas || []));
      if (method !== 'montessori') {
        const [ats, trs] = await Promise.all([
          listar('trad_atribuicoes', schoolId).catch(() => []),
          listar('trad_turmas', schoolId, { ordenarPor: 'nome' }).catch(() => []),
        ]);
        for (const a of ats.filter(x => x.professor_id === currentUser?.id)) {
          const nome = trs.find(t => t.id === a.turma_id)?.nome;
          if (nome) nomes.add(nome);
        }
      }
      if (ativo) setTurmas([...nomes].sort());
    })();
    return () => { ativo = false; };
  }, [schoolId, currentUser?.id, currentUser?.turmas, method]);

  useEffect(() => {
    let ativo = true;
    listarOcorrencias(schoolId, {})
      .then(l => { if (ativo) setLista(l); })
      .catch(() => { if (ativo) { setErro('Não foi possível carregar as ocorrências.'); setLista([]); } });
    return () => { ativo = false; };
  }, [schoolId, recarga]);

  return (
    <PageShell actions={turmas?.length > 0 && <PrimaryButton onClick={() => setForm(true)}><Plus size={15} /> Registrar ocorrência</PrimaryButton>}>
      <div className="space-y-3">
        <Notice>{erro}</Notice>
        <Notice type="success">{aviso}</Notice>
        {lista === null || turmas === null ? <Loading /> : lista.length === 0 ? (
          <EmptyState icon={NotebookPen} text="Você ainda não registrou ocorrências." hint={turmas.length === 0 ? 'Você não tem turmas atribuídas.' : 'Use o botão Registrar ocorrência.'} />
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2 items-start">
            {lista.map(o => <OcorrenciaCard key={o.id} o={o} schoolId={schoolId} comAnexos />)}
          </ul>
        )}
      </div>
      {form && (
        <OcorrenciaForm
          currentUser={currentUser}
          schoolId={schoolId}
          turmas={turmas}
          onClose={() => setForm(false)}
          onSaved={(msg) => { setForm(false); setAviso(msg || 'Ocorrência registrada.'); setRecarga(n => n + 1); }}
        />
      )}
    </PageShell>
  );
}
