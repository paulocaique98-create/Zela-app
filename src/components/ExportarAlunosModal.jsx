import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FORMATOS_EXPORTACAO } from '../lib/exportarAlunos';

// Modal central do botão Exportar (perfil Marketing). Três opções, nesta
// ordem: Excel, PDF, CSV. O clique baixa o arquivo; onExportar faz o download
// e grava a trilha em audit_logs.
export default function ExportarAlunosModal({ quantidade, onExportar, onClose }) {
  const [carregando, setCarregando] = useState(null);

  const escolher = async (formato) => {
    if (carregando) return;
    setCarregando(formato);
    try {
      await onExportar(formato);
      onClose();
    } finally {
      setCarregando(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-ink/70 flex items-center justify-center p-4" onClick={() => !carregando && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="exportar-alunos-titulo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded-zela-xl shadow-md p-6">
        <h3 id="exportar-alunos-titulo" className="font-semibold text-lg text-on-surface text-center">Em qual formato você quer exportar?</h3>
        <p className="text-on-surface-variant text-sm mt-1 text-center">{quantidade} {quantidade === 1 ? 'aluno' : 'alunos'}, com os filtros atuais.</p>
        <div className="mt-5 grid gap-2">
          {FORMATOS_EXPORTACAO.map((f) => (
            <button key={f.value} type="button" disabled={!!carregando} onClick={() => escolher(f.value)}
              className="w-full py-3 rounded-zela-md border border-outline-variant bg-surface-container-low text-sm font-semibold text-on-surface hover:border-primary hover:text-primary transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {carregando === f.value && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" disabled={!!carregando} onClick={onClose}
          className="w-full mt-3 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
          Cancelar
        </button>
      </div>
    </div>
  );
}
