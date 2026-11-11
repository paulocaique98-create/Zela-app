import React from 'react';

// Tela inicial do perfil Marketing: saudação e atalhos para as 4 áreas do portal.
// Só navegação; nenhum dado é lido aqui (o banco continua barrando por RLS).
export default function MarketingInicio({ currentUser, currentSchool, abas, onSelect }) {
  return (
    <div className="bg-surface">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">
          Olá, {currentUser?.name?.split(' ')[0] || 'Marketing'}
        </h1>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {abas.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="bg-surface-container-lowest p-4 min-h-[88px] rounded-zela-lg border border-outline-variant hover:border-primary transition-colors flex flex-col items-start gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center">
              <Icon size={20} aria-hidden="true" />
            </div>
            <span className="text-label text-on-surface block">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
