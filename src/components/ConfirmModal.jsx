import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Modal de confirmação customizado — substitui window.confirm/prompt nativos em
// ações destrutivas (exclusões), mantendo a identidade visual do app em vez do
// diálogo cru do navegador. `requireText` (opcional) exige digitar uma palavra
// exata antes de liberar o botão de confirmar — usado nas ações mais críticas
// (ex: excluir uma escola inteira).
export default function ConfirmModal({
  title = 'Confirmar ação',
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  danger = true,
  requireText,
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = !requireText || typed.trim() === requireText;

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-150">
        <div className="flex flex-col items-center text-center mb-5">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
            <AlertTriangle size={24} />
          </div>
          <h3 className="font-bold text-lg text-slate-800">{title}</h3>
          {message && <p className="text-slate-500 text-sm mt-1 whitespace-pre-wrap">{message}</p>}
        </div>

        {requireText && (
          <input
            type="text"
            autoFocus
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={`Digite ${requireText} para confirmar`}
            className="w-full p-3 mb-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none text-sm text-center font-bold uppercase"
          />
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || !canConfirm}
            className={`flex-[1.5] font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 text-white disabled:bg-slate-300 disabled:text-slate-500 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
