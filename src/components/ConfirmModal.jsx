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
    <div className="fixed inset-0 z-[999] bg-ink/70 flex items-center justify-center p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-titulo" className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded-zela-xl shadow-md p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div className={`w-14 h-14 rounded-zela-md flex items-center justify-center mb-3 ${danger ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
            <AlertTriangle size={24} aria-hidden="true" />
          </div>
          <h3 id="confirm-modal-titulo" className="font-semibold text-lg text-on-surface">{title}</h3>
          {message && <p className="text-on-surface-variant text-sm mt-1 whitespace-pre-wrap">{message}</p>}
        </div>

        {requireText && (
          <input
            type="text"
            autoFocus
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={`Digite ${requireText} para confirmar`}
            className="w-full p-3 mb-4 bg-surface border border-outline-variant rounded-zela-sm focus:ring-2 focus:ring-error focus:outline-none text-sm text-center font-semibold"
          />
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 min-h-11 bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant font-semibold py-3 rounded-zela-sm transition text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading || !canConfirm}
            className={`flex-[1.5] min-h-11 font-semibold py-3 rounded-zela-sm transition text-sm flex items-center justify-center gap-2 text-white disabled:bg-surface-container-high disabled:text-on-surface-variant ${danger ? 'bg-error hover:opacity-90' : 'bg-primary hover:bg-primary-container'}`}
          >
            {isLoading ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
