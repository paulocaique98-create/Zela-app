import React, { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { PageShell, EmptyState } from '../GestaoShared';
import BiFiltros, { FILTROS_VAZIOS } from './BiFiltros';

// Fase 1.1: casca do painel (só filtros e estado vazio). Ainda não está no
// menu da Gestão; entra em GestaoPortal na Fase 1.6. As abas e os gráficos
// vêm nas fases 1.3 a 1.5, lendo as RPCs da Fase 1.2.
export default function GestaoPainelBI() {
  const [filtros, setFiltros] = useState({ preset: 'este-mes', comparacao: 'nenhuma', ...FILTROS_VAZIOS });

  return (
    <PageShell>
      <div className="space-y-6">
        <BiFiltros
          valor={filtros}
          opcoes={{}}
          onChange={setFiltros}
          onLimpar={() => setFiltros(f => ({ ...f, ...FILTROS_VAZIOS }))}
        />
        <EmptyState icon={LayoutDashboard} text="Os indicadores chegam nas próximas fases." hint="Escolha o período e os filtros acima." />
      </div>
    </PageShell>
  );
}
