import React, { lazy, Suspense } from 'react';
import { Tabs, Loading } from './GestaoShared';

const GestaoQualidadeBiometria = lazy(() => import('./GestaoQualidadeBiometria'));
const GestaoLimpezaBiometria = lazy(() => import('./GestaoLimpezaBiometria'));
const GestaoUnificarResponsaveis = lazy(() => import('./GestaoUnificarResponsaveis'));

// Cadastros, Biometrias (01/10/2026): um item só no menu, com três abas.
// Cada aba continua tendo o próprio endereço (as Pendências levam direto para
// a Limpeza, por exemplo), então nenhum link antigo quebra.
export const ABAS_BIOMETRIAS = [
  { id: 'cadastros-qualidade-biometria', label: 'Qualidade' },
  { id: 'cadastros-biometria', label: 'Limpeza' },
  { id: 'cadastros-unificar', label: 'Unificar responsáveis', shortLabel: 'Unificar' },
];

export default function GestaoBiometrias({ aba, onTrocarAba, currentUser }) {
  const abas = <Tabs tabs={ABAS_BIOMETRIAS} active={aba} onChange={onTrocarAba} equalOnMobile />;
  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Na Qualidade, no celular, as abas descem para dentro da tela (abaixo do
          ícone de explicação); aqui ficam só do sm para cima. */}
      <div className={`px-4 md:px-6 pt-4 shrink-0 ${aba === 'cadastros-qualidade-biometria' ? 'hidden sm:block' : ''}`}>
        {abas}
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<Loading />}>
          {aba === 'cadastros-qualidade-biometria' && <GestaoQualidadeBiometria currentUser={currentUser} abasMobile={abas} />}
          {aba === 'cadastros-biometria' && <GestaoLimpezaBiometria />}
          {aba === 'cadastros-unificar' && <GestaoUnificarResponsaveis />}
        </Suspense>
      </div>
    </div>
  );
}
