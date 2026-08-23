import React from 'react';
import { FileText } from 'lucide-react';

export default function FamilyRelatorioPlaceholder({ title }) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-white rounded-zela-xl border border-outline-variant shadow-sm p-8 text-center">
      <div className="bg-primary/10 p-3 rounded-zela-lg text-primary mb-3">
        <FileText size={26} />
      </div>
      <h2 className="text-h3 text-on-surface mb-1">{title}</h2>
      <p className="text-on-surface-variant text-small max-w-sm">Nenhum relatório publicado ainda.</p>
    </div>
  );
}
