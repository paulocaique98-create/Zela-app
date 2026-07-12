import React, { useState } from 'react';
import { X, KeyRound, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { supabase, supabaseAuthHelper } from '../lib/supabase';

export default function KioskPasswordLogin({ onClose, executeKioskQuery, schoolId, onCheckinSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      // 1. Usa o Helper para logar SEM afetar a sessão principal
      const { data: authData, error: authError } = await supabaseAuthHelper.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw new Error('E-mail ou senha incorretos.');

      const user = authData.user;

      // 2. Busca o perfil do usuário para confirmar se é 'family' e se pertence a esta escola
      const { data: userData, error: userError } = await supabaseAuthHelper
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      // Desloga o helper imediatamente por segurança
      await supabaseAuthHelper.auth.signOut();

      if (userError || !userData) throw new Error('Perfil não encontrado no sistema.');
      
      // Mesmo se o email for de um admin ou outro role, o Totem serve para check-in
      // Geralmente quem faz check-in por senha são as famílias.
      if (userData.school_id !== schoolId) {
        throw new Error('Usuário não pertence a esta escola.');
      }

      setFamilyPerson(userData);

      // 3. Busca os alunos usando executeKioskQuery para garantir o uso do header de RLS do Kiosk
      const { data: students, error: sError } = await executeKioskQuery(
        supabase.from('students').select('*').eq('family_id', userData.id)
      );

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
        if (['incoming', 'idle', 'left'].includes(student.status)) newStatus = 'pending_entry';
        else if (student.status === 'in_school') newStatus = 'pending_exit';

        if (newStatus !== student.status) {
          await executeKioskQuery(supabase.from('students').update({ status: newStatus }).eq('id', student.id));
        }
      }
      setActionDone(true);
      setTimeout(() => {
        if (onCheckinSuccess) {
           onCheckinSuccess({ studentName: familyPerson.name, status: 'pending' }); // Força tela verde
        } else {
           onClose();
        }
      }, 3000);
    } catch (err) {
      console.error(err);
      setError('Erro ao registrar presença.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 text-white animate-in zoom-in-95 duration-300">
      <div className="flex justify-between items-center p-5 border-b border-white/10 bg-white/5">
        <h3 className="font-bold flex items-center gap-2 text-lg">
          <KeyRound size={18} className="text-amber-400" /> Acesso Manual
        </h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition">
          <X size={20}/>
        </button>
      </div>

      <div className="p-6">
        {actionDone ? (
          <div className="text-center py-10 space-y-4 animate-in zoom-in">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            <div>
              <h4 className="font-bold text-lg">Sucesso!</h4>
              <p className="text-slate-400 text-sm mt-1">Sua presença foi registrada.</p>
            </div>
          </div>
        ) : matchedStudents !== null ? (
          <div className="space-y-6 animate-in fade-in">
            <div className="text-center">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-white">{familyPerson?.name?.charAt(0).toUpperCase()}</span>
              </div>
              <h4 className="font-bold text-lg">{familyPerson?.name}</h4>
              <p className="text-slate-400 text-xs">Autorizado(a)</p>
            </div>

            <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Alunos Vinculados</p>
              <div className="space-y-2">
                {matchedStudents.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-2">Nenhum aluno cadastrado no seu perfil.</p>
                ) : (
                  matchedStudents.map(student => (
                    <div key={student.id} className="p-3 bg-white/5 border border-white/10 rounded-xl flex justify-between items-center text-sm">
                      <p className="font-bold">{student.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        student.status === 'in_school' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-green-500/20 text-green-300'
                      }`}>
                        {student.status === 'in_school' ? 'Saída' : 'Entrada'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setMatchedStudents(null)}
                className="flex-1 bg-white/10 hover:bg-white/20 font-bold py-3.5 rounded-2xl transition-all text-sm"
              >
                Voltar
              </button>
              <button
                onClick={handleRequestAccess}
                disabled={isLoading || matchedStudents.length === 0}
                className="flex-[2] bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black py-3.5 rounded-2xl active:scale-95 transition-all shadow-md text-sm uppercase tracking-wider flex justify-center items-center gap-2"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Check-in'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <p className="text-sm text-slate-400 mb-6 text-center">
              Use o e-mail e senha cadastrados pela escola para liberar a catraca manualmente.
            </p>

            {error && (
              <div className="bg-red-500/20 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm flex gap-2 items-start">
                <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-amber-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black py-4 rounded-xl mt-6 active:scale-95 transition-all flex justify-center items-center gap-2 uppercase tracking-wide text-sm shadow-lg disabled:opacity-70 disabled:active:scale-100"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Acessar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
