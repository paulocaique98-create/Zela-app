import React from 'react';
import { X } from 'lucide-react';

// Fechar o chat no celular, dentro do cabeçalho (o botão flutuante some
// enquanto o chat está aberto, para não cobrir o botão de enviar).
export default function ChatCloseButton({ onClose }) {
  if (!onClose) return null;
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Fechar chat"
      title="Fechar chat"
      className="sm:hidden ml-auto w-10 h-10 shrink-0 flex items-center justify-center rounded-zela-md text-on-surface-variant hover:text-primary hover:bg-primary/10 transition"
    >
      <X size={20} />
    </button>
  );
}
