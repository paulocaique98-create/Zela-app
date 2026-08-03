import React, { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, QrCode, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminQRScanner({ onClose, onScanSuccess }) {
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(true);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");

    const startScanner = async () => {
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          async (decodedText) => {
            // Sucesso na leitura
            try {
              const data = JSON.parse(decodedText);
              if (data.type === 'student_checkin' && data.studentId) {
                setScanning(false);
                html5QrCode.stop().catch(console.error);
                await processStudentScan(data.studentId);
              } else {
                setError('QR Code inválido para este sistema.');
              }
            } catch (e) {
              setError('Formato de QR Code desconhecido.');
            }
          },
          (errorMessage) => {
            // erros frequentes de leitura (ignorar para não poluir console)
          }
        );
      } catch (err) {
        setError('Não foi possível acessar a câmera. Verifique as permissões.');
      }
    };

    startScanner();

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, []);

  const processStudentScan = async (studentId) => {
    try {
      // Busca o aluno
      const { data: student, error: sError } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();

      if (sError) throw sError;

      // Processa a mudança de status
      let newStatus = student.status;
      let updates = {};
      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (student.status === 'idle' || student.status === 'left') {
        newStatus = 'pending_entry';
        const now = new Date();
        const fullRecordStr = `${now.toISOString().split('T')[0]}|${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        updates = { status: newStatus, today_entry: fullRecordStr, today_exit: null };
      } else if (student.status === 'in_school') {
        newStatus = 'pending_exit';
        const now = new Date();
        const fullRecordStr = `${now.toISOString().split('T')[0]}|${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        updates = { status: newStatus, today_exit: fullRecordStr };
      }

      const processedStudents = [];
      if (newStatus !== student.status) {
        const { error: updError } = await supabase
          .from('students')
          .update(updates)
          .eq('id', student.id);
          
        if (!updError) {
          processedStudents.push({ ...student, ...updates });
        }
      } else {
         // O aluno já saiu ou está ausente e não altera status
         processedStudents.push(student);
      }

      setSuccessData({
        studentName: student.name,
        students: processedStudents
      });

      if (onScanSuccess) {
        onScanSuccess(processedStudents);
      }

      setTimeout(() => {
        onClose();
      }, 3500);

    } catch (err) {
      console.error(err);
      setError('Erro ao processar os dados do aluno.');
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full h-full max-w-2xl max-h-[850px] bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
              <QrCode size={20} />
            </div>
            <h2 className="font-bold text-slate-800">Leitor de Check-in</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg transition text-slate-500">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          {error && (
             <div className="mb-4 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl flex items-center gap-3">
               <AlertCircle size={20} className="shrink-0"/> {error}
             </div>
          )}

          {successData ? (
            <div className="text-center py-6 animate-in zoom-in duration-500">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-1">Sucesso!</h3>
              <p className="text-slate-500 font-medium mb-6">Aluno: {successData.studentName}</p>
              
              {successData.students.length > 0 ? (
                <div className="space-y-2">
                  {successData.students.map(s => (
                    <div key={s.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center justify-between text-sm">
                      <span className="font-bold text-slate-700">{s.name}</span>
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${s.status === 'pending_entry' ? 'bg-amber-100 text-amber-700' : 'bg-amber-100 text-amber-700'}`}>
                        {s.status === 'pending_entry' ? 'Entrada Solicitada' : 'Saída Solicitada'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  Nenhum aluno desta família precisava de registro no momento.
                </p>
              )}
            </div>
          ) : (
            <div className={`relative rounded-2xl overflow-hidden bg-black flex-1 flex flex-col ${!scanning ? 'hidden' : ''}`}>
               <div id="reader" className="flex-1 w-full h-full bg-slate-900 [&>video]:object-cover [&>video]:h-full"></div>
               {/* overlay overlay para indicar a área de scan */}
               <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none"></div>
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <div className="w-48 h-48 border-2 border-indigo-500 rounded-xl"></div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
