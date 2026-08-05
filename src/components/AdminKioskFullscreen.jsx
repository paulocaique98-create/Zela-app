import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Lock, ShieldCheck, X, Loader2, KeyRound, Settings, Camera, QrCode } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AdminPasswordLogin from './AdminPasswordLogin';

const AdminFaceScanner = lazy(() => import('./AdminFaceScanner'));
const AdminKioskFaceRegistration = lazy(() => import('./AdminKioskFaceRegistration'));
const QRCodeScanner = lazy(() => import('./QRCodeScanner'));

/*
 * IMPORTANTE — NOTA DE SEGURANÇA:
 * Esta tela de Kiosk (Totem) continua utilizando a MESMA sessão autenticada do Administrador.
 * Não se trata de um dispositivo fisicamente pareado e isolado (como o antigo /totem).
 * A exigência de senha/PIN para sair desta tela é uma barreira de USO/UX 
 * (para evitar que crianças ou visitantes saiam do modo totem acidentalmente).
 * Não é uma barreira de segurança estrita: se alguém acessar a URL diretamente ou 
 * usar o DevTools, a sessão do admin continua ativa por trás.
 * (Caso necessite de maior segurança no futuro, deve-se voltar a usar uma sessão segregada)
 */

export default function AdminKioskFullscreen({ currentUser, currentSchool, students, updateStudentStatus, requestKioskAccess }) {
  const [showExitModal, setShowExitModal] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Modos do Kiosk
  // QR Code temporariamente desabilitado — modo padrão alterado para 'manual'.
  // Para reabilitar: restaurar para currentSchool?.plan === 'pro' ? 'facial' : 'qrcode'
  const [activeMode, setActiveMode] = useState(currentSchool?.plan === 'pro' ? 'facial' : 'manual');
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    const handleResize = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Melhoria 2: Screen Wake Lock API para impedir tela de escurecer
  useEffect(() => {
    let wakeLock = null;
    
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('[Zela] Wake Lock ativo — tela não irá escurecer.');
        }
      } catch (err) {
        console.warn('[Zela] Wake Lock não disponível:', err.message);
      }
    };
    
    requestWakeLock();
    
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().then(() => {
          console.log('[Zela] Wake Lock liberado.');
        });
      }
    };
  }, []);

  // Estados do Cadastro Facial
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [showRegistrationPanel, setShowRegistrationPanel] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);

  const handleExitClick = () => {
    setShowExitModal(true);
    setPassword('');
    setError('');
  };

  const handleConfirmExit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Reautenticação simples usando signInWithPassword com o e-mail da sessão ativa
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: password,
      });

      if (signInError) {
        throw new Error('Senha incorreta. Tente novamente.');
      }

      // Se a senha estiver correta, volta para o painel de admin
      // TO-DO: Numa iteração futura, adicionar rate-limit para evitar força bruta
      
      // MOTIVO TÉCNICO PARA MANTER O RELOAD:
      // Como não há react-router-dom no projeto, window.location.href é necessário
      // para forçar a reavaliação de rotas nativas no App.jsx e resetar o estado de Kiosk.
      window.location.href = '/'; 
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
    setSettingsPassword('');
    setSettingsError('');
  };

  const handleConfirmSettings = async (e) => {
    e.preventDefault();
    setIsSettingsLoading(true);
    setSettingsError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: settingsPassword,
      });

      if (signInError) {
        throw new Error('Senha incorreta. Tente novamente.');
      }

      setShowSettingsModal(false);
      setShowRegistrationPanel(true);
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setIsSettingsLoading(false);
    }
  };

  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col bg-white overflow-hidden font-sans">
      {/* Cabeçalho Minimalista do Totem */}
      <header className="bg-white px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center shrink-0 border-b-4 border-indigo-500 shadow-md z-10 gap-4 sm:gap-0">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
          {currentSchool?.logo_url ? (
            <img src={currentSchool.logo_url} alt="Escola" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
          ) : (
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-950 rounded-xl flex items-center justify-center">
              <ShieldCheck className="text-white w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          )}
          <div className="text-center sm:text-left">
            <h1 className="font-black text-lg sm:text-xl text-slate-800 leading-none">Autoatendimento</h1>
            <p className="text-xs sm:text-sm font-bold text-slate-400">{currentSchool?.name || 'Zela Portal'}</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center sm:justify-end gap-2 w-full sm:w-auto">
          {currentSchool?.plan === 'pro' && (
            <button 
              onClick={() => setActiveMode('facial')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold transition-all active:scale-95 ${activeMode === 'facial' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Camera size={18} /> <span className="hidden sm:inline">Facial</span>
            </button>
          )}
          
          {/* QR Code — temporariamente desabilitado. Para reabilitar: remover o 'false &&' abaixo */}
          {false && <button 
            onClick={() => setActiveMode('qrcode')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold transition-all active:scale-95 ${activeMode === 'qrcode' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <QrCode size={18} /> <span className="hidden sm:inline">QR Code</span>
          </button>}
          
          <button 
            onClick={() => setActiveMode('manual')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold transition-all active:scale-95 ${activeMode === 'manual' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <KeyRound size={18} /> <span className="hidden sm:inline">Senha</span>
          </button>

          <div className="w-px h-8 bg-slate-200 mx-1 self-center"></div>

          <button 
            onClick={handleSettingsClick}
            className="flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 w-10 sm:w-11 h-10 sm:h-11 rounded-xl transition-all active:scale-95"
            title="Cadastro Facial"
          >
            <Settings size={20} className="text-slate-500" />
          </button>
          
          <button 
            onClick={handleExitClick}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95"
          >
            <Lock size={18} className="text-slate-500" />
            <span className="hidden sm:inline">Sair do Modo Totem</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Principal: Scanner Ocupando Tudo */}
      <main className="flex-1 relative bg-white w-full h-full flex flex-col min-h-0 overflow-hidden">
        <Suspense fallback={<div className="flex-1 flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" /><p className="text-white text-sm font-semibold">Carregando módulo...</p></div>}>
          {activeMode === 'facial' && (
            <AdminFaceScanner
              key={scannerKey}
              onClose={() => {}} // Não faz nada no Kiosk Mode nativo
              updateStudentStatus={updateStudentStatus}
              requestKioskAccess={requestKioskAccess}
              students={students}
              currentUser={currentUser}
              isKioskMode={true} 
            />
          )}
          
          {/* QRCodeScanner — temporariamente desabilitado. Para reabilitar: remover o 'false &&' abaixo */}
          {false && activeMode === 'qrcode' && (
            <QRCodeScanner
              mode="kiosk"
              isLandscape={isLandscape}
              school_id={currentSchool?.id}
              currentSchool={currentSchool}
              students={students}
              updateStudentStatus={updateStudentStatus}
              requestKioskAccess={requestKioskAccess}
            />
          )}

          {activeMode === 'manual' && (
            <AdminPasswordLogin
              onClose={() => setActiveMode(currentSchool?.plan === 'pro' ? 'facial' : 'manual')}
              updateStudentStatus={updateStudentStatus}
              requestKioskAccess={requestKioskAccess}
              currentUser={currentUser}
            />
          )}
        </Suspense>
      </main>

      {/* Modal de Saída com Senha */}
      {showExitModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-bold flex items-center gap-2 text-slate-800 text-lg">
                <Lock size={20} className="text-indigo-600" /> Confirme sua identidade
              </h3>
              <button 
                onClick={() => setShowExitModal(false)}
                className="p-2 -mr-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"
                disabled={isLoading}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-500 mb-6 font-medium">
                Por segurança, digite a senha da sua conta de administrador (<span className="text-slate-800 font-bold">{currentUser.email}</span>) para sair do modo Totem.
              </p>

              <form onSubmit={handleConfirmExit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Senha do Admin</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound size={18} className="text-slate-400" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                      placeholder="Sua senha..."
                      required
                      autoFocus
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !password}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-3.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 mt-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Desbloquear e Sair'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configurações / Cadastro Facial com Senha */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-bold flex items-center gap-2 text-slate-800 text-lg">
                <Settings size={20} className="text-indigo-600" /> Cadastro Facial
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-2 -mr-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"
                disabled={isSettingsLoading}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-500 mb-6 font-medium">
                Por segurança, digite a senha de administrador (<span className="text-slate-800 font-bold">{currentUser.email}</span>) para acessar o cadastro de responsáveis.
              </p>

              <form onSubmit={handleConfirmSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Senha do Admin</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound size={18} className="text-slate-400" />
                    </div>
                    <input
                      type="password"
                      value={settingsPassword}
                      onChange={(e) => setSettingsPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                      placeholder="Sua senha..."
                      required
                      autoFocus
                      disabled={isSettingsLoading}
                    />
                  </div>
                </div>

                {settingsError && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                    {settingsError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSettingsLoading || !settingsPassword}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black py-3.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 mt-2"
                >
                  {isSettingsLoading ? <Loader2 size={18} className="animate-spin" /> : 'Acessar Cadastro'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Painel de Cadastro Facial (Overlay) */}
      {showRegistrationPanel && (
        <Suspense fallback={<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm"><Loader2 className="w-12 h-12 text-white animate-spin" /></div>}>
          <AdminKioskFaceRegistration 
            currentSchool={currentSchool}
            students={students} 
            onClose={() => {
              setShowRegistrationPanel(false);
              setScannerKey(prev => prev + 1); // Força remount do scanner para atualizar biometrias
            }} 
          />
        </Suspense>
      )}
    </div>
  );
}
