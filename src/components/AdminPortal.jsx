import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { navigateTo } from '../utils/navigate';
import { AlertCircle, Car, Clock, Bell, QrCode, ShieldCheck, KeyRound, Users, CalendarDays, Settings, Monitor, Camera, ShieldHalf, Smartphone, Home, ChevronDown, FolderPlus, Folders, FileText, Image as ImageIcon, UtensilsCrossed, Calendar } from 'lucide-react';
import { useMenuClicks } from '../hooks/useMenuClicks';
import AdminInicio from './AdminInicio';
import AdminMatriculas from './AdminMatriculas';
import AdminFichaMedica from './AdminFichaMedica';
import AdminCalendario from './AdminCalendario';
import AdminComunicados from './AdminComunicados';
import AdminMuralFotos from './AdminMuralFotos';
import AdminCardapio from './AdminCardapio';
import AdminCadastroFuncionarios from './AdminCadastroFuncionarios';
import AdminGerenciarFuncionarios from './AdminGerenciarFuncionarios';
import AdminCadastroComunicados from './AdminCadastroComunicados';
import AdminUserRegistration from './AdminUserRegistration';
import AdminUserManagement from './AdminUserManagement';
import AdminDailyPresence from './AdminDailyPresence';
import AdminStudentList from './AdminStudentList';
import QRCodeScanner from './QRCodeScanner';
import AdminFaceScanner from './AdminFaceScanner';
import AdminPasswordLogin from './AdminPasswordLogin';
import AdminHistory from './AdminHistory';
import AdminSettings from './AdminSettings';
import AdminKioskManagement from './AdminKioskManagement';
import AdminRelatorioHorasExtras from './AdminRelatorioHorasExtras';
import { preloadFaceModels } from '../lib/faceModels';
import CheckinAlertModal from './CheckinAlertModal';

export default function AdminPortal({ currentUser, currentSchool, students, adminTab, setAdminTab, updateStudentStatus, rejectStudentStatus, onUpdateSchool, isMobileMenuOpen, setIsMobileMenuOpen, onLogout, pendingAlert, onDismissAlert, onGoToMonitor }) {
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentSchool?.id);

  const monitorStudents = students.filter(s => ['pending_entry', 'pending_exit'].includes(s.status));
  const prevMonitorCount = useRef(monitorStudents.length);
  const [newArrival, setNewArrival] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState(false);
  const [isPasswordLoginOpen, setIsPasswordLoginOpen] = useState(false);

  // Estados dos Accordions
  const [openAccordion, setOpenAccordion] = useState(null);
  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
  };

  const features = currentSchool?.features_enabled || {};
  const localPrefs = JSON.parse(localStorage.getItem(`admin_menu_prefs_${currentSchool?.id}`) || '{}');

  const showCadastros = features.cadastros !== false && localPrefs.cadastros !== false;
  const showGerenciamento = features.gerenciamento !== false && localPrefs.gerenciamento !== false;
  const showCheckin = features.checkin !== false && localPrefs.checkin !== false;
  const showConfiguracoes = features.configuracoes !== false && localPrefs.configuracoes !== false;

  const showFormularios = features.formularios === true && localPrefs.formularios !== false;
  const showCalendario = features.calendario === true && localPrefs.calendario !== false;
  const showComunicados = features.comunicados === true && localPrefs.comunicados !== false;
  const showMural = features.mural === true && localPrefs.mural !== false;
  const showCardapio = features.cardapio === true && localPrefs.cardapio !== false;

  // Pré-carrega os modelos de IA em background ao montar o painel
  // Assim quando o scanner abrir, os modelos já estão na memória
  useEffect(() => {
    preloadFaceModels().catch(err => console.warn('[FaceModels] Erro no pré-carregamento:', err));
  }, []);

  // Detecta novo aluno "a caminho" via Realtime e dispara alerta visual
  useEffect(() => {
    const current = monitorStudents.length;
    if (current > prevMonitorCount.current) {
      setNewArrival(true);
      // Volta ao normal após 4 segundos
      const timer = setTimeout(() => setNewArrival(false), 4000);
      prevMonitorCount.current = current;
      return () => clearTimeout(timer);
    }
    prevMonitorCount.current = current;
  }, [monitorStudents.length]);

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in">

      {/* MENU LATERAL (SIDEBAR) */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside className={`fixed md:relative top-0 left-0 h-[100dvh] md:h-full w-64 md:w-52 shrink-0 z-20 md:z-auto transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full bg-white p-3 pt-[68px] md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-200 flex flex-col overflow-y-auto">
          <p className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-2 shrink-0">Navegação Principal</p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 pr-0.5 overflow-y-auto pb-4">
            <button
              onClick={() => { setAdminTab('home'); registerClick('home'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'home' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Home size={18} /> Início
            </button>

            {/* CADASTROS */}
            {showCadastros && (
              <div>
                <button
                  onClick={() => toggleAccordion('cadastros')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['register', 'cadastro-comunicados', 'cadastro-funcionarios'].includes(adminTab) || openAccordion === 'cadastros' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FolderPlus size={18} /> Cadastros</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'cadastros' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'cadastros' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <button onClick={() => { setAdminTab('register'); registerClick('register'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'register' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Usuários</button>
                    <button onClick={() => { setAdminTab('cadastro-comunicados'); registerClick('cadastro-comunicados'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'cadastro-comunicados' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Comunicados</button>
                    <button onClick={() => { setAdminTab('cadastro-funcionarios'); registerClick('cadastro-funcionarios'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'cadastro-funcionarios' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Funcionários</button>
                  </div>
                </div>
              </div>
            )}

            {/* GERENCIAMENTO */}
            {showGerenciamento && (
              <div>
                <button
                  onClick={() => toggleAccordion('gerenciamento')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['users', 'students', 'gerenciar-funcionarios'].includes(adminTab) || openAccordion === 'gerenciamento' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><Folders size={18} /> Gerenciamento</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'gerenciamento' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'gerenciamento' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <button onClick={() => { setAdminTab('users'); registerClick('users'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'users' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Usuários</button>
                    <button onClick={() => { setAdminTab('students'); registerClick('students'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'students' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Alunos</button>
                    <button onClick={() => { setAdminTab('gerenciar-funcionarios'); registerClick('gerenciar-funcionarios'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'gerenciar-funcionarios' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Funcionários</button>
                  </div>
                </div>
              </div>
            )}

            {/* FORMULÁRIOS */}
            {showFormularios && (
              <div>
                <button
                  onClick={() => toggleAccordion('formularios')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['matriculas', 'ficha-medica'].includes(adminTab) || openAccordion === 'formularios' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><FileText size={18} /> Formulários</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'formularios' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'formularios' ? 'max-h-40' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <button onClick={() => { setAdminTab('matriculas'); registerClick('matriculas'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'matriculas' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Matrículas</button>
                    <button onClick={() => { setAdminTab('ficha-medica'); registerClick('ficha-medica'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'ficha-medica' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Ficha Médica</button>
                  </div>
                </div>
              </div>
            )}

            {/* CHECK-IN/OUT */}
            {showCheckin && (
              <div>
                <button
                  onClick={() => toggleAccordion('checkin')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${['monitor', 'presence', 'history', 'kiosks', 'horas-extras'].includes(adminTab) || openAccordion === 'checkin' ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2"><ShieldCheck size={18} /> Check-in/out</div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${openAccordion === 'checkin' ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openAccordion === 'checkin' ? 'max-h-60' : 'max-h-0'}`}>
                  <div className="flex flex-col gap-1 pl-9 pr-2 py-1">
                    <button onClick={() => { setAdminTab('monitor'); registerClick('monitor'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 flex items-center justify-between ${adminTab === 'monitor' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                      Monitor
                      {monitorStudents.length > 0 && (
                        <span className="bg-amber-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center animate-pulse">{monitorStudents.length}</span>
                      )}
                    </button>
                    <button onClick={() => { registerClick('totem'); navigateTo('/admin/totem-checkin'); }} className="text-left text-xs font-bold py-1.5 text-slate-500 hover:text-slate-700">Totem</button>
                    <button onClick={() => { setAdminTab('presence'); registerClick('presence'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'presence' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Presença Diária</button>
                    <button onClick={() => { setAdminTab('history'); registerClick('history'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'history' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Histórico Geral</button>
                    <button onClick={() => { setAdminTab('horas-extras'); registerClick('horas-extras'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'horas-extras' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Horas Extras</button>
                    <button onClick={() => { setAdminTab('kiosks'); registerClick('kiosks'); setIsMobileMenuOpen(false); }} className={`text-left text-xs font-bold py-1.5 ${adminTab === 'kiosks' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Gerenciar Totens</button>
                  </div>
                </div>
              </div>
            )}

            {/* CALENDÁRIO ESCOLAR */}
            {showCalendario && (
              <button
                onClick={() => { setAdminTab('calendario'); registerClick('calendario'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'calendario' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <CalendarDays size={18} /> Calendário
              </button>
            )}

            {/* MURAL DE FOTOS */}
            {showMural && (
              <button
                onClick={() => { setAdminTab('mural-fotos'); registerClick('mural-fotos'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'mural-fotos' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <ImageIcon size={18} /> Mural de Fotos
              </button>
            )}

            {/* CARDÁPIO */}
            {showCardapio && (
              <button
                onClick={() => { setAdminTab('cardapio'); registerClick('cardapio'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'cardapio' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <UtensilsCrossed size={18} /> Cardápio
              </button>
            )}
          </nav>

          {/* CONFIGURAÇÕES (Fixo no footer) */}
          {showConfiguracoes && (
            <div className="pt-4 mt-auto border-t border-slate-100 shrink-0">
              <button
                onClick={() => { setAdminTab('settings'); registerClick('settings'); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <Settings size={18} /> Configurações
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">

        {/* INICIO */}
        {adminTab === 'home' && <AdminInicio currentUser={currentUser} currentSchool={currentSchool} setAdminTab={setAdminTab} registerClick={registerClick} clickCounts={clickCounts} monitorCount={monitorStudents.length} />}

        {/* NOVOS PLACEHOLDERS */}
        {adminTab === 'matriculas' && <AdminMatriculas currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'ficha-medica' && <AdminFichaMedica currentUser={currentUser} currentSchool={currentSchool} students={students} />}
        {adminTab === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'comunicados' && <AdminComunicados currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'mural-fotos' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cardapio' && <AdminCardapio currentUser={currentUser} currentSchool={currentSchool} />}
        {adminTab === 'cadastro-funcionarios' && <AdminCadastroFuncionarios />}
        {adminTab === 'gerenciar-funcionarios' && <AdminGerenciarFuncionarios />}
        {adminTab === 'cadastro-comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}

        {/* MONITOR */}
        {adminTab === 'monitor' && (
          <div className={`h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border-2 transition-all duration-500 overflow-hidden ${newArrival ? 'border-amber-400 shadow-amber-100 shadow-lg' : 'border-slate-200'}`}>

            {/* Header do Monitor */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Monitor de Solicitações</h2>
                  <p className="text-sm text-slate-500">Acompanhe as solicitações em tempo real</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                {/* Removidos daqui os botões de scanner que agora ficam no Totem */}
              </div>
            </div>

            {/* Alerta de nova chegada */}
            {newArrival && (
              <div className="mb-5 p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 shrink-0">
                <Bell className="text-amber-600 shrink-0 animate-bounce" size={22} />
                <div>
                  <p className="font-bold text-amber-800">Nova atualização no painel!</p>
                  <p className="text-xs text-amber-600">Confirme a solicitação de check-in/out abaixo.</p>
                </div>
              </div>
            )}

            {/* Cards dos alunos */}
            {monitorStudents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                <Car className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <h3 className="text-slate-500 font-medium">Nenhuma solicitação no momento.</h3>
                <p className="text-slate-400 text-sm mt-1">O painel atualiza automaticamente com o totem e avisos das famílias.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {monitorStudents.map(student => {
                    let badgeClass, badgeText, btnClass, btnText, btnActionStatus, cancelStatus, borderColor, bgColor;

                    if (student.status === 'pending_entry') {
                      badgeClass = "text-green-700"; badgeText = "Solicitação de Entrada";
                      btnClass = "bg-green-600 hover:bg-green-700 text-white"; btnText = "Confirmar Entrada";
                      btnActionStatus = "in_school";
                      cancelStatus = "idle";
                      borderColor = "border-green-300"; bgColor = "bg-green-50";
                    } else if (student.status === 'pending_exit') {
                      badgeClass = "text-indigo-700"; badgeText = "Solicitação de Saída";
                      btnClass = "bg-indigo-600 hover:bg-indigo-700 text-white"; btnText = "Confirmar Saída";
                      btnActionStatus = "left";
                      cancelStatus = "in_school";
                      borderColor = "border-indigo-300"; bgColor = "bg-indigo-50";
                    }

                    return (
                      <div
                        key={student.id}
                        className={`p-5 border-2 ${borderColor} ${bgColor} rounded-2xl shadow-sm animate-in zoom-in-95 duration-300`}
                      >
                        <p className={`text-[10px] md:text-xs font-bold uppercase mb-1 flex items-center gap-1 ${badgeClass}`}>
                          <Clock size={12} /> {badgeText}
                        </p>
                        <h3 className="font-bold text-lg text-slate-800 mb-4">{student.name}</h3>
                        <div className="flex flex-col gap-2">
                          {/* Botão APROVAR: confirma o check-in/out e grava no attendance_logs */}
                          <button
                            title={student.status === 'pending_entry' ? 'Confirmar Check-in' : 'Confirmar Check-out'}
                            onClick={() => updateStudentStatus(student.id, btnActionStatus)}
                            className={`w-full font-bold py-3 rounded-xl active:scale-95 transition-all shadow-sm ${btnClass}`}
                          >
                            {btnText}
                          </button>
                          {/* Botão CANCELAR: reverte status sem gravar no attendance_logs */}
                          <button
                            title="Rejeitar solicitação"
                            onClick={() => rejectStudentStatus(student.id, cancelStatus)}
                            className="w-full font-semibold py-2 rounded-xl text-slate-500 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 active:scale-95 transition-all"
                          >
                            Cancelar Solicitação
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TOTEM AUTOATENDIMENTO */}
        {adminTab === 'kiosk' && (
          <div className="h-full bg-white p-6 sm:p-8 md:p-12 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center justify-center overflow-y-auto">
            {/* Header */}
            <div className="text-center mb-8 sm:mb-10 shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <ShieldCheck size={36} className="sm:hidden" />
                <ShieldCheck size={40} className="hidden sm:block" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-1 sm:mb-2">Autoatendimento</h2>
              <p className="text-slate-500 font-medium text-sm sm:text-base max-w-md mx-auto">
                Identifique-se
              </p>
            </div>

            {/* Botões — responsivo: coluna no celular, linha no tablet/desktop */}
            {currentSchool?.plan === 'pro' ? (
              /* Plano Pro: botões lado a lado (QR Code temporariamente desabilitado) */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl">
                <button
                  onClick={() => setIsFaceScannerOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border-2 border-emerald-200 hover:border-emerald-600 p-5 sm:p-8 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <Camera size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <Camera size={48} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-lg">Reconhecimento Facial</span>
                </button>

                {/* QR Code — temporariamente desabilitado. Para reabilitar: remover o 'false &&' abaixo */}
                {false && <button
                  onClick={() => setIsScannerOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border-2 border-indigo-200 hover:border-indigo-600 p-5 sm:p-8 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <QrCode size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <QrCode size={48} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-lg">Ler QR Code</span>
                </button>}

                <button
                  onClick={() => setIsPasswordLoginOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-slate-50 text-slate-700 hover:bg-slate-800 hover:text-white border-2 border-slate-200 hover:border-slate-800 p-5 sm:p-8 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <KeyRound size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <KeyRound size={48} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-lg">Senha / PIN</span>
                </button>
              </div>
            ) : (
              /* Plano Basic: botão único (QR Code temporariamente desabilitado) */
              <div className="grid grid-cols-1 gap-3 sm:gap-4 w-full max-w-md">
                {/* QR Code — temporariamente desabilitado. Para reabilitar: remover o 'false &&' abaixo */}
                {false && <button
                  onClick={() => setIsScannerOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border-2 border-indigo-200 hover:border-indigo-600 p-5 sm:p-10 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <QrCode size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <QrCode size={56} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-xl">Ler QR Code</span>
                </button>}

                <button
                  onClick={() => setIsPasswordLoginOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-slate-50 text-slate-700 hover:bg-slate-800 hover:text-white border-2 border-slate-200 hover:border-slate-800 p-5 sm:p-10 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <KeyRound size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <KeyRound size={56} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-xl">Senha / PIN</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* PRESENÇA */}
        {adminTab === 'presence' && <AdminDailyPresence currentUser={currentUser} />}

        {/* GESTÃO */}
        {adminTab === 'users' && <AdminUserManagement currentUser={currentUser} />}

        {/* LISTA DE ALUNOS */}
        {adminTab === 'students' && <AdminStudentList currentUser={currentUser} />}

        {/* HISTÓRICO */}
        {adminTab === 'history' && <AdminHistory currentSchool={currentSchool} />}

        {/* HORAS EXTRAS */}
        {adminTab === 'horas-extras' && <AdminRelatorioHorasExtras currentSchool={currentSchool} />}

        {/* TOTENS */}
        {adminTab === 'kiosks' && <AdminKioskManagement currentSchool={currentSchool} />}

        {/* CADASTRO */}
        {adminTab === 'register' && <AdminUserRegistration currentUser={currentUser} />}

        {/* CONFIGURAÇÕES */}
        {adminTab === 'settings' && <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} />}

        {/* QR Scanner Modal — temporariamente desabilitado. Para reabilitar: remover o 'false &&' abaixo */}
        {false && isScannerOpen && createPortal(
          <QRCodeScanner
            mode="admin"
            school_id={currentSchool?.id}
            currentSchool={currentSchool}
            students={students}
            updateStudentStatus={updateStudentStatus}
            onClose={() => setIsScannerOpen(false)}
            isLandscape={false}
          />,
          document.body
        )}

        {/* Face Scanner Modal */}
        {isFaceScannerOpen && createPortal(
          <AdminFaceScanner
            onClose={() => setIsFaceScannerOpen(false)}
            updateStudentStatus={updateStudentStatus}
            students={students}
            currentUser={currentUser}
          />,
          document.body
        )}

        {/* Password Login Modal */}
        {isPasswordLoginOpen && createPortal(
          <AdminPasswordLogin
            onClose={() => setIsPasswordLoginOpen(false)}
            updateStudentStatus={updateStudentStatus}
            currentUser={currentUser}
          />,
          document.body
        )}

        {/* Alerta de Check-in/Check-out — overlay em qualquer aba do Admin */}
        {pendingAlert && createPortal(
          <CheckinAlertModal
            alert={pendingAlert}
            onDismiss={onDismissAlert}
            onGoToMonitor={onGoToMonitor}
          />,
          document.body
        )}
      </main>
    </div>
  );
}
