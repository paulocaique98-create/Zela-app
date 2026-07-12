import React from 'react';
import { Home, CalendarDays, Settings, QrCode, Users } from 'lucide-react';
import FamilyHome from './FamilyHome';
import FamilyHistory from './FamilyHistory';
import FamilySettings from './FamilySettings';
import FamilyWallet from './FamilyWallet';
import FamilyAuthorized from './FamilyAuthorized';

export default function FamilyPortal({ 
  currentUser, 
  setCurrentUser,
  students, 
  familyTab, setFamilyTab, 
  updateStudentStatus,
  authorized, togglePhoto, onOpenAuthModal, currentSchool
}) {
  const familyStudents = students.filter(s => s.familyId === currentUser.id);

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in pb-12">
      {/* MENU LATERAL (SIDEBAR) - Apenas Desktop */}
      <aside className="hidden md:block w-64 shrink-0">
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 sticky top-[80px] space-y-2">
          <p className="px-4 text-xs font-black text-slate-400 uppercase tracking-widest mb-4 mt-2">Navegação Principal</p>
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setFamilyTab('home')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${familyTab === 'home' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Home size={18} /> Início
            </button>
            <button
              onClick={() => setFamilyTab('authorized')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${familyTab === 'authorized' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Users size={18} /> Autorizados
            </button>
            <button
              onClick={() => setFamilyTab('wallet')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${familyTab === 'wallet' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <QrCode size={18} /> Carteira
            </button>
            <button
              onClick={() => setFamilyTab('history')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${familyTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <CalendarDays size={18} /> Históricos
            </button>
            <button
              onClick={() => setFamilyTab('settings')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${familyTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Settings size={18} /> Configurações
            </button>
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 space-y-6">
        {familyTab === 'home' && <FamilyHome currentUser={currentUser} familyStudents={familyStudents} updateStudentStatus={updateStudentStatus} />}
        {familyTab === 'authorized' && <FamilyAuthorized authorized={authorized} togglePhoto={togglePhoto} onOpenAuthModal={onOpenAuthModal} currentSchool={currentSchool} />}
        {familyTab === 'wallet' && <FamilyWallet familyStudents={familyStudents} />}
        {familyTab === 'history' && <FamilyHistory currentUser={currentUser} />}
        {familyTab === 'settings' && (
          <FamilySettings 
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
            authorized={authorized}
            togglePhoto={togglePhoto}
            onOpenAuthModal={onOpenAuthModal}
            currentSchool={currentSchool}
          />
        )}
      </main>
    </div>
  );
}
