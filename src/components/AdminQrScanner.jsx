import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle, ShieldAlert, QrCode as QrCodeIcon } from 'lucide-react';
import jsQR from 'jsqr';
import { supabase } from '../lib/supabase';

// Fase 2 do plano de Check-in por QR Code — leitura no totem.
//
// Fluxo (Opção B do plano, decidida com o usuário): escaneia o QR do aluno
// -> valida via verify_checkin_qr (RPC já confere assinatura HMAC e escola)
// -> mostra os autorizados vinculados àquele aluno pra 1 toque de
// confirmação de quem está presente -> chama requestKioskAccess exatamente
// como Face/PIN já fazem, mantendo o mesmo rastro de auditoria
// (pending_requester_id = authorized_persons.id).
//
// Leitura: usa a BarcodeDetector nativa quando o navegador suporta (bem
// mais rápida, "leitura limpa" pedida) e cai pra jsQR (JS puro) nos que não
// suportam (ex.: Safari/iOS mais antigo) — sem esse fallback o recurso
// ficaria instável dependendo do aparelho da escola.
const SCAN_INTERVAL_MS = 200;

export default function AdminQrScanner({ onClose, requestKioskAccess, currentUser }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const barcodeDetectorRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);

  // 'scanning' | 'confirming' | 'done'
  const [step, setStep] = useState('scanning');
  const [scanError, setScanError] = useState('');
  const [matchedStudent, setMatchedStudent] = useState(null);
  const [authorizedOptions, setAuthorizedOptions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const requestExit = () => onClose();

  // Câmera — mesmo padrão simples de getUserMedia (sem os cuidados extras
  // de baixa luz/watchdog do AdminFaceScanner, que existem por causa da
  // IA de reconhecimento; leitura de QR é robusta o bastante sem isso).
  useEffect(() => {
    let stream;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        console.error('[AdminQrScanner] Erro ao acessar câmera:', err);
        setError('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      }
    })();

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        barcodeDetectorRef.current = null;
      }
    }

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleDecodedPayload = async (payload) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setScanError('');
    try {
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_kiosk_recognition_rate_limit');
      if (!rateLimitError && allowed === false) {
        setScanError('Muitas tentativas em pouco tempo. Aguarde um instante ou use Senha/PIN.');
        return;
      }

      const { data, error: verifyError } = await supabase.rpc('verify_checkin_qr', { p_payload: payload });
      if (verifyError) throw verifyError;

      const student = data?.[0];
      if (!student) throw new Error('QR Code não reconhecido.');

      // Autorizados vinculados ao aluno -- mesma relação usada no
      // reconhecimento facial (student_guardians -> authorized_persons),
      // só que invertida: aqui já sabemos o aluno, falta saber quem está
      // presente.
      const { data: guardianLinks } = await supabase
        .from('student_guardians')
        .select('guardian_id')
        .eq('student_id', student.student_id);

      let familyIds = (guardianLinks || []).map(l => l.guardian_id);
      if (familyIds.length === 0) {
        const { data: studentRow } = await supabase
          .from('students')
          .select('family_id')
          .eq('id', student.student_id)
          .single();
        if (studentRow?.family_id) familyIds = [studentRow.family_id];
      }

      let people = [];
      if (familyIds.length > 0) {
        const { data: authorizedData } = await supabase
          .from('authorized_persons')
          .select('id, name, relation, photo_storage_path')
          .in('family_id', familyIds)
          .eq('school_id', currentUser.school_id)
          .eq('status', 'approved');
        people = authorizedData || [];
      }

      setMatchedStudent(student);
      setAuthorizedOptions(people);
      setStep('confirming');
    } catch (err) {
      console.error('[AdminQrScanner] Erro ao validar QR:', err);
      setScanError(err.message || 'QR Code inválido.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Loop de leitura — só roda enquanto 'scanning' e a câmera estiver pronta.
  useEffect(() => {
    if (step !== 'scanning' || !cameraReady) return;
    let timerId;
    let cancelled = false;

    const scanFrame = async () => {
      const video = videoRef.current;
      if (video && video.videoWidth && !isProcessing) {
        try {
          let payload = null;

          if (barcodeDetectorRef.current) {
            const results = await barcodeDetectorRef.current.detect(video);
            if (results.length > 0) payload = results[0].rawValue;
          } else {
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = jsQR(imageData.data, imageData.width, imageData.height);
            if (decoded) payload = decoded.data;
          }

          if (payload && !cancelled) {
            await handleDecodedPayload(payload);
          }
        } catch (err) {
          // Best-effort — um frame ruim não pode travar o loop de leitura.
          console.warn('[AdminQrScanner] Falha ao ler frame:', err?.message || err);
        }
      }
      if (!cancelled) timerId = setTimeout(scanFrame, SCAN_INTERVAL_MS);
    };

    timerId = setTimeout(scanFrame, SCAN_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timerId); };
  }, [step, cameraReady, isProcessing]);

  const handleConfirm = async (authorizedPerson) => {
    if (!matchedStudent) return;
    setIsProcessing(true);
    try {
      await requestKioskAccess([matchedStudent.student_id], authorizedPerson?.id || null);
      setStep('done');
      setTimeout(() => onClose(), 2500);
    } catch (err) {
      setScanError(err.message || 'Erro ao registrar presença.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTryAgain = () => {
    setStep('scanning');
    setScanError('');
    setMatchedStudent(null);
    setAuthorizedOptions([]);
  };

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-zela-xl overflow-hidden shadow-2xl flex flex-col">
        <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <QrCodeIcon size={18} className="text-primary" />
            <h3 className="font-bold text-on-surface text-sm">Check-in por QR Code</h3>
          </div>
          <button onClick={requestExit} className="text-on-surface-variant/70 hover:text-on-surface p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <ShieldAlert size={32} className="text-error" />
              <p className="text-sm text-on-surface-variant">{error}</p>
            </div>
          ) : step === 'scanning' ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full aspect-square rounded-zela-lg overflow-hidden bg-black">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute inset-8 border-4 border-white/70 rounded-2xl pointer-events-none" />
              </div>
              <p className="text-sm text-on-surface-variant text-center">
                Aponte a carteirinha do aluno para a câmera.
              </p>
              {scanError && <p className="text-xs text-error text-center">{scanError}</p>}
            </div>
          ) : step === 'confirming' ? (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <p className="text-xs text-on-surface-variant/70 uppercase font-bold tracking-wide">Aluno identificado</p>
                <p className="text-lg font-bold text-on-surface">{matchedStudent?.student_name}</p>
              </div>
              <p className="text-sm text-on-surface-variant text-center">Quem está entregando ou buscando agora?</p>

              {authorizedOptions.length === 0 ? (
                <p className="text-sm text-on-surface-variant/70 text-center py-4">
                  Nenhum responsável autorizado encontrado para este aluno.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {authorizedOptions.map(person => (
                    <button
                      key={person.id}
                      onClick={() => handleConfirm(person)}
                      disabled={isProcessing}
                      className="flex items-center gap-3 border-2 border-outline-variant hover:border-primary/60 rounded-zela-md p-3 transition text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                        {person.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-on-surface truncate">{person.name}</p>
                        <p className="text-xs text-on-surface-variant/70 truncate">{person.relation}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {scanError && <p className="text-xs text-error text-center">{scanError}</p>}

              <button
                onClick={handleTryAgain}
                className="text-xs font-bold text-on-surface-variant/70 hover:text-on-surface text-center"
              >
                Escanear outro QR
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle size={40} className="text-green-600" />
              <p className="font-bold text-on-surface">Presença registrada!</p>
            </div>
          )}

          {isProcessing && step !== 'confirming' && (
            <div className="flex justify-center pt-3">
              <Loader2 size={18} className="animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
