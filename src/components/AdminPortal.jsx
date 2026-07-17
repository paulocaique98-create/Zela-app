import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Car, Clock, Bell, QrCode, ShieldCheck, KeyRound, Users, CalendarDays, Settings, Monitor, Camera, ShieldHalf, Smartphone } from 'lucide-react';
import AdminUserRegistration from './AdminUserRegistration';
import AdminUserManagement from './AdminUserManagement';
import AdminDailyPresence from './AdminDailyPresence';
import AdminStudentList from './AdminStudentList';
import AdminQRScanner from './AdminQRScanner';
import AdminFaceScanner from './AdminFaceScanner';
import AdminHistory from './AdminHistory';
import AdminSettings from './AdminSettings';
import AdminKioskManagement from './AdminKioskManagement';
// removed Camera import as it's now in the top import
import { preloadFaceModels } from '../lib/faceModels';

export default function AdminPortal({ currentUser, currentSchool, students, adminTab, setAdminTab, updateStudentStatus, onUpdateSchool }) {
  const monitorStudents = students.filter(s => ['pending_entry', 'pending_exit'].includes(s.status));
  const prevMonitorCount = useRef(monitorStudents.length);
  const [newArrival, setNewArrival] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState(false);

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
    <div className="flex flex-col md:flex-row gap-6 w-full h-full animate-in fade-in pb-12">

      {/* MENU LATERAL (SIDEBAR) - Apenas Desktop */}
      <aside className="hidden md:block w-64 shrink-0">
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 sticky top-[80px] space-y-2">
          <p className="px-4 text-xs font-black text-slate-400 uppercase tracking-widest mb-4 mt-2">Navegação Principal</p>
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setAdminTab('monitor')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'monitor' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
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
              onClick={() => setAdminTab('kiosk')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'kiosk' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <QrCode size={18} />
              Totem Check-in
            </button>
            <button
              onClick={() => setAdminTab('presence')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'presence' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <ShieldCheck size={18} />
              Presença Diária
            </button>
            <button
              onClick={() => setAdminTab('users')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Users size={18} />
              Gestão de Usuários
            </button>
            <button
              onClick={() => setAdminTab('students')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'students' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Users size={18} />
              Lista de Alunos
            </button>
            <button
              onClick={() => setAdminTab('history')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <CalendarDays size={18} />
              Histórico Geral
            </button>
            <button
              onClick={() => setAdminTab('register')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'register' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <ShieldHalf size={18} />
              Cadastro de Usuários
            </button>
            <button
              onClick={() => setAdminTab('kiosks')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'kiosks' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Smartphone size={18} />
              Gerenciar Totens
            </button>
            <button
              onClick={() => setAdminTab('settings')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${adminTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <Settings size={18} />
              Configurações
            </button>
          </nav>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 min-w-0 space-y-6">
        {/* MONITOR */}
        {adminTab === 'monitor' && (
          <div className={`bg-white p-5 md:p-6 rounded-3xl shadow-sm border-2 transition-all duration-500 ${newArrival ? 'border-amber-400 shadow-amber-100 shadow-lg' : 'border-slate-200'}`}>

            {/* Header do Monitor */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
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
              <div className="mb-5 p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <Bell className="text-amber-600 shrink-0 animate-bounce" size={22} />
                <div>
                  <p className="font-bold text-amber-800">Nova atualização no painel!</p>
                  <p className="text-xs text-amber-600">Confirme a solicitação de check-in/out abaixo.</p>
                </div>
              </div>
            )}

            {/* Cards dos alunos */}
            {monitorStudents.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                <Car className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <h3 className="text-slate-500 font-medium">Nenhuma solicitação no momento.</h3>
                <p className="text-slate-400 text-sm mt-1">O painel atualiza automaticamente com o totem e avisos das famílias.</p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
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
            )}
          </div>
        )}

        {/* TOTEM AUTOATENDIMENTO */}
        {adminTab === 'kiosk' && (
          <div className="bg-white p-6 sm:p-8 md:p-12 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center justify-center min-h-[60vh]">
            {/* Header */}
            <div className="text-center mb-8 sm:mb-10">
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
                  onClick={() => alert('Autenticação por senha será implementada em breve!')}
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
                  onClick={() => alert('Autenticação por senha será implementada em breve!')}
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
        {isScannerOpen && (
          <AdminQRScanner
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(updatedStudents) => {
              // A interface vai atualizar sozinha via Realtime (App.jsx), 
              // mas onScanSuccess pode ser usado para efeitos ou logs extras.
            }}
          />
        )}

        {/* Face Scanner Modal */}
        {isFaceScannerOpen && (
          <AdminFaceScanner
            onClose={() => setIsFaceScannerOpen(false)}
            updateStudentStatus={updateStudentStatus}
            students={students}
            currentUser={currentUser}
          />
        )}
      </main>
    </div>
  );
}
