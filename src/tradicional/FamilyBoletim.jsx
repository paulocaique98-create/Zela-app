import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { listarResultadosDaFamilia, rotuloSituacao } from './lib/boletim';
import { mensagemDeErro } from './lib/estrutura';

const formatar = (n) => (n === null || n === undefined ? '·' : String(n).replace('.', ','));
const corSituacao = (s) => (s === 'aprovado' ? 'text-primary' : 'text-brass');

// Fase 4A do Método Tradicional: a família lê o resultado FECHADO do próprio
// filho (a RLS de trad_resultados já filtra por students.family_id).
export default function FamilyBoletim({ currentUser, currentSchool, familyStudents }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const students = familyStudents || [];
  const [resultados, setResultados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    listarResultadosDaFamilia(schoolId, students.map(s => s.id))
      .then(r => { if (ativo) setResultados(r); })
      .catch(e => { if (ativo) setErro(mensagemDeErro(e)); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, students.map(s => s.id).join(',')]);

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <FileText size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Boletim</h2>
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3">{erro}</p>}
      {resultados.length === 0 ? (
        <p className="text-sm text-on-surface-variant">O boletim aparece aqui quando a escola fechar o resultado.</p>
      ) : resultados.map(r => (
        <section key={r.id} className="bg-surface-container-low rounded-zela-md p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-3">
            <h3 className="font-bold text-on-surface flex-1">{students.find(s => s.id === r.student_id)?.name || 'Aluno'}</h3>
            <span className={`font-bold ${corSituacao(r.situacao)}`}>{rotuloSituacao(r.situacao)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-on-surface-variant">
                  <th className="py-1.5 pr-3">Disciplina</th>
                  <th className="py-1.5 px-1">Notas por período</th>
                  <th className="py-1.5 px-1">Média anual</th>
                </tr>
              </thead>
              <tbody>
                {(r.boletim || []).map(l => (
                  <tr key={l.disciplina} className="border-t border-outline-variant/50">
                    <td className="py-1.5 pr-3 text-on-surface">{l.disciplina}</td>
                    <td className="py-1.5 px-1 text-on-surface">{(l.medias || []).map(formatar).join(' · ')}</td>
                    <td className={`py-1.5 px-1 font-bold ${corSituacao(l.situacao)}`}>{formatar(l.media_anual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-on-surface-variant">Frequência {r.frequencia === null ? '·' : `${formatar(Number(r.frequencia))}%`}</p>
          {r.observacao && <p className="text-sm text-on-surface">{r.observacao}</p>}
        </section>
      ))}
    </div>
  );
}
