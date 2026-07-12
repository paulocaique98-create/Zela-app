import { Home, CalendarDays, Settings, AlertCircle, Users, LogOut, X, Smartphone } from 'lucide-react';

export default function MobileMenu({ 
  currentUser, 
  adminTab, setAdminTab, 
  familyTab, setFamilyTab, 
  onClose, onLogout 
}) {
  return (
    <div className="fixed inset-0 z-50 flex md:hidden">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative mr-auto w-72 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="font-bold text-slate-800 truncate">{currentUser.name}</h2>
            <p className="text-xs text-slate-500 capitalize">{currentUser.role === 'admin' ? 'Administrador' : 'Portal dos Pais'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-4">
          {currentUser.role === 'family' ? (
            <nav className="flex flex-col gap-2">
              <button onClick={() => { setFamilyTab('home'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${familyTab === 'home' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Home size={18}/> Início
              </button>
              <button onClick={() => { setFamilyTab('authorized'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${familyTab === 'authorized' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Users size={18}/> Autorizados
              </button>
              <button onClick={() => { setFamilyTab('wallet'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${familyTab === 'wallet' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <LogOut size={18} className="rotate-180" /> Carteira
              </button>
              <button onClick={() => { setFamilyTab('history'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${familyTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <CalendarDays size={18}/> Históricos
              </button>
              <button onClick={() => { setFamilyTab('settings'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${familyTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Settings size={18}/> Configurações
              </button>
            </nav>
          ) : (
            <nav className="flex flex-col gap-2">
              <button onClick={() => { setAdminTab('monitor'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'monitor' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <AlertCircle size={18}/> Monitor de Check-in/out
              </button>
              <button onClick={() => { setAdminTab('kiosk'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'kiosk' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <AlertCircle size={18}/> Totem Autoatendimento
              </button>
              <button onClick={() => { setAdminTab('presence'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'presence' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Users size={18}/> Presença Diária
              </button>
              <button onClick={() => { setAdminTab('users'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Users size={18}/> Gestão de Usuários
              </button>
              <button onClick={() => { setAdminTab('students'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'students' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Users size={18}/> Lista de Alunos
              </button>
              <button onClick={() => { setAdminTab('history'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <CalendarDays size={18}/> Histórico
              </button>
              <button onClick={() => { setAdminTab('register'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'register' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Users size={18}/> Cadastro de Usuários
              </button>
              <button onClick={() => { setAdminTab('kiosks'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'kiosks' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Smartphone size={18}/> Gerenciar Totens
              </button>
              <button onClick={() => { setAdminTab('settings'); onClose(); }} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${adminTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                <Settings size={18}/> Configurações
              </button>
            </nav>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-100">
          <button onClick={() => { onLogout(); onClose(); }} className="w-full flex items-center justify-center gap-2 p-3.5 text-red-600 bg-red-50 rounded-xl font-bold hover:bg-red-100 transition-colors">
            <LogOut size={18} /> Sair do Sistema
          </button>
        </div>
      </div>
    </div>
  );
}
