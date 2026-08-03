import React, { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, CheckCircle, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function QRCodeScanner({ 
  school_id, 
  currentSchool, 
  onClose, 
  onCheckinConfirmed, // equivalent to onScanSuccess
  updateStudentStatus, // used if in kiosk mode to update parent state directly
  requestKioskAccess, // passed for atomic DB updates
  students, // optionally passed for kiosk mode
  mode = 'admin', 
  isLandscape = false 
}) {
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [matchStatus, setMatchStatus] = useState('idle'); // 'idle' | 'matched' | 'no-match'
  const [matchedPerson, setMatchedPerson] = useState(null);
  const [matchedStudents, setMatchedStudents] = useState([]);
  const [actionDone, setActionDone] = useState(false);

  useEffect(() => {
    let html5QrCode;
    
    // Pequeno delay para garantir que a div "reader" esteja renderizada
    const timer = setTimeout(() => {
      html5QrCode = new Html5Qrcode("reader");
      const startScanner = async () => {
        try {
          await html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            async (decodedText) => {
              if (!scanning) return;
              try {
                const data = JSON.parse(decodedText);
                
                if (data.type === 'zela_checkin' || data.type === 'student_checkin') {
                  setScanning(false);
                  html5QrCode.stop().catch(console.error);
                  await processQRCode(data);
                } else {
                  // Not a recognized QR code type
                }
              } catch (e) {
                // Not JSON, ignore
              }
            },
            (errorMessage) => {
              // ignore scan errors
            }
          );
        } catch (err) {
          setError('Não foi possível acessar a câmera. Verifique as permissões.');
        }
      };

      startScanner();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [scanning]);

  const processQRCode = async (data) => {
    setIsProcessing(true);
    setError('');
    try {
      let targetFamilyId = null;

      // a) Novo formato: {"type": "zela_checkin", "family_id": "...", "school_id": "..."}
      if (data.type === 'zela_checkin') {
        if (data.school_id !== school_id) {
          setError('QR Code inválido: pertence a outra escola.');
          setMatchStatus('no-match');
          setIsProcessing(false);
          return;
        }
        targetFamilyId = data.family_id;
      } 
      // b) Formato legado: {"type": "student_checkin", "studentId": "..."}
      else if (data.type === 'student_checkin') {
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('family_id')
          .eq('id', data.studentId)
          .eq('school_id', school_id)
          .single();
        
        if (studentError || !studentData) {
          setError('Aluno do QR Code não encontrado nesta escola.');
          setMatchStatus('no-match');
          setIsProcessing(false);
          return;
        }
        targetFamilyId = studentData.family_id;
      }

      if (!targetFamilyId) {
        setError('QR Code inválido.');
        setMatchStatus('no-match');
        setIsProcessing(false);
        return;
      }

      // Buscar o responsável
      // 1. Tentar authorized_persons
      let { data: authPerson } = await supabase
        .from('authorized_persons')
        .select('*')
        .eq('family_id', targetFamilyId)
        .eq('school_id', school_id)
        .limit(1)
        .single();
      
      let personData = authPerson;

      // 2. Fallback: buscar em users se não achar em authorized_persons
      if (!personData) {
        const { data: userPerson } = await supabase
          .from('users')
          .select('*')
          .eq('id', targetFamilyId)
          .eq('school_id', school_id)
          .single();
          
        if (userPerson) {
          personData = {
            id: userPerson.id,
            family_id: userPerson.id,
            name: userPerson.name,
            photo_url: null, // Usuário base pode não ter foto
            relation: 'Responsável (Titular)'
          };
        }
      }

      if (!personData) {
        setError('Responsável não encontrado.');
        setMatchStatus('no-match');
        setIsProcessing(false);
        return;
      }

      setMatchedPerson(personData);

      // Buscar os alunos vinculados
      let familyStudents = [];
      if (students) {
        // Se a lista já foi passada (Kiosk Mode)
        familyStudents = students.filter(s => s.family_id === targetFamilyId);
      } else {
        // Busca do banco se não tiver em memória
        const { data: sData } = await supabase
          .from('students')
          .select('*')
          .eq('family_id', targetFamilyId)
          .eq('school_id', school_id);
        familyStudents = sData || [];
      }
      
      setMatchedStudents(familyStudents);
      setMatchStatus('matched');

    } catch (err) {
      console.error(err);
      setError('Erro ao processar QR Code.');
      setMatchStatus('no-match');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetScanner = () => {
    setMatchStatus('idle');
    setMatchedPerson(null);
    setMatchedStudents([]);
    setActionDone(false);
    setError('');
    setScanning(true);
  };

  const handleRequestAccess = async () => {
    if (!matchedStudents.length) return;
    setIsProcessing(true);
    try {
      const processedStudents = [];

      if (requestKioskAccess) {
        await requestKioskAccess(matchedStudents.map(s => s.id));
        processedStudents.push(...matchedStudents); // Para o AdminPortal
      } else {
        // Fallback legado
        const now = new Date();
        const fullRecordStr = `${now.toISOString().split('T')[0]}|${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

        for (const student of matchedStudents) {
          let newStatus = student.status;
          let updates = {};

          if (['idle', 'left'].includes(student.status)) {
            newStatus = 'pending_entry';
            updates = { status: newStatus, today_entry: fullRecordStr, today_exit: null };
          } else if (student.status === 'in_school') {
            newStatus = 'pending_exit';
            updates = { status: newStatus, today_exit: fullRecordStr };
          }

          if (newStatus !== student.status) {
            if (updateStudentStatus) {
              await updateStudentStatus(student.id, newStatus);
              processedStudents.push({ ...student, ...updates });
            } else {
              const { error: updError } = await supabase
                .from('students')
                .update(updates)
                .eq('id', student.id);
              if (!updError) {
                processedStudents.push({ ...student, ...updates });
              }
            }
          } else {
            processedStudents.push(student);
          }
        }
      }

      setActionDone(true);
      if (onCheckinConfirmed) {
        onCheckinConfirmed(processedStudents);
      }
      
      // Auto-fechar ou resetar no AdminPortal
      if (mode === 'admin') {
        setTimeout(() => {
          if (onClose) onClose();
        }, 3500);
      }

    } catch (err) {
      console.error(err);
      setError('Acesso negado: ' + (err.message || 'Erro de comunicação.'));
      setMatchStatus('no-match');
    } finally {
      setIsProcessing(false);
    }
  };

  const isModal = mode === 'admin';
  const layoutClass = isLandscape || !isModal ? 'flex-row' : 'flex-col md:flex-row';

  const innerContent = (
    <>
      {/* Mobile Header for Admin modal */}
      {isModal && (
        <div className="md:hidden flex justify-between items-center p-4 border-b border-slate-100 bg-white shrink-0 z-10">
          <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-base">
            <QrCode size={18} className="text-indigo-600" /> Leitor de QR Code
          </h3>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 rounded-lg transition-colors">
            <X size={20}/>
          </button>
        </div>
      )}

      <div className={`flex flex-col ${layoutClass} flex-1 min-h-0 overflow-hidden w-full h-full`}>
        {/* Left pane: Scanner */}
        <div className={`relative flex-none h-[55%] min-h-[300px] md:h-auto md:flex-1 bg-slate-950 flex items-center justify-center overflow-hidden`}>
          {error && matchStatus !== 'matched' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-950/90 z-20 p-6 text-center">
              <ShieldAlert className="h-12 w-12 text-red-500 mb-3" />
              <p className="text-sm font-bold text-red-400 mb-4">{error}</p>
              <button onClick={handleResetScanner} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-xl text-sm transition">
                Tentar Novamente
              </button>
            </div>
          )}

          {scanning && (
            <div className="absolute inset-0 bg-black flex-1 flex flex-col z-10">
              <div id="reader" className="flex-1 w-full h-full bg-slate-900 [&>video]:object-cover [&>video]:h-full"></div>
              {/* overlay para área de scan */}
              <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none"></div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-indigo-500 rounded-xl relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-1 bg-indigo-500 shadow-[0_0_10px_indigo] animate-[scan_2s_ease-in-out_infinite]"></div>
                </div>
              </div>
            </div>
          )}
          
          {!scanning && matchStatus === 'idle' && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-950/80 z-10 p-6 text-center">
              <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
              <p className="text-sm font-semibold">Iniciando câmera...</p>
            </div>
          )}

          {/* Badge */}
          <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-white flex items-center gap-1.5 font-mono z-30">
            <span className={`w-2.5 h-2.5 rounded-full ${
              matchStatus === 'matched' ? 'bg-green-500' : 
              scanning ? 'bg-indigo-500 animate-ping' : 
              matchStatus === 'no-match' ? 'bg-red-500' : 'bg-slate-500'
            }`}></span>
            {
              isProcessing ? 'PROCESSANDO QR CODE...' :
              matchStatus === 'matched' ? 'RESPONSÁVEL IDENTIFICADO' : 
              scanning ? 'CÂMERA ATIVA' : 
              matchStatus === 'no-match' ? 'QR CODE INVÁLIDO' : 'AGUARDANDO'
            }
          </div>
        </div>

        {/* Right pane: Match details / Actions */}
        <div className={`flex-1 ${!isModal ? (isLandscape ? 'w-2/5' : 'w-full') : 'md:flex-none md:w-96'} shrink-0 border-t md:border-t-0 md:border-l border-slate-100 flex flex-col bg-slate-50 min-h-0`}>
          {/* Desktop Header */}
          {isModal && (
            <div className="hidden md:flex justify-between items-center p-5 border-b border-slate-100 bg-white shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                <QrCode size={18} className="text-indigo-600" /> Leitor de QR Code
              </h3>
              <button onClick={onClose} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg transition">
                <X size={20}/>
              </button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 sm:space-y-5">
            {isProcessing ? (
              <div className="text-center py-16 space-y-3">
                <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-700">Validando QR Code...</p>
                <p className="text-xs text-slate-400">Verificando dados no sistema.</p>
              </div>
            ) : matchStatus === 'no-match' ? (
              <div className="text-center py-10 space-y-4 animate-in fade-in duration-200">
                <ShieldAlert className="mx-auto h-14 w-14 text-red-500 animate-bounce" />
                <div>
                  <h4 className="font-bold text-slate-800 text-base">QR Code Inválido</h4>
                  <p className="text-slate-500 text-xs mt-2 px-4 leading-relaxed">
                    Não foi possível identificar um responsável válido com este QR Code.
                  </p>
                </div>
                <button 
                  onClick={handleResetScanner}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} /> Tentar Novamente
                </button>
              </div>
            ) : actionDone ? (
              <div className="text-center py-10 space-y-4">
                <CheckCircle className="mx-auto h-16 w-16 text-green-500 animate-bounce" />
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">Sucesso!</h4>
                  <p className="text-slate-500 text-xs mt-1">Check-in / Check-out registrado.</p>
                </div>
                {mode === 'kiosk' && (
                  <button 
                    onClick={handleResetScanner}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition text-sm shadow-sm"
                  >
                    Escanear Próximo
                  </button>
                )}
              </div>
            ) : matchStatus !== 'matched' ? (
              <div className="text-center py-12 text-slate-400 space-y-3">
                <QrCode className="mx-auto h-12 w-12 text-slate-300" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Aguardando QR Code...</p>
                  <p className="text-xs mt-1 px-4 leading-relaxed">
                    Posicione o QR Code da Carteira Digital na câmera para identificação.
                  </p>
                </div>
              </div>
            ) : (
              // Match Found
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Person details */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-600 bg-slate-100 shrink-0 flex justify-center items-center font-bold text-xl text-indigo-700">
                    {matchedPerson.photo_url ? (
                      <img src={matchedPerson.photo_url} alt="Responsável" className="w-full h-full object-cover" />
                    ) : (
                      matchedPerson.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate text-sm">{matchedPerson.name}</p>
                    <p className="text-indigo-600 font-bold text-xs">{matchedPerson.relation || 'Responsável'}</p>
                    <span className="inline-block bg-green-100 text-green-700 text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-md mt-1 border border-green-200">
                      ID Verificada via QR
                    </span>
                  </div>
                </div>

                {/* Related students */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Alunos Autorizados a Retirar</p>
                  <div className="space-y-2">
                    {matchedStudents.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Nenhum aluno matriculado sob este responsável.</p>
                    ) : (
                      matchedStudents.map(student => (
                        <div key={student.id} className="p-3 bg-white border border-slate-200 rounded-xl flex justify-between items-center text-sm shadow-sm">
                          <div>
                            <p className="font-bold text-slate-700">{student.name}</p>
                            <span className="text-[10px] text-slate-400 uppercase">Horas/Dia: {student.contractedHours || '4h'}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            student.status === 'in_school' ? 'bg-indigo-100 text-indigo-700' : 
                            student.status === 'left' ? 'bg-slate-100 text-slate-500' : 
                            student.status === 'pending_entry' || student.status === 'pending_exit' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {student.status === 'in_school' ? 'Na Escola' : student.status === 'left' ? 'Saiu' : student.status === 'pending_entry' ? 'Entrada Solicitada' : student.status === 'pending_exit' ? 'Saída Solicitada' : 'Pendente'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Reset button */}
                <button 
                  onClick={handleResetScanner}
                  className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-xl transition text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={12} /> Ler outro QR Code
                </button>

                {/* Confirm access */}
                <button
                  onClick={handleRequestAccess}
                  disabled={matchedStudents.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-black py-4 rounded-2xl active:scale-95 transition-all shadow-md text-sm uppercase tracking-wider"
                >
                  {matchedStudents.some(s => s.status === 'in_school') ? 'Realizar Check-out' : 'Realizar Check-in'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (mode === 'kiosk') {
    return (
      <div className="w-full h-full flex flex-col bg-white overflow-hidden">
        {innerContent}
      </div>
    );
  }

  // mode === 'admin'
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 bg-slate-900/80 backdrop-blur-sm">
      <div className="w-full h-full max-w-5xl max-h-[850px] bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {innerContent}
      </div>
    </div>
  );
}
