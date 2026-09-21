import React from 'react';
import { X } from 'lucide-react';

export default function AuthModal({ authForm, setAuthForm, onClose, onSave, error, limitsInfo }) {
  const { maxGeral, countGeral, maxTransporte, countTransporte } = limitsInfo || {};
  const handleSubmit = (e) => {
    e.preventDefault();
    const newPerson = {
      id: 'a' + Date.now(),
      name: authForm.name,
      relation: authForm.relation,
      hasPhoto: false, 
      status: 'pending', 
      emergencyOrder: authForm.emergencyOrder ? parseInt(authForm.emergencyOrder) : null,
      temporaryUntil: authForm.isTemporary && authForm.temporaryUntil 
        ? new Date(authForm.temporaryUntil + 'T00:00:00').toLocaleDateString('pt-BR') 
        : null
    };
    onSave(newPerson);
  };

  const isTransporte = authForm.relation === 'Transporte';
  const remainingGeral = maxGeral != null ? Math.max(0, maxGeral - countGeral) : null;
  const remainingTransporte = maxTransporte != null ? Math.max(0, maxTransporte - countTransporte) : null;
  const categoryFull = isTransporte ? remainingTransporte === 0 : remainingGeral === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white sm:rounded-3xl shadow-xl w-full h-full sm:w-full sm:h-auto sm:max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 sm:p-5 md:p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h3 className="font-bold text-lg text-slate-800">Novo Autorizado</h3>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-200 p-2 rounded-full transition-colors"><X size={20}/></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 md:p-6 space-y-4 overflow-y-auto h-full max-h-[calc(100vh-80px)] sm:max-h-none pb-20 sm:pb-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">{error}</div>
          )}

          {limitsInfo && (
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-800 space-y-1">
              <p><strong>{remainingGeral}</strong> de {maxGeral} vaga{maxGeral !== 1 ? 's' : ''} de autorizado geral ainda disponíve{remainingGeral === 1 ? 'l' : 'is'}.</p>
              {maxTransporte > 0 && (
                <p><strong>{remainingTransporte}</strong> de {maxTransporte} vaga{maxTransporte !== 1 ? 's' : ''} de transporte escolar ainda disponíve{remainingTransporte === 1 ? 'l' : 'is'}.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">Nome Completo</label>
            <input type="text" required value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm" placeholder="Ex: Carlos Silva" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">Parentesco</label>
              <select value={authForm.relation} onChange={e => setAuthForm({...authForm, relation: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm text-slate-700">
                <option>Pai/Mãe</option>
                <option>Avô/Avó</option>
                <option>Tio/Tia</option>
                <option value="Transporte">Transporte Escolar</option>
                <option>Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">Emergência</label>
              <select value={authForm.emergencyOrder} onChange={e => setAuthForm({...authForm, emergencyOrder: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm text-slate-700">
                <option value="">Não acionar</option>
                <option value="1">1º Contato</option>
                <option value="2">2º Contato</option>
                <option value="3">3º Contato</option>
              </select>
            </div>
          </div>
          
          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              <input type="checkbox" checked={authForm.isTemporary} onChange={e => setAuthForm({...authForm, isTemporary: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
              <span className="text-sm font-semibold text-slate-700">Autorização Temporária</span>
            </label>
          </div>

          {authForm.isTemporary && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-[10px] md:text-xs font-bold text-amber-600 uppercase mb-1">Válido até o final do dia:</label>
              <input type="date" required value={authForm.temporaryUntil} min={new Date().toISOString().split('T')[0]} onChange={e => setAuthForm({...authForm, temporaryUntil: e.target.value})} className="w-full p-3 bg-amber-50 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm text-amber-900" />
            </div>
          )}

          {categoryFull && (
            <p className="text-xs text-red-600 font-medium">
              Limite de {isTransporte ? 'transporte escolar' : 'autorizados gerais'} atingido — troque o parentesco ou remova um autorizado existente antes de adicionar outro.
            </p>
          )}

          <div className="pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={categoryFull}
              className="w-full bg-indigo-950 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-900 active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              Adicionar Autorizado
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
