import React, { useState } from 'react';
import { X, KeyRound, Loader2, CheckCircle, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminPasswordLogin({ onClose, updateStudentStatus, currentUser }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [matchedStudents, setMatchedStudents] = useState(null);
  const [familyPerson, setFamilyPerson] = useState(null);
  const [actionDone, setActionDone] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const cleanPin = pin.replace(/\D/g, '');
      if (cleanPin.length < 11) {
        throw new Error('CPF inválido. Digite os 11 números.');
      }

      // 1. Busca os responsáveis da escola cujo CPF bate
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .eq('school_id', currentUser.school_id)
        .eq('role', 'family');

      if (usersError || !usersData) throw new Error('Erro ao buscar responsáveis.');

      // Procura em JS o usuário cujo doc_number coincide com o CPF digitado
      const userData = usersData.find(u => u.doc_number && u.doc_number.replace(/\D/g, '') === cleanPin);

      if (!userData) {
         throw new Error('CPF não encontrado ou não autorizado para esta escola.');
      }

      setFamilyPerson(userData);

      // 2. Busca os alunos vinculados ao responsável
      const { data: students, error: sError } = await supabase
        .from('students')
        .select('*')
        .eq('family_id', userData.id);

      if (sError) throw new Error('Erro ao buscar alunos vinculados.');
      
      setMatchedStudents(students || []);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!matchedStudents || !matchedStudents.length) return;
    
    setIsLoading(true);
    try {
      for (const student of matchedStudents) {
        let newStatus = student.status;
        if (['idle', 'left'].includes(student.status)) {
          newStatus = 'pending_entry';
        } else if (student.status === 'in_school') {
          newStatus = 'pending_exit';
        }

        if (newStatus !== student.status) {
          await updateStudentStatus(student.id, newStatus);
        }
      }
      
      setActionDone(true);
      setTimeout(() => {
         onClose();
      }, 3000);
    } catch (err) {
      console.error(err);
      setError('Erro ao registrar presença.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinChange = (e) => {
    // Aplica uma máscara simples de CPF enquanto digita
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 11) val = val.slice(0, 11);
    
    // Máscara 000.000.000-00
    let formatted = val;
    if (val.length > 9) {
      formatted = val.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (val.length > 6) {
      formatted = val.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    } else if (val.length > 3) {
      formatted = val.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    }
    setPin(formatted);
  };

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 h-auto max-h-[850px] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-white">
          <h3 className="font-bold flex items-center gap-2 text-lg text-slate-800">
            <KeyRound size={20} className="text-indigo-600" /> Acesso Manual (PIN)
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X size={20}/>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto min-h-0">
          {actionDone ? (
            <div className="text-center py-10 space-y-4 animate-in zoom-in">
              <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
              <div>
                <h4 className="font-bold text-slate-800 text-lg">Solicitação Enviada!</h4>
                <p className="text-slate-500 text-sm mt-1">Aguardando confirmação da recepção.</p>
              </div>
            </div>
          ) : matchedStudents !== null ? (
            <div className="space-y-6 animate-in fade-in">
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-black text-indigo-600">
                    {familyPerson?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <h4 className="font-bold text-lg text-slate-800">{familyPerson?.name}</h4>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mt-1">
                  Autorizado(a)
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Alunos Vinculados</p>
                <div className="space-y-2">
                  {matchedStudents.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-2">Nenhum aluno cadastrado neste perfil.</p>
                  ) : (
                    matchedStudents.map(student => (
                      <div key={student.id} className="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center text-sm shadow-sm">
                        <p className="font-bold text-slate-700">{student.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          student.status === 'in_school' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {student.status === 'in_school' ? 'SAÍDA' : 'ENTRADA'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setMatchedStudents(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-2xl transition-all text-sm"
                >
                  Voltar
                </button>
                <button
                  onClick={handleRequestAccess}
                  disabled={isLoading || matchedStudents.length === 0}
                  className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-black py-3.5 rounded-2xl active:scale-95 transition-all shadow-md text-sm uppercase tracking-wider flex justify-center items-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Check-in'}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <p className="text-sm text-slate-500 mb-2 text-center font-medium">
                Digite o CPF do responsável para identificação manual.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm flex gap-2 items-start font-medium shadow-sm">
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">CPF (PIN)</label>
                <input
                  type="text"
                  required
                  value={pin}
                  onChange={handlePinChange}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-xl px-4 py-4 text-slate-800 outline-none transition-all text-center text-xl tracking-widest font-mono font-bold shadow-inner"
                  placeholder="000.000.000-00"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || pin.length < 11}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl mt-4 active:scale-95 transition-all flex justify-center items-center gap-2 uppercase tracking-wide text-sm shadow-md disabled:opacity-70 disabled:active:scale-100"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Buscar Responsável'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
