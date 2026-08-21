import React from 'react';
import { ShieldCheck } from 'lucide-react';

// Tela de carregamento: pulsa suavemente a logo da própria escola (ou a da
// Zela, na falta de uma) em vez do spinner genérico — mais bonito e ajuda a
// reconhecer que o app está carregando os dados certos.
export default function LoadingLogo({ logoUrl, size = 56 }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Carregando"
          className="animate-gentle-pulse object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="animate-gentle-pulse bg-indigo-950 rounded-xl flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          <ShieldCheck className="text-white" size={size * 0.55} />
        </div>
      )}
    </div>
  );
}
