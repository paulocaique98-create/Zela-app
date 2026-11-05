import React, { Suspense, lazy, useState } from 'react';
import { CalendarDays, Images, Megaphone, Users, LogOut } from 'lucide-react';

const MarketingAlunos = lazy(() => import('./MarketingAlunos'));
const AdminCalendario = lazy(() => import('./AdminCalendario'));
const AdminCadastroComunicados = lazy(() => import('./AdminCadastroComunicados'));
const AdminMuralFotos = lazy(() => import('./AdminMuralFotos'));

// Portal do perfil Marketing (PLANO_MARKETING.md, A5). Menu reduzido: Alunos,
// Calendário, Comunicados e Mural de fotos. Sem chat, financeiro, check-in,
// totem, ficha médica, documentos nem configurações. Quem barra de verdade é o
// banco (regras "Marketing ..."); com o módulo desligado, nada abre.
const ABAS = [
  { id: 'alunos', label: 'Alunos', icon: Users },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'comunicados', label: 'Comunicados', icon: Megaphone },
  { id: 'mural', label: 'Mural de fotos', icon: Images },
];

export default function MarketingPortal({ currentUser, currentSchool, onLogout }) {
  const [aba, setAba] = useState('alunos');
  const moduloLigado = currentSchool?.features_enabled?.marketing === true;

  if (!moduloLigado) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-3">
        <h2 className="text-lg font-semibold text-on-surface">Marketing indisponível</h2>
        <p className="text-sm text-on-surface-variant">O módulo Marketing não está ativo para esta escola. Fale com a Gestão.</p>
        <button type="button" onClick={onLogout} className="px-4 py-2 rounded-zela-md border border-outline-variant text-sm font-semibold inline-flex items-center gap-2">
          <LogOut size={16} aria-hidden="true" /> Sair
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <nav className="flex gap-1 overflow-x-auto border-b border-outline-variant bg-surface-container-lowest px-3" aria-label="Menu do Marketing">
        {ABAS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setAba(id)} aria-current={aba === id ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 ${aba === id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>
      <div className="p-4 md:p-6">
        <Suspense fallback={null}>
          {aba === 'alunos' && <MarketingAlunos />}
          {aba === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}
          {aba === 'comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}
          {aba === 'mural' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
        </Suspense>
      </div>
    </div>
  );
}
