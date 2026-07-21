import React from 'react';
import { Home, CalendarDays, Settings, QrCode, Users, HeartPulse, ClipboardList } from 'lucide-react';
import FamilyHome from './FamilyHome';
import FamilyHistory from './FamilyHistory';
import FamilySettings from './FamilySettings';
import FamilyWallet from './FamilyWallet';
import FamilyAuthorized from './FamilyAuthorized';
import FamilyRegistrationData from './FamilyRegistrationData';

export default function FamilyPortal({ 
  currentUser, 
  setCurrentUser,
  students, 
  familyTab, setFamilyTab, 
  updateStudentStatus,
  authorized, togglePhoto, onOpenAuthModal, currentSchool,
  isMobileMenuOpen, setIsMobileMenuOpen
}) {
  const familyStudents = students.filter(s => s.familyId === currentUser.id);

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in">
      {/* MENU LATERAL (SIDEBAR) */}
      <div 
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside className={`fixed md:relative top-0 left-0 h-[100dvh] md:h-full w-64 md:w-52 shrink-0 z-20 md:z-auto transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full bg-white p-3 pt-28 md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-200 flex flex-col overflow-y-auto">
          <p className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-2 shrink-0">Navegação Principal</p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 pr-0.5">
            <button
              onClick={() => { setFamilyTab('home'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'home' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Home size={16} /> Início
            </button>
            <button
              onClick={() => { setFamilyTab('authorized'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'authorized' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Users size={16} /> Autorizados
            </button>
            <button
              onClick={() => { setFamilyTab('wallet'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'wallet' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <QrCode size={16} /> Carteira
            </button>
            <button
              onClick={() => { setFamilyTab('history'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <CalendarDays size={16} /> Históricos
            </button>
            <button
              onClick={() => { setFamilyTab('registration'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'registration' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <ClipboardList size={16} /> Dados Cadastrais
            </button>
            <button
              onClick={() => { setFamilyTab('settings'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Settings size={16} /> Configurações
            </button>
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        {familyTab === 'home' && <FamilyHome currentUser={currentUser} familyStudents={familyStudents} updateStudentStatus={updateStudentStatus} />}
        {familyTab === 'authorized' && <FamilyAuthorized authorized={authorized} togglePhoto={togglePhoto} onOpenAuthModal={onOpenAuthModal} currentSchool={currentSchool} />}
        {familyTab === 'wallet' && <FamilyWallet familyStudents={familyStudents} />}
        {familyTab === 'history' && <FamilyHistory currentUser={currentUser} />}
        {familyTab === 'registration' && <FamilyRegistrationData currentUser={currentUser} />}
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
