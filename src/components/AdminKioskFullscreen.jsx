import React, { useState } from 'react';
import { Lock, ShieldCheck, X, Loader2, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AdminFaceScanner from './AdminFaceScanner';

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

export default function AdminKioskFullscreen({ currentUser, currentSchool, students, updateStudentStatus }) {
  const [showExitModal, setShowExitModal] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col bg-slate-900 overflow-hidden font-sans">
      {/* Cabeçalho Minimalista do Totem */}
      <header className="bg-white px-6 py-4 flex justify-between items-center shrink-0 border-b-4 border-indigo-500 shadow-md z-10">
        <div className="flex items-center gap-3">
          {currentSchool?.logo_url ? (
            <img src={currentSchool.logo_url} alt="Escola" className="w-10 h-10 object-contain" />
          ) : (
            <div className="w-10 h-10 bg-indigo-950 rounded-xl flex items-center justify-center">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
          )}
          <div>
            <h1 className="font-black text-xl text-slate-800 leading-none">Autoatendimento</h1>
            <p className="text-sm font-bold text-slate-400">{currentSchool?.name || 'Zela Portal'}</p>
          </div>
        </div>

        <button 
          onClick={handleExitClick}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95"
        >
          <Lock size={18} className="text-slate-500" />
          <span className="hidden sm:inline">Sair do Modo Totem</span>
        </button>
      </header>

      {/* Conteúdo Principal: Scanner Ocupando Tudo */}
      <main className="flex-1 relative bg-slate-900 w-full h-full flex flex-col min-h-0 overflow-hidden">
        <AdminFaceScanner
          onClose={() => {}} // Não faz nada no Kiosk Mode nativo, pois o header do scanner foi ocultado
          updateStudentStatus={updateStudentStatus}
          students={students}
          currentUser={currentUser}
          isKioskMode={true} // Prop para esconder o cabeçalho do scanner e remover bordas modais
        />
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
    </div>
  );
}
