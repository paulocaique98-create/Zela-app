import React, { useEffect, useState, useCallback } from 'react';
import { FolderCheck, Download, ArrowRight } from 'lucide-react';
import { fetchDocumentosPendentes, REQUIRED_DOCUMENTS } from '../hooks/useGestaoPendencias';
import { downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, SecondaryButton } from './GestaoShared';

// Secretaria · Documentos pendentes: checklist dos documentos obrigatórios
// por aluno ativo. O envio continua no perfil do aluno (aba Documentos) --
// esta tela só aponta o que falta e leva até lá.
export default function GestaoDocumentosPendentes({ currentUser, onOpenAluno }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [turma, setTurma] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await fetchDocumentosPendentes(currentUser.school_id));
    } catch (err) {
      console.error('[GestaoDocumentosPendentes]', err);
      setError('Não foi possível carregar os documentos.');
      setRows([]);
    }
  }, [currentUser.school_id]);

  useEffect(() => { load(); }, [load]);

  const turmas = [...new Set((rows || []).map(r => r.turma).filter(Boolean))].sort();
  const filtered = (rows || []).filter(r => !turma || r.turma === turma);

  return (
    <PageShell
      description={`Documentos obrigatórios: ${REQUIRED_DOCUMENTS.map(d => d.label).join(', ')}.`}
      actions={filtered.length > 0 && (
        <SecondaryButton onClick={() => downloadCSV('documentos-pendentes.csv', filtered, [
          { label: 'Aluno', value: 'name' }, { label: 'Turma', value: 'turma' },
          { label: 'Documentos faltando', value: r => r.missing.map(m => m.label).join(', ') },
        ])}><Download size={15} /> Exportar planilha</SecondaryButton>
      )}
    >
      <Notice>{error}</Notice>
      {rows === null ? <Loading /> : (
        <>
          {turmas.length > 1 && (
            <select value={turma} onChange={e => setTurma(e.target.value)} className="mb-4 p-2 bg-white border border-outline-variant rounded-zela-md text-sm" aria-label="Filtrar por turma">
              <option value="">Todas as turmas</option>
              {turmas.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {filtered.length === 0 ? (
            <EmptyState icon={FolderCheck} text="Todos os alunos ativos estão com os documentos em dia." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
                    <th className="py-2 pr-3">Aluno</th><th className="py-2 pr-3">Turma</th><th className="py-2 pr-3">Falta</th><th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b border-outline-variant/50">
                      <td className="py-2 pr-3 font-medium text-on-surface">{r.name}</td>
                      <td className="py-2 pr-3 text-on-surface-variant">{r.turma || '·'}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {r.missing.map(m => <span key={m.key} className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{m.label}</span>)}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <button onClick={() => onOpenAluno(r.id)} className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">Enviar <ArrowRight size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
