import React from 'react';
import { FileText } from 'lucide-react';

export default function FamilyRelatorioPlaceholder({ title }) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
      <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600 mb-3">
        <FileText size={26} />
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-1">{title}</h2>
      <p className="text-slate-500 text-sm max-w-sm">Nenhum relatório publicado ainda.</p>
    </div>
  );
}
