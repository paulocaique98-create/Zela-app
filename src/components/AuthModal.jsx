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
      <div className="fixed inset-0 bg-ink/50 transition-opacity" onClick={onClose}></div>
      <div className="relative bg-surface-container-lowest sm:rounded-xl border border-outline-variant w-full h-full sm:w-full sm:h-auto sm:max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 sm:p-5 md:p-6 border-b border-outline-variant bg-surface-container-low shrink-0">
          <h3 className="font-bold text-lg text-on-surface">Novo autorizado</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-on-surface-variant hover:bg-surface-container p-2 rounded-md transition-colors"><X size={20} aria-hidden="true"/></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 md:p-6 space-y-4 overflow-y-auto h-full max-h-[calc(100vh-80px)] sm:max-h-none pb-20 sm:pb-6">
          {error && (
            <div className="p-3 bg-error/5 border border-error/30 rounded-md text-sm text-error font-medium" role="alert">{error}</div>
          )}

          {limitsInfo && (
            <div className="p-3 bg-surface-container-low border border-outline-variant rounded-md text-xs text-on-surface space-y-1">
              <p><strong>{remainingGeral}</strong> de {maxGeral} vaga{maxGeral !== 1 ? 's' : ''} de autorizado geral ainda disponíve{remainingGeral === 1 ? 'l' : 'is'}.</p>
              {maxTransporte > 0 && (
                <p><strong>{remainingTransporte}</strong> de {maxTransporte} vaga{maxTransporte !== 1 ? 's' : ''} de transporte escolar ainda disponíve{remainingTransporte === 1 ? 'l' : 'is'}.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-label text-on-surface mb-1">Nome completo</label>
            <input type="text" required value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} className="w-full p-3 bg-surface-container-lowest border border-outline-variant rounded-md focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm" placeholder="Ex: Carlos Silva" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-label text-on-surface mb-1">Parentesco</label>
              {/* "Pai/Mãe" saiu em 29/09/2026: o outro pai/mãe tem conta
                  própria (Gerenciamento › Responsáveis), não é autorizado.
                  Só aparece para não quebrar a edição de cadastro antigo. */}
              <select value={authForm.relation} onChange={e => setAuthForm({...authForm, relation: e.target.value})} className="w-full p-3 bg-surface-container-lowest border border-outline-variant rounded-md focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm text-on-surface">
                {authForm.relation === 'Pai/Mãe' && <option>Pai/Mãe</option>}
                <option>Avô/Avó</option>
                <option>Tio/Tia</option>
                <option value="Transporte">Transporte Escolar</option>
                <option>Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-label text-on-surface mb-1">Emergência</label>
              <select value={authForm.emergencyOrder} onChange={e => setAuthForm({...authForm, emergencyOrder: e.target.value})} className="w-full p-3 bg-surface-container-lowest border border-outline-variant rounded-md focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm text-on-surface">
                <option value="">Não acionar</option>
                <option value="1">1º Contato</option>
                <option value="2">2º Contato</option>
                <option value="3">3º Contato</option>
              </select>
            </div>
          </div>
          
          <p className="text-xs text-on-surface-variant">
            O outro pai ou a outra mãe da criança não entra como autorizado: cadastre em <strong>Gerenciamento › Responsáveis</strong>, com acesso próprio ao Zela Escola.
          </p>

          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer p-3 border border-outline-variant rounded-md hover:bg-surface-container-low transition">
              <input type="checkbox" checked={authForm.isTemporary} onChange={e => setAuthForm({...authForm, isTemporary: e.target.checked})} className="w-5 h-5 accent-primary rounded-sm" />
              <span className="text-sm font-semibold text-on-surface">Autorização temporária</span>
            </label>
          </div>

          {authForm.isTemporary && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-label text-warning mb-1">Válido até o final do dia</label>
              <input type="date" required value={authForm.temporaryUntil} min={new Date().toISOString().split('T')[0]} onChange={e => setAuthForm({...authForm, temporaryUntil: e.target.value})} className="w-full p-3 bg-surface-container-lowest border border-warning/50 rounded-md focus:ring-2 focus:ring-warning/30 focus:outline-none text-sm text-on-surface" />
            </div>
          )}

          {categoryFull && (
            <p className="text-xs text-error font-medium">
              Limite de {isTransporte ? 'transporte escolar' : 'autorizados gerais'} atingido. Troque o parentesco ou remova um autorizado existente antes de adicionar outro.
            </p>
          )}

          <div className="pt-4 border-t border-outline-variant">
            <button
              type="submit"
              disabled={categoryFull}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-md hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Adicionar autorizado
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
