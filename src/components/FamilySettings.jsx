import React, { useState } from 'react';
import { User, FileText, ChevronRight, X, Check, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Texto do LGPD ────────────────────────────────────────────────────────────
const LGPD_TEXT = `TERMO DE CONSENTIMENTO — PROTEÇÃO DE DADOS (LGPD)

A Escola Montessori de Virtória (SenseKids), em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD), informa:

1. DADOS COLETADOS
   Coletamos nome, e-mail, telefone, imagem facial e dados de saúde dos alunos exclusivamente para fins de segurança, controle de presença e comunicação escolar.

2. FINALIDADE
   Os dados são utilizados para: (a) controle de entrada e saída de alunos; (b) reconhecimento facial na portaria; (c) comunicação com responsáveis; (d) acompanhamento pedagógico e de saúde.

3. COMPARTILHAMENTO
   Os dados não serão compartilhados com terceiros sem consentimento expresso, exceto quando exigido por lei.

4. ARMAZENAMENTO E SEGURANÇA
   As informações são armazenadas em servidores seguros com criptografia e acesso restrito à equipe autorizada da escola.

5. DIREITOS DO TITULAR
   Você tem direito a acessar, corrigir ou solicitar a exclusão de seus dados a qualquer momento, entrando em contato com a administração escolar.

6. CONSENTIMENTO
   Ao concordar com este termo, você autoriza a Escola Zela a tratar os dados pessoais listados acima conforme descrito.`;

// ─── Modal LGPD ───────────────────────────────────────────────────────────────
function LGPDModal({ alreadyAccepted, onAccept, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <FileText size={20} className="text-indigo-600" /> Consentimento LGPD
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          <pre className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">{LGPD_TEXT}</pre>
        </div>
        <div className="p-5 border-t border-slate-100 shrink-0">
          {alreadyAccepted ? (
            <div className="flex items-center justify-center gap-2 text-green-600 font-bold text-sm bg-green-50 py-3 rounded-xl border border-green-200">
              <Check size={18}/> Termo aceito
            </div>
          ) : (
            <button onClick={onAccept} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition flex items-center justify-center gap-2">
              <Check size={18}/> Li e Concordo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Modal Editar Dados ───────────────────────────────────────────────────────
function EditAccountModal({ currentUser, setCurrentUser, onClose }) {
  const [form, setForm] = useState({ email: currentUser.email, phone: currentUser.phone || '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { error: dbError } = await supabase
        .from('users').update({ email: form.email, phone: form.phone }).eq('id', currentUser.id);
      if (dbError) {
        if (dbError.code === '23505') throw new Error('Este e-mail já está em uso por outro usuário.');
        throw dbError;
      }
      setCurrentUser(prev => ({ ...prev, email: form.email, phone: form.phone }));
      onClose();
    } catch (e) { setError(e.message || 'Erro ao salvar.'); } finally { setIsLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Pencil size={18} className="text-indigo-600"/> Editar Dados</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={20}/></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail de Acesso</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone de Contato</label>
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="(11) 90000-0000"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={isLoading} className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition text-sm disabled:opacity-70">
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function FamilySettings({ currentUser, setCurrentUser, currentSchool }) {
  const [modal, setModal] = useState(null); // null | 'edit' | 'lgpd' | 'medical'
  const [lgpdAccepted, setLgpdAccepted] = useState(!!currentUser.lgpd_accepted);

  const handleLgpdAccept = async () => {
    try {
      await supabase.from('users').update({ lgpd_accepted: true }).eq('id', currentUser.id);
      setLgpdAccepted(true);
      setCurrentUser(prev => ({ ...prev, lgpd_accepted: true }));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Configurações</h2>
        <p className="text-slate-500 text-sm">Gestão de autorizações e informações.</p>
      </div>

      {/* Grid: Conta + Documentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

        <div className="space-y-4">

          {/* Conta da Família */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-base text-slate-800 flex items-center gap-2 mb-4">
              <User className="text-indigo-600" size={18}/> Conta da Família
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">E-mail de Acesso</label>
                <p className="text-sm font-medium text-slate-700 truncate">{currentUser.email}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Telefone de Contato</label>
                <p className="text-sm font-medium text-slate-700">{currentUser.phone || 'Não cadastrado'}</p>
              </div>
              <button
                onClick={() => setModal('edit')}
                className="w-full mt-1 border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl hover:bg-slate-50 text-sm transition flex items-center justify-center gap-2"
              >
                <Pencil size={14}/> Editar Dados
              </button>
            </div>
          </div>

          {/* Documentos */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-base text-slate-800 flex items-center gap-2 mb-4">
              <FileText className="text-indigo-600" size={18}/> Documentos
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => setModal('lgpd')}
                className="w-full flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition group"
              >
                <span className="text-sm font-medium text-slate-700">Consentimento LGPD</span>
                <div className="flex items-center gap-2">
                  {lgpdAccepted ? (
                    <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded">Aceito</span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  )}
                  <ChevronRight size={16} className="text-slate-400 group-hover:text-indigo-600 transition"/>
                </div>
              </button>


            </div>
          </div>
        </div>
      </div>

      {/* Modais */}
      {modal === 'edit' && (
        <EditAccountModal currentUser={currentUser} setCurrentUser={setCurrentUser} onClose={() => setModal(null)} />
      )}
      {modal === 'lgpd' && (
        <LGPDModal alreadyAccepted={lgpdAccepted} onAccept={handleLgpdAccept} onClose={() => setModal(null)} />
      )}

    </div>
  );
}
