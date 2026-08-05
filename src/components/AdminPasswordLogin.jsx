import React, { useState } from 'react';
import { X, KeyRound, Loader2, CheckCircle, ShieldAlert, Delete } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * AdminPasswordLogin — modo "Senha/Manual" do Totem
 *
 * Identificação por PIN de 4 dígitos = primeiros 4 dígitos do doc_number (CPF) do responsável.
 * Teclado numérico virtual: otimizado para touchscreen sem teclado físico.
 *
 * Lógica de multi-match:
 *   - 0 responsáveis → erro "PIN não encontrado"
 *   - 1 responsável  → vai direto para confirmação
 *   - 2+ responsáveis → lista de seleção antes de confirmar
 */
export default function AdminPasswordLogin({ onClose, updateStudentStatus, requestKioskAccess, currentUser }) {
  const [pin, setPin] = useState(''); // 4 dígitos
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Etapas: 'pin' → 'select' (opcional, multi-match) → 'confirm' → 'done'
  const [step, setStep] = useState('pin');
  const [matchedUsers, setMatchedUsers] = useState([]); // todos os responsáveis com o mesmo PIN
  const [familyPerson, setFamilyPerson] = useState(null); // responsável selecionado
  const [matchedStudents, setMatchedStudents] = useState(null);

  // ── Teclado numérico ────────────────────────────────────────────────────────
  const handleKeyPress = (digit) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');
    // Confirma automaticamente ao atingir 4 dígitos
    if (newPin.length === 4) {
      handleSearch(newPin);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  // ── Busca pelo PIN ──────────────────────────────────────────────────────────
  const handleSearch = async (pinValue) => {
    const cleanPin = (pinValue ?? pin).replace(/\D/g, '');
    if (cleanPin.length < 4) {
      setError('Digite os 4 dígitos do PIN.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Busca todos os responsáveis da escola
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, photo_url, doc_number, role')
        .eq('school_id', currentUser.school_id)
        .eq('role', 'family');

      if (usersError || !usersData) throw new Error('Erro ao buscar responsáveis.');

      // Filtra em JS: doc_number limpo começa com os 4 dígitos digitados
      // (funciona com CPF com ou sem máscara, pois limpamos antes de comparar)
      const matched = usersData.filter(
        (u) => u.doc_number && u.doc_number.replace(/\D/g, '').startsWith(cleanPin)
      );

      if (matched.length === 0) {
        throw new Error('PIN não encontrado. Verifique os 4 primeiros dígitos do seu CPF.');
      }

      if (matched.length === 1) {
        // Único match → pula seleção
        await loadStudentsForUser(matched[0]);
      } else {
        // Múltiplos matches → tela de seleção
        setMatchedUsers(matched);
        setStep('select');
      }
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Carrega alunos vinculados ao responsável ────────────────────────────────
  const loadStudentsForUser = async (user) => {
    setIsLoading(true);
    try {
      const { data: students, error: sError } = await supabase
        .from('students')
        .select('*')
        .eq('family_id', user.id);

      if (sError) throw new Error('Erro ao buscar alunos vinculados.');

      setFamilyPerson(user);
      setMatchedStudents(students || []);
      setStep('confirm');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Confirma acesso (check-in/check-out) ───────────────────────────────────
  const handleRequestAccess = async () => {
    if (!matchedStudents || !matchedStudents.length) return;

    setIsLoading(true);
    try {
      if (requestKioskAccess) {
        await requestKioskAccess(matchedStudents.map((s) => s.id));
      } else {
        for (const student of matchedStudents) {
          let newStatus = student.status;
          if (['idle', 'left', 'absent'].includes(student.status)) newStatus = 'pending_entry';
          else if (student.status === 'in_school') newStatus = 'pending_exit';
          if (newStatus !== student.status) await updateStudentStatus(student.id, newStatus);
        }
      }
      setStep('done');
      setTimeout(() => onClose(), 3000);
    } catch (err) {
      setError(err.message || 'Erro ao registrar presença.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold flex items-center gap-2 text-lg text-slate-800">
            <KeyRound size={20} className="text-indigo-600" />
            {step === 'pin' && 'Acesso por PIN'}
            {step === 'select' && 'Selecione o Responsável'}
            {step === 'confirm' && 'Confirmar Acesso'}
            {step === 'done' && 'Solicitação Enviada'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 flex-1">

          {/* ──── ETAPA: done ──── */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-4 animate-in zoom-in">
              <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
              <div>
                <h4 className="font-bold text-slate-800 text-lg">Solicitação Enviada!</h4>
                <p className="text-slate-500 text-sm mt-1">Aguardando confirmação da recepção.</p>
              </div>
            </div>
          )}

          {/* ──── ETAPA: select (multi-match) ──── */}
          {step === 'select' && (
            <div className="space-y-3 animate-in fade-in">
              <p className="text-sm text-slate-500 text-center">
                Mais de um responsável com este PIN. Selecione:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {matchedUsers.map((u) => (
                  <button
                    key={u.id}
                    disabled={isLoading}
                    onClick={() => loadStudentsForUser(u)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 active:scale-98 border border-slate-200 rounded-2xl transition-all text-left"
                  >
                    {u.photo_url ? (
                      <img src={u.photo_url} alt={u.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-base font-black text-indigo-600">
                          {u.name?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="font-bold text-slate-800">{u.name}</span>
                    {isLoading && <Loader2 size={16} className="ml-auto animate-spin text-indigo-400" />}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setStep('pin'); setPin(''); setError(''); }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-2xl transition-all text-sm"
              >
                Voltar
              </button>
            </div>
          )}

          {/* ──── ETAPA: confirm ──── */}
          {step === 'confirm' && matchedStudents !== null && (
            <div className="space-y-4 animate-in fade-in">
              {/* Perfil do responsável */}
              <div className="text-center">
                {familyPerson?.photo_url ? (
                  <img
                    src={familyPerson.photo_url}
                    alt={familyPerson.name}
                    className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-4 border-indigo-100"
                  />
                ) : (
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl font-black text-indigo-600">
                      {familyPerson?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <h4 className="font-bold text-lg text-slate-800">{familyPerson?.name}</h4>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mt-0.5">Autorizado(a)</p>
              </div>

              {/* Alunos vinculados */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Alunos Vinculados</p>
                <div className="space-y-2">
                  {matchedStudents.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-2">Nenhum aluno cadastrado neste perfil.</p>
                  ) : (
                    matchedStudents.map((student) => (
                      <div key={student.id} className="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center text-sm shadow-sm">
                        <p className="font-bold text-slate-700">{student.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${student.status === 'in_school' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                          {student.status === 'in_school' ? 'SAÍDA' : 'ENTRADA'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm flex gap-2 items-start font-medium">
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('pin'); setPin(''); setError(''); }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-2xl transition-all text-sm"
                >
                  Voltar
                </button>
                <button
                  onClick={handleRequestAccess}
                  disabled={isLoading || matchedStudents.length === 0}
                  className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-black py-3.5 rounded-2xl active:scale-95 transition-all shadow-md text-sm uppercase tracking-wider flex justify-center items-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
                </button>
              </div>
            </div>
          )}

          {/* ──── ETAPA: pin (teclado numérico) ──── */}
          {step === 'pin' && (
            <div className="space-y-4 animate-in fade-in">
              <p className="text-sm text-slate-500 text-center font-medium">
                Digite os <strong className="text-slate-700">4 primeiros dígitos</strong> do seu CPF
              </p>

              {/* Display dos 4 dígitos */}
              <div className="flex justify-center gap-3 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all ${
                      pin.length > i
                        ? 'bg-indigo-600 border-indigo-600 scale-105'
                        : pin.length === i
                        ? 'border-indigo-400 bg-indigo-50 animate-pulse'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {pin.length > i ? (
                      <span className="text-white text-xl font-black">●</span>
                    ) : (
                      <span className="text-slate-200 text-xl">○</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Erro */}
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm flex gap-2 items-start font-medium">
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {/* Teclado numérico virtual */}
              <div className="grid grid-cols-3 gap-2.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                  <button
                    key={digit}
                    onClick={() => handleKeyPress(String(digit))}
                    disabled={isLoading || pin.length >= 4}
                    className="h-14 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 active:bg-indigo-100 active:scale-95 disabled:opacity-50 text-slate-700 text-xl font-black rounded-2xl transition-all shadow-sm border border-slate-200 hover:border-indigo-300 select-none"
                  >
                    {digit}
                  </button>
                ))}

                {/* Linha inferior: Apagar | 0 | OK */}
                <button
                  onClick={handleDelete}
                  disabled={isLoading || pin.length === 0}
                  className="h-14 bg-slate-100 hover:bg-red-50 hover:text-red-500 active:scale-95 disabled:opacity-30 text-slate-500 rounded-2xl transition-all shadow-sm border border-slate-200 flex items-center justify-center select-none"
                >
                  <Delete size={22} />
                </button>

                <button
                  onClick={() => handleKeyPress('0')}
                  disabled={isLoading || pin.length >= 4}
                  className="h-14 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 active:bg-indigo-100 active:scale-95 disabled:opacity-50 text-slate-700 text-xl font-black rounded-2xl transition-all shadow-sm border border-slate-200 hover:border-indigo-300 select-none"
                >
                  0
                </button>

                <button
                  onClick={() => handleSearch()}
                  disabled={isLoading || pin.length < 4}
                  className="h-14 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-black rounded-2xl transition-all shadow-md flex items-center justify-center select-none"
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'OK'}
                </button>
              </div>

              <p className="text-center text-[10px] text-slate-400 font-medium">
                Exemplo: CPF 123.456… → PIN <strong>1234</strong>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
