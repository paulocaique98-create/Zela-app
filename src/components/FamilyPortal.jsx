import React, { useState } from 'react';
import { Home, CalendarDays, Settings, QrCode, Users, HeartPulse, ClipboardList, ChevronDown, FolderPlus, Folders, FileText, Bell, Image as ImageIcon, UtensilsCrossed, ShieldCheck, X } from 'lucide-react';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { usePushNotifications } from '../hooks/usePushNotifications';
import FamilyInicio from './FamilyInicio';
import FamilyMatriculas from './FamilyMatriculas';
import FamilyFichaMedica from './FamilyFichaMedica';
import FamilyComunicados from './FamilyComunicados';
import FamilyMuralFotos from './FamilyMuralFotos';
import FamilyCardapio from './FamilyCardapio';
import FamilyHome from './FamilyHome';
import FamilyHistory from './FamilyHistory';
import FamilySettings from './FamilySettings';
import FamilyAuthorized from './FamilyAuthorized';
import FamilyRegistrationData from './FamilyRegistrationData';
import FamilyGerenciarResponsaveis from './FamilyGerenciarResponsaveis';

export default function FamilyPortal({ 
  currentUser, 
  setCurrentUser,
  students, 
  familyTab, setFamilyTab, 
  updateStudentStatus,
  authorized, togglePhoto, onOpenAuthModal, currentSchool,
  isMobileMenuOpen, setIsMobileMenuOpen
}) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);
  const pushData = usePushNotifications(currentUser, currentSchool);

  const [dismissedPush, setDismissedPush] = useState(
    localStorage.getItem(`zela_push_dismissed_${currentUser?.id}`) === 'true'
  );
  
  const dismissPushBanner = () => {
    localStorage.setItem(`zela_push_dismissed_${currentUser?.id}`, 'true');
    setDismissedPush(true);
  };

  // Os alunos já vêm filtrados corretamente do App.jsx (via student_guardians ou family_id)
  const familyStudents = students;

  // Estados dos Accordions
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
  };

  const features = currentSchool?.features_enabled || {};
  
  const showFormularios = features.formularios === true;
  const showGerenciamento = features.gerenciamento !== false;
  const showCheckin = features.checkin !== false;
  const showCalendario = features.calendario === true;
  const showComunicados = features.comunicados === true;
  const showMural = features.mural === true;
  const showCardapio = features.cardapio === true;
  const showConfiguracoes = features.configuracoes !== false;

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in">
      {/* MENU LATERAL (SIDEBAR) */}
      <div 
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside className={`fixed md:relative top-0 left-0 h-[100dvh] md:h-full w-64 md:w-52 shrink-0 z-20 md:z-auto transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full bg-white p-3 pt-[108px] md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-200 flex flex-col overflow-y-auto">
          <p className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-2 shrink-0">Navegação Principal</p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 pr-0.5 overflow-y-auto pb-4">
            {/* INÍCIO */}
            <button
              onClick={() => { setFamilyTab('home'); registerClick('home'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'home' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Home size={18} /> Início
            </button>

            {/* FORMULÁRIOS */}
            {showFormularios && (
              <div>
                <button
                  onClick={() => toggleAccordion('formularios')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['matriculas', 'ficha-medica'].includes(familyTab) || openAccordion === 'formularios' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FileText size={18} /> Formulários</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'formularios' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'formularios' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <button onClick={() => { setFamilyTab('matriculas'); registerClick('matriculas'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'matriculas' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Matrículas</button>
                    <button onClick={() => { setFamilyTab('ficha-medica'); registerClick('ficha-medica'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'ficha-medica' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Ficha Médica</button>
                  </div>
                </div>
              </div>
            )}

            {/* GERENCIAMENTO */}
            {showGerenciamento && (
              <div>
                <button
                  onClick={() => toggleAccordion('gerenciamento')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['gerenciar-responsaveis', 'registration'].includes(familyTab) || openAccordion === 'gerenciamento' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><Folders size={18} /> Gerenciamento</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'gerenciamento' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'gerenciamento' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <button onClick={() => { setFamilyTab('gerenciar-responsaveis'); registerClick('gerenciar-responsaveis'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'gerenciar-responsaveis' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Gerenciar Responsáveis</button>
                    <button onClick={() => { setFamilyTab('registration'); registerClick('registration'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'registration' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Dados Cadastrais</button>
                  </div>
                </div>
              </div>
            )}

            {/* CHECK-IN/OUT */}
            {showCheckin && (
              <div>
                <button
                  onClick={() => toggleAccordion('checkin')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['acompanhamento', 'authorized', 'wallet', 'history'].includes(familyTab) || openAccordion === 'checkin' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><ShieldCheck size={18} /> Check-in/out</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'checkin' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'checkin' ? 'max-h-60' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <button onClick={() => { setFamilyTab('acompanhamento'); registerClick('acompanhamento'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'acompanhamento' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Acompanhamento Diário</button>
                    <button onClick={() => { setFamilyTab('authorized'); registerClick('authorized'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'authorized' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Autorizados</button>
                    <button onClick={() => { setFamilyTab('wallet'); registerClick('wallet'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'wallet' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Carteira QR Code</button>
                    <button onClick={() => { setFamilyTab('history'); registerClick('history'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${familyTab === 'history' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Histórico Geral</button>
                  </div>
                </div>
              </div>
            )}

            {/* CALENDÁRIO ESCOLAR */}
            {showCalendario && (
              <div>
                <button
                  onClick={() => toggleAccordion('calendario')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${openAccordion === 'calendario' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><CalendarDays size={18} /> Calendário Escolar</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'calendario' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'calendario' ? 'max-h-20' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <span className="text-left text-xs font-bold py-1.5 text-slate-400 italic">Em breve</span>
                  </div>
                </div>
              </div>
            )}

            {/* COMUNICADOS */}
            {showComunicados && (
              <button
                onClick={() => { setFamilyTab('comunicados'); registerClick('comunicados'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'comunicados' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <Bell size={18} /> Comunicados
              </button>
            )}

            {/* MURAL DE FOTOS */}
            {showMural && (
              <button
                onClick={() => { setFamilyTab('mural-fotos'); registerClick('mural-fotos'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'mural-fotos' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <ImageIcon size={18} /> Mural de Fotos
              </button>
            )}

            {/* CARDÁPIO */}
            {showCardapio && (
              <button
                onClick={() => { setFamilyTab('cardapio'); registerClick('cardapio'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'cardapio' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <UtensilsCrossed size={18} /> Cardápio
              </button>
            )}
          </nav>

          {showConfiguracoes && (
            <div className="pt-4 mt-auto border-t border-slate-100 shrink-0">
              <button
                onClick={() => { setFamilyTab('settings'); registerClick('settings'); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${familyTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <Settings size={18} /> Configurações
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        
        {/* BANNER NOTIFICAÇÕES PUSH */}
        {pushData.permission === 'default' && !pushData.isSubscribed && !dismissedPush && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
              <Bell size={18} className="text-amber-600" />
              <span className="truncate">Ative as notificações para receber avisos de check-in</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={pushData.subscribe} disabled={pushData.isLoading} className="text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                Ativar
              </button>
              <button onClick={dismissPushBanner} className="text-amber-500 hover:text-amber-700 p-1 rounded-md hover:bg-amber-100 transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {familyTab === 'home' && <FamilyInicio currentUser={currentUser} currentSchool={currentSchool} setFamilyTab={setFamilyTab} registerClick={registerClick} clickCounts={clickCounts} />}
        
        {/* REUTILIZANDO COMPONENTES EXISTENTES */}
        {familyTab === 'acompanhamento' && <FamilyHome currentUser={currentUser} familyStudents={familyStudents} updateStudentStatus={updateStudentStatus} />}
        {familyTab === 'authorized' && <FamilyAuthorized authorized={authorized} togglePhoto={togglePhoto} onOpenAuthModal={onOpenAuthModal} currentSchool={currentSchool} />}
        {familyTab === 'gerenciar-responsaveis' && <FamilyGerenciarResponsaveis currentUser={currentUser} familyStudents={familyStudents} currentSchool={currentSchool} />}
        {familyTab === 'history' && <FamilyHistory currentUser={currentUser} familyStudents={familyStudents} />}
        {familyTab === 'registration' && <FamilyRegistrationData currentUser={currentUser} />}
        
        {/* NOVOS PLACEHOLDERS */}
        {familyTab === 'matriculas' && <FamilyMatriculas />}
        {familyTab === 'ficha-medica' && <FamilyFichaMedica />}
        {familyTab === 'comunicados' && <FamilyComunicados />}
        {familyTab === 'mural-fotos' && <FamilyMuralFotos />}
        {familyTab === 'cardapio' && <FamilyCardapio />}
        {familyTab === 'settings' && (
          <FamilySettings 
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
            authorized={authorized}
            togglePhoto={togglePhoto}
            onOpenAuthModal={onOpenAuthModal}
            currentSchool={currentSchool}
            pushData={pushData}
          />
        )}
      </main>
    </div>
  );
}
