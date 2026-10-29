import React, { useEffect, useState, useCallback } from 'react';
import { FolderCheck, ArrowRight, ArrowLeft, School, ChevronDown } from 'lucide-react';
import { fetchDocumentosPendentes, REQUIRED_DOCUMENTS } from '../hooks/useGestaoPendencias';
import { PageShell, Loading, EmptyState, Notice, ResponsiveTable } from './GestaoShared';

// Secretaria, Documentos pendentes: checklist dos documentos obrigatórios
// por aluno ativo. O envio continua no perfil do aluno (aba Documentos) --
// esta tela só aponta o que falta e leva até lá.
export default function GestaoDocumentosPendentes({ currentUser, onOpenAluno, onVoltar }) {
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
    >
      <div className="flex items-center justify-between gap-3 mb-1.5 md:-mt-3">
        {onVoltar ? (
          <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            <ArrowLeft size={12} /> Voltar
          </button>
        ) : <span />}
        {turmas.length > 1 && (
          <div className="relative w-48 sm:w-64 shrink-0">
            <School size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <select
              value={turma}
              onChange={e => setTurma(e.target.value)}
              aria-label="Filtrar por turma"
              className={`w-full appearance-none cursor-pointer pl-9 pr-9 py-1.5 border rounded-zela-md text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary ${
                turma ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <option value="">Todas as turmas</option>
              {turmas.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          </div>
        )}
      </div>
      <Notice>{error}</Notice>
      {rows === null ? <Loading /> : (
        <>
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
                      {r.missing.map(m => <span key={m.key} className="text-[11px] font-bold bg-warning/10 text-warning border border-warning/30 px-2 py-0.5 rounded-sm">{m.label}</span>)}
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
