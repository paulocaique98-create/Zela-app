import React, { useEffect, useState, useCallback } from 'react';
import { FolderCheck, Download, ArrowRight } from 'lucide-react';
import { fetchDocumentosPendentes, REQUIRED_DOCUMENTS } from '../hooks/useGestaoPendencias';
import { downloadCSV } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, SecondaryButton, ResponsiveTable } from './GestaoShared';

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
              <ResponsiveTable
                rows={filtered}
                columns={[
                  { label: 'Aluno', primary: true, render: r => r.name },
                  { label: 'Turma', className: 'text-on-surface-variant', render: r => r.turma || '·' },
                  { label: 'Falta', render: r => (
                    <div className="flex flex-wrap gap-1 justify-end md:justify-start">
                      {r.missing.map(m => <span key={m.key} className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{m.label}</span>)}
                    </div>
                  ) },
                  { label: '', actions: true, align: 'right', render: r => (
                    <button onClick={() => onOpenAluno(r.id)} className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">Enviar <ArrowRight size={12} /></button>
                  ) },
                ]}
              />
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
