import React, { useState, useEffect } from 'react';
import { Users, Plus, UserMinus, Trash2, ShieldCheck, CheckCircle2, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function FamilyGerenciarResponsaveis({ currentUser, familyStudents, currentSchool }) {
  const [secondGuardian, setSecondGuardian] = useState(null);
  const [currentUserIsFinancial, setCurrentUserIsFinancial] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', phone: '', doc_number: '', relationship: 'Pai'
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successModalData, setSuccessModalData] = useState(null); // { email, password }

  const studentIds = familyStudents?.map(s => s.id).filter(id => typeof id === 'string') || [];

  useEffect(() => {
    async function loadGuardians() {
      if (studentIds.length === 0) {
        setIsLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .rpc('get_student_guardians', { student_uuid: studentIds[0] });
          
        if (!error && data) {
          const guardianIds = data.map(g => g.guardian_id);
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, email, phone')
            .in('id', guardianIds);

          const me = data.find(g => g.guardian_id === currentUser.id);
          if (me) setCurrentUserIsFinancial(!!me.is_financial);

          const other = data.find(g => g.guardian_id !== currentUser.id);
          if (other) {
            const otherUser = usersData?.find(u => u.id === other.guardian_id);
            if (otherUser) {
              setSecondGuardian({
                id: other.guardian_id,
                name: otherUser.name,
                email: otherUser.email,
                phone: otherUser.phone,
                relationship: other.relationship,
                is_financial: other.is_financial
              });
            }
          }
        }
      } catch (err) {
        console.error('Erro ao buscar responsáveis:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadGuardians();
  }, [studentIds.join(',')]);

  const handleCreateSecondGuardian = async (e) => {
    e.preventDefault();
    if (studentIds.length === 0) {
      setErrorMsg('Nenhum aluno vinculado a esta conta.');
      return;
    }
    
    try {
      setActionLoading(true);
      setErrorMsg('');
      
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://orafqopnomdrvwlvxrkz.supabase.co';
      
      const response = await fetch(`${supabaseUrl}/functions/v1/create-family-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          school_id: currentSchool.id,
          student_ids: studentIds,
          is_financial: false
        })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao criar 2º Responsável');
      
      setSecondGuardian({
        id: result.user.id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        relationship: formData.relationship
      });
      
      setIsAdding(false);
      setSuccessModalData({ email: formData.email, password: formData.password });
      
      setFormData({
        name: '', email: '', password: '', phone: '', doc_number: '', relationship: 'Pai'
      });
      
    } catch (err) {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveSecondGuardian = async () => {
    if (!window.confirm(`Remover o vínculo de ${secondGuardian.name} com os alunos desta família?\nO usuário continuará existindo no sistema e poderá ser vinculado a outra família futuramente.`)) return;
    
    try {
      setActionLoading(true);
      const { error } = await supabase
        .from('student_guardians')
        .delete()
        .eq('guardian_id', secondGuardian.id)
        .in('student_id', studentIds);
        
      if (error) throw error;
      
      setSecondGuardian(null);
    } catch (err) {
      alert('Erro ao remover vínculo: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSecondGuardian = async () => {
    if (!window.confirm(
      `ATENÇÃO: Isso excluirá permanentemente a conta de ${secondGuardian.name}.\n` +
      `Esta ação não pode ser desfeita. Confirmar?`
    )) return;
    
    setActionLoading(true);
    try {
      if (studentIds.length > 0) {
        await supabase.from('student_guardians').delete()
          .eq('guardian_id', secondGuardian.id).in('student_id', studentIds);
      }
      
      const { error: deleteError } = await supabase.functions.invoke('delete-user', {
        body: { userId: secondGuardian.id }
      });
      
      if (deleteError) throw new Error(deleteError.message);
      
      setSecondGuardian(null);
    } catch (err) {
      alert('Erro ao excluir 2º Responsável: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const copyCredentials = () => {
    if (!successModalData) return;
    const text = `Acesso Portal Zela\nE-mail: ${successModalData.email}\nSenha: ${successModalData.password}`;
    navigator.clipboard.writeText(text);
    alert('Credenciais copiadas!');
  };

  const field = (label, required, node) => (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}{required && ' *'}</label>
      {node}
    </div>
  );

  const inputCls = 'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium';

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Gerenciar Responsáveis</h2>
            <p className="text-sm text-slate-500">Administre o acesso dos responsáveis no portal.</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-6">
        
        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Main Guardian */}
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col h-full relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full ${currentUserIsFinancial ? 'bg-indigo-500' : 'bg-slate-400'}`}></div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-indigo-600" /> Seu Perfil
              </h3>
              {currentUserIsFinancial ? (
                <span className="text-[10px] uppercase tracking-wider font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-md">
                  Responsável Principal
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-200 text-slate-600 px-2.5 py-1 rounded-md">
                  Responsável Secundário
                </span>
              )}
            </div>
            <div className="space-y-1 mt-auto">
              <p className="font-bold text-slate-700">{currentUser.name}</p>
              <p className="text-sm text-slate-500">{currentUser.email}</p>
              <p className="text-sm text-slate-500">{currentUser.phone || 'Sem telefone'}</p>
            </div>
          </div>

          {/* Card 2: 2nd Guardian */}
          <div className="h-full">
            {secondGuardian ? (
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col h-full relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${secondGuardian.is_financial ? 'bg-indigo-500' : 'bg-slate-400'}`}></div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Users size={18} className="text-slate-500" /> Outro Responsável
                  </h3>
                  {secondGuardian.is_financial ? (
                    <span className="text-[10px] uppercase tracking-wider font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-md">
                      Responsável Principal
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-200 text-slate-600 px-2.5 py-1 rounded-md">
                      2º Responsável
                    </span>
                  )}
                </div>
                <div className="space-y-1 mb-4">
                  <p className="font-bold text-slate-700">{secondGuardian.name}</p>
                  <p className="text-sm text-slate-500">{secondGuardian.email}</p>
                  <p className="text-sm text-slate-500">{secondGuardian.relationship}</p>
                </div>
                {currentUserIsFinancial && (
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button onClick={handleRemoveSecondGuardian} disabled={actionLoading}
                      className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition disabled:opacity-50">
                      <UserMinus size={14} /> Remover Vínculo
                    </button>
                    <button onClick={handleDeleteSecondGuardian} disabled={actionLoading}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className={`p-5 rounded-2xl flex flex-col items-center justify-center h-full text-center border-2 border-dashed transition-all ${isAdding ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 hover:border-indigo-300'}`}>
                {(!isAdding && currentUserIsFinancial) && (
                  <>
                    <Users className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium mb-4">Nenhum 2º Responsável cadastrado.</p>
                    <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-100/50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition">
                      <Plus size={16} /> Convidar 2º Responsável
                    </button>
                  </>
                )}
                {(!isAdding && !currentUserIsFinancial) && (
                  <>
                    <Users className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium mb-4">Outro responsável não encontrado.</p>
                  </>
                )}
                {isAdding && (
                  <div className="w-full text-left">
                    <h4 className="font-bold text-indigo-900 mb-1">Novo Acesso</h4>
                    <p className="text-xs text-indigo-700/70 mb-4">Preencha os dados abaixo.</p>
                    <button onClick={() => setIsAdding(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Add Form */}
        {isAdding && !secondGuardian && (
          <form onSubmit={handleCreateSecondGuardian} className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 animate-in fade-in duration-300">
            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-200 text-sm font-medium">{errorMsg}</div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Nome Completo', true, <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputCls} placeholder="Ex: Maria Silva" />)}
              {field('E-mail Principal', true, <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className={inputCls} placeholder="email@exemplo.com" />)}
              {field('Senha Provisória', true, <input type="text" required minLength={6} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className={inputCls} placeholder="Mínimo 6 caracteres" />)}
              {field('Telefone', false, <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className={inputCls} placeholder="(00) 00000-0000" />)}
              {field('CPF (Usado no Totem)', false, <input type="text" value={formData.doc_number} onChange={e => setFormData({...formData, doc_number: e.target.value})} className={inputCls} placeholder="000.000.000-00" />)}
              {field('Grau de Parentesco', true, 
                <select required value={formData.relationship} onChange={e => setFormData({...formData, relationship: e.target.value})} className={inputCls}>
                  <option value="Pai">Pai</option>
                  <option value="Mãe">Mãe</option>
                  <option value="Padrasto">Padrasto</option>
                  <option value="Madrasta">Madrasta</option>
                  <option value="Avô">Avô</option>
                  <option value="Avó">Avó</option>
                  <option value="Outro">Outro</option>
                </select>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={actionLoading} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm transition flex items-center gap-2 shadow-sm">
                {actionLoading ? 'Salvando...' : 'Salvar e Convidar'}
              </button>
            </div>
          </form>
        )}

      </div>

      {/* Success Modal */}
      {successModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 relative">
            <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-xl font-bold text-center text-slate-800 mb-2">Acesso criado com sucesso!</h3>
            <p className="text-sm text-center text-slate-500 mb-6">
              Compartilhe essas informações com o 2º Responsável para que ele possa acessar o portal.
            </p>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 text-sm">
                <span className="font-semibold text-slate-500 shrink-0">E-mail:</span>
                <span className="font-bold text-slate-800 break-all sm:text-right">{successModalData.email}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-slate-500">Senha:</span>
                <span className="font-bold text-slate-800">{successModalData.password}</span>
              </div>
            </div>
            
            <div className="flex items-start gap-2 bg-yellow-50 text-yellow-800 p-3 rounded-lg text-xs mb-6 border border-yellow-200/50">
              <span className="text-lg">⚠️</span>
              <p><strong>Guarde essas informações agora.</strong> Por segurança, a senha provisória não será exibida novamente no sistema.</p>
            </div>
            
            <div className="flex flex-col gap-2">
              <button onClick={copyCredentials} className="w-full py-3 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition flex items-center justify-center gap-2">
                <Copy size={16} /> Copiar credenciais
              </button>
              <button onClick={() => setSuccessModalData(null)} className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
