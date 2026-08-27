import React, { useState } from 'react';
import { X, KeyRound, Loader2, CheckCircle, ShieldAlert, Delete } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmExitPassword from './ConfirmExitPassword';

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
  // Sair do Autoatendimento exige confirmar a senha da conta — a tela fica exposta
  // pra qualquer pessoa durante o check-in (ver ConfirmExitPassword).
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const requestExit = () => setShowExitConfirm(true);

  const [pin, setPin] = useState(''); // 4 dígitos
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Etapas: 'pin' → 'select' (opcional, multi-match) → 'confirm' → 'done'
  const [step, setStep] = useState('pin');
  const [matchedUsers, setMatchedUsers] = useState([]); // todos os responsáveis com o mesmo PIN
  const [familyPerson, setFamilyPerson] = useState(null); // responsável selecionado
  const [matchedStudents, setMatchedStudents] = useState(null);

  // Rate-limit contra força bruta: PIN de 4 dígitos tem só 10.000 combinações e o
  // totem é um dispositivo público — sem isso, dava pra tentar todas em minutos.
  const [, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);

  const getLockRemainingSeconds = () => {
    if (!lockedUntil) return 0;
    return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  };

  const registerFailedAttempt = () => {
    setFailedAttempts(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setLockedUntil(Date.now() + 30000); // 30s de bloqueio após 5 tentativas
      }
      return next;
    });
  };

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

    const lockRemaining = getLockRemainingSeconds();
    if (lockRemaining > 0) {
      setError(`Muitas tentativas incorretas. Aguarde ${lockRemaining}s.`);
      setPin('');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Checagem real de rate limit no banco (o contador local acima é só uma
      // otimização de UX pra não bater no servidor à toa — quem de fato
      // impede força bruta é essa RPC, já que o estado do React se perde a
      // qualquer reload da página).
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_pin_login_rate_limit');
      if (rateLimitError) throw rateLimitError;
      if (!allowed) {
        setLockedUntil(Date.now() + 30000);
        setError('Muitas tentativas em pouco tempo. Aguarde um instante.');
        setPin('');
        return;
      }

      // Buscar todos os family da escola
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, role, doc_number, school_id')
        .eq('school_id', currentUser.school_id)
        .eq('role', 'family');

      if (usersError || !usersData) {
        throw new Error('Erro ao buscar responsáveis.');
      }

      // Filtrar pelo PIN (primeiros 4 dígitos do doc_number)
      const matched = usersData.filter(
        (u) => u.doc_number && u.doc_number.replace(/\D/g, '').startsWith(cleanPin)
      );

      if (matched.length === 0) {
        registerFailedAttempt();
        throw new Error('PIN não encontrado. Verifique os 4 primeiros dígitos do seu CPF.');
      }

      // PIN correto — reseta o contador de tentativas
      setFailedAttempts(0);
      setLockedUntil(null);

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
      // Buscar student_ids via student_guardians (cobre 1º e 2º Responsável)
      const { data: guardianLinks, error: gError } = await supabase
        .from('student_guardians')
        .select('student_id')
        .eq('guardian_id', user.id);

      if (gError) throw new Error('Erro ao verificar vínculos familiares.');
      
      const studentIds = guardianLinks?.map(l => l.student_id) || [];
      
      let studentsData = [];
      if (studentIds.length > 0) {
        const { data } = await supabase
          .from('students')
          .select('*')
          .in('id', studentIds)
          .eq('school_id', currentUser.school_id);
        studentsData = data || [];
      } else {
        const { data } = await supabase
          .from('students')
          .select('*')
          .eq('family_id', user.id)
          .eq('school_id', currentUser.school_id);
        studentsData = data || [];
      }

      if (gError) throw new Error('Erro ao buscar alunos vinculados.');

      setFamilyPerson(user);
      setMatchedStudents(studentsData || []);
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
      <div className="w-full max-w-sm bg-white rounded-zela-xl overflow-hidden shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant">
          <h3 className="font-bold flex items-center gap-2 text-lg text-on-surface">
            <KeyRound size={20} className="text-primary" />
            {step === 'pin' && 'Acesso por PIN'}
            {step === 'select' && 'Selecione o Responsável'}
            {step === 'confirm' && 'Confirmar Acesso'}
            {step === 'done' && 'Solicitação Enviada'}
          </h3>
          <button
            onClick={requestExit}
            className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-lg transition"
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
                <h4 className="font-bold text-on-surface text-lg">Solicitação Enviada!</h4>
                <p className="text-on-surface-variant text-small mt-1">Aguardando confirmação da recepção.</p>
              </div>
            </div>
          )}

          {/* ──── ETAPA: select (multi-match) ──── */}
          {step === 'select' && (
            <div className="space-y-3 animate-in fade-in">
              <p className="text-small text-on-surface-variant text-center">
                Mais de um responsável com este PIN. Selecione:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {matchedUsers.map((u) => (
                  <button
                    key={u.id}
                    disabled={isLoading}
                    onClick={() => loadStudentsForUser(u)}
                    className="w-full flex items-center gap-3 p-3 bg-surface-container-low hover:bg-primary/10 hover:border-indigo-300 active:scale-98 border border-outline-variant rounded-zela-lg transition-all text-left"
                  >
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-base font-black text-primary">
                        {u.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-bold text-on-surface">{u.name}</span>
                    {isLoading && <Loader2 size={16} className="ml-auto animate-spin text-indigo-400" />}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setStep('pin'); setPin(''); setError(''); }}
                className="w-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-bold py-3 rounded-zela-lg transition-all text-sm"
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
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-black text-primary">
                    {familyPerson?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <h4 className="font-bold text-lg text-on-surface">{familyPerson?.name}</h4>
                <p className="text-on-surface-variant text-xs font-medium uppercase tracking-wider mt-0.5">Autorizado(a)</p>
              </div>

              {/* Alunos vinculados */}
              <div className="bg-surface-container-low p-4 rounded-zela-lg border border-outline-variant">
                <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-3">Alunos Vinculados</p>
                <div className="space-y-2">
                  {matchedStudents.length === 0 ? (
                    <p className="text-xs text-on-surface-variant italic text-center py-2">Nenhum aluno cadastrado neste perfil.</p>
                  ) : (
                    matchedStudents.map((student) => (
                      <div key={student.id} className="p-3 bg-white border border-outline-variant rounded-zela-md flex justify-between items-center text-sm shadow-sm">
                        <p className="font-bold text-on-surface">{student.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${student.status === 'in_school' ? 'bg-indigo-100 text-primary' : 'bg-green-100 text-green-700'}`}>
                          {student.status === 'in_school' ? 'SAÍDA' : 'ENTRADA'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm flex gap-2 items-start font-medium">
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('pin'); setPin(''); setError(''); }}
                  className="flex-1 bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-bold py-3.5 rounded-zela-lg transition-all text-sm"
                >
                  Voltar
                </button>
                <button
                  onClick={handleRequestAccess}
                  disabled={isLoading || matchedStudents.length === 0}
                  className="flex-[2] bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white font-black py-3.5 rounded-zela-lg active:scale-95 transition-all shadow-md text-sm uppercase tracking-wider flex justify-center items-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
                </button>
              </div>
            </div>
          )}

          {/* ──── ETAPA: pin (teclado numérico) ──── */}
          {step === 'pin' && (
            <div className="space-y-4 animate-in fade-in">
              <p className="text-small text-on-surface-variant text-center font-medium">
                Digite os <strong className="text-on-surface">4 primeiros dígitos</strong> do seu CPF
              </p>

              {/* Display dos 4 dígitos */}
              <div className="flex justify-center gap-3 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-12 h-12 rounded-zela-lg border-2 flex items-center justify-center transition-all ${
                      pin.length > i
                        ? 'bg-primary border-indigo-600 scale-105'
                        : pin.length === i
                        ? 'border-indigo-400 bg-primary/10 animate-pulse'
                        : 'border-outline-variant bg-surface-container-low'
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
                <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm flex gap-2 items-start font-medium">
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
                    className="h-14 bg-surface-container hover:bg-primary/10 hover:text-primary active:bg-indigo-100 active:scale-95 disabled:opacity-50 text-on-surface text-xl font-black rounded-zela-lg transition-all shadow-sm border border-outline-variant hover:border-indigo-300 select-none"
                  >
                    {digit}
                  </button>
                ))}

                {/* Linha inferior: Apagar | 0 | OK */}
                <button
                  onClick={handleDelete}
                  disabled={isLoading || pin.length === 0}
                  className="h-14 bg-surface-container hover:bg-red-50 hover:text-red-500 active:scale-95 disabled:opacity-30 text-on-surface-variant rounded-zela-lg transition-all shadow-sm border border-outline-variant flex items-center justify-center select-none"
                >
                  <Delete size={22} />
                </button>

                <button
                  onClick={() => handleKeyPress('0')}
                  disabled={isLoading || pin.length >= 4}
                  className="h-14 bg-surface-container hover:bg-primary/10 hover:text-primary active:bg-indigo-100 active:scale-95 disabled:opacity-50 text-on-surface text-xl font-black rounded-zela-lg transition-all shadow-sm border border-outline-variant hover:border-indigo-300 select-none"
                >
                  0
                </button>

                <button
                  onClick={() => handleSearch()}
                  disabled={isLoading || pin.length < 4 || getLockRemainingSeconds() > 0}
                  className="h-14 bg-primary hover:bg-primary-container active:scale-95 disabled:bg-slate-200 disabled:text-on-surface-variant/70 text-white text-sm font-black rounded-zela-lg transition-all shadow-md flex items-center justify-center select-none"
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'OK'}
                </button>
              </div>

              <p className="text-center text-[10px] text-on-surface-variant/70 font-medium">
                Exemplo: CPF 123.456… → PIN <strong>1234</strong>
              </p>
            </div>
          )}

        </div>
      </div>

      {showExitConfirm && (
        <ConfirmExitPassword
          email={currentUser?.email}
          onConfirm={() => { setShowExitConfirm(false); onClose(); }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  );
}
