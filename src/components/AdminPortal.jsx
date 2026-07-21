import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Car, Clock, Bell, QrCode, ShieldCheck, KeyRound, Users, CalendarDays, Settings, Monitor, Camera, ShieldHalf, Smartphone } from 'lucide-react';
import AdminUserRegistration from './AdminUserRegistration';
import AdminUserManagement from './AdminUserManagement';
import AdminDailyPresence from './AdminDailyPresence';
import AdminStudentList from './AdminStudentList';
import AdminQRScanner from './AdminQRScanner';
import AdminFaceScanner from './AdminFaceScanner';
import AdminPasswordLogin from './AdminPasswordLogin';
import AdminHistory from './AdminHistory';
import AdminSettings from './AdminSettings';
import AdminKioskManagement from './AdminKioskManagement';
import { preloadFaceModels } from '../lib/faceModels';

export default function AdminPortal({ currentUser, currentSchool, students, adminTab, setAdminTab, updateStudentStatus, onUpdateSchool, isMobileMenuOpen, setIsMobileMenuOpen }) {
  const monitorStudents = students.filter(s => ['pending_entry', 'pending_exit'].includes(s.status));
  const prevMonitorCount = useRef(monitorStudents.length);
  const [newArrival, setNewArrival] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState(false);
  const [isPasswordLoginOpen, setIsPasswordLoginOpen] = useState(false);

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
        <div className="h-full bg-white p-3 pt-28 md:pt-3 rounded-r-3xl md:rounded-3xl shadow-2xl md:shadow-sm border-r md:border border-slate-200 flex flex-col overflow-y-auto">
          <p className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 mt-2 shrink-0">Navegação Principal</p>
          <nav className="flex-1 flex flex-col gap-1 min-h-0 pr-0.5">
            <button
              onClick={() => { setAdminTab('monitor'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'monitor' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Monitor size={18} />
              Monitor Check-in
              {monitorStudents.length > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                  {monitorStudents.length}
                </span>
              )}
            </button>
            <button
              onClick={() => { 
                // MOTIVO TÉCNICO PARA MANTER O RELOAD: 
                // O projeto não utiliza react-router-dom. O roteamento no App.jsx 
                // é baseado na avaliação direta de window.location.pathname sem um 
                // listener de history (popstate). Portanto, é necessário forçar o 
                // reload da página (href) para que o React monte a árvore com a nova rota.
                window.location.href = '/admin/totem-checkin'; 
              }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-500 hover:bg-slate-50 hover:text-slate-700`}
            >
              <QrCode size={16} />
              Totem Check-in
            </button>
            <button
              onClick={() => { setAdminTab('presence'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'presence' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <ShieldCheck size={16} />
              Presença Diária
            </button>
            <button
              onClick={() => { setAdminTab('users'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Users size={16} />
              Gestão de Usuários
            </button>
            <button
              onClick={() => { setAdminTab('students'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'students' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Users size={16} />
              Lista de Alunos
            </button>
            <button
              onClick={() => { setAdminTab('history'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <CalendarDays size={16} />
              Histórico Geral
            </button>
            <button
              onClick={() => { setAdminTab('register'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'register' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <ShieldHalf size={16} />
              Cadastro de Usuários
            </button>
            <button
              onClick={() => { setAdminTab('kiosks'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'kiosks' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Smartphone size={16} />
              Gerenciar Totens
            </button>
            <button
              onClick={() => { setAdminTab('settings'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${adminTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Settings size={16} />
              Configurações
            </button>
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
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
                  <h2 className="text-xl font-bold text-slate-800">Monitor de Check-in/out</h2>
                  <p className="text-sm text-slate-500">Acompanhe as solicitações e chegadas em tempo real</p>
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
                    let badgeClass, badgeText, btnClass, btnText, btnActionStatus, borderColor, bgColor;

                    if (student.status === 'pending_entry') {
                      badgeClass = "text-green-700"; badgeText = "Solicitação de Entrada";
                      btnClass = "bg-green-600 hover:bg-green-700 text-white"; btnText = "Confirmar Entrada";
                      btnActionStatus = "in_school";
                      borderColor = "border-green-300"; bgColor = "bg-green-50";
                    } else if (student.status === 'pending_exit') {
                      badgeClass = "text-indigo-700"; badgeText = "Solicitação de Saída";
                      btnClass = "bg-indigo-600 hover:bg-indigo-700 text-white"; btnText = "Confirmar Saída";
                      btnActionStatus = "left";
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
                        <button
                          onClick={() => updateStudentStatus(student.id, btnActionStatus)}
                          className={`w-full font-bold py-3 rounded-xl active:scale-95 transition-all shadow-sm ${btnClass}`}
                        >
                          {btnText}
                        </button>
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
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-1 sm:mb-2">Autoatendimento Zela</h2>
              <p className="text-slate-500 font-medium text-sm sm:text-base max-w-md mx-auto">
                Escolha abaixo como deseja se identificar para realizar a entrada ou saída do aluno.
              </p>
            </div>

            {/* Botões — responsivo: coluna no celular, linha no tablet/desktop */}
            {currentSchool?.plan === 'pro' ? (
              /* Plano Pro: 3 botões lado a lado */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-3xl">
                <button
                  onClick={() => setIsFaceScannerOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border-2 border-emerald-200 hover:border-emerald-600 p-5 sm:p-8 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <Camera size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <Camera size={48} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-lg">Reconhecimento Facial</span>
                </button>

                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border-2 border-indigo-200 hover:border-indigo-600 p-5 sm:p-8 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <QrCode size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <QrCode size={48} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-lg">Ler QR Code</span>
                </button>

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
              /* Plano Basic: 2 botões lado a lado */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl">
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border-2 border-indigo-200 hover:border-indigo-600 p-5 sm:p-10 rounded-2xl sm:rounded-3xl transition-all shadow-sm group aspect-auto sm:aspect-square"
                >
                  <QrCode size={32} className="sm:hidden group-hover:scale-110 transition-transform shrink-0" />
                  <QrCode size={56} className="hidden sm:block group-hover:scale-110 transition-transform" />
                  <span className="font-black text-base sm:text-xl">Ler QR Code</span>
                </button>

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

        {/* TOTENS */}
        {adminTab === 'kiosks' && <AdminKioskManagement currentSchool={currentSchool} />}

        {/* CADASTRO */}
        {adminTab === 'register' && <AdminUserRegistration currentUser={currentUser} />}

        {/* CONFIGURAÇÕES */}
        {adminTab === 'settings' && <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} />}

        {/* QR Scanner Modal */}
        {isScannerOpen && createPortal(
          <AdminQRScanner
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(updatedStudents) => {
              // A interface vai atualizar sozinha via Realtime (App.jsx), 
              // mas onScanSuccess pode ser usado para efeitos ou logs extras.
            }}
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
      </main>
    </div>
  );
}
