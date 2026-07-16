import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, ShieldAlert, CheckCircle, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { preloadFaceModels } from '../lib/faceModels';
import { supabase } from '../lib/supabase';

export default function KioskFaceScanner({ onClose, executeKioskQuery, schoolId }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingText, setLoadingText] = useState('Carregando modelos de Inteligência Artificial...');
  const [error, setError] = useState(null);
  const [authorizedList, setAuthorizedList] = useState([]);
  const [faceMatcher, setFaceMatcher] = useState(null);
  
  const [matchedPerson, setMatchedPerson] = useState(null);
  const [matchStatus, setMatchStatus] = useState('idle'); // 'idle' | 'searching' | 'matched' | 'no-match'
  const [matchedStudents, setMatchedStudents] = useState([]);
  const [actionDone, setActionDone] = useState(false);

  const [capturedImage, setCapturedImage] = useState(null);
  const [matchDistance, setMatchDistance] = useState(null);
  const [isProcessingCapture, setIsProcessingCapture] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let active = true;
    let stream = null;

    async function init() {
      try {
        setLoadingText('Verificando modelos de IA...');
        await preloadFaceModels();

        if (!active) return;
        setModelsLoaded(true);

        setLoadingText('Buscando dados de responsáveis...');
        const { data: authData, error: authError } = await executeKioskQuery(
          supabase
            .from('authorized_persons')
            .select('*')
            .eq('status', 'approved')
            .eq('school_id', schoolId)
        );

        if (authError) throw authError;

        const peopleWithPhotos = (authData || []).filter(p => p.photo_url);
        setAuthorizedList(authData || []);

        if (peopleWithPhotos.length === 0) {
          setError('Nenhum responsável com foto aprovada cadastrado no sistema.');
          return;
        }

        setLoadingText(`Processando biometrias...`);
        const results = await Promise.all(
          peopleWithPhotos.map(async (person) => {
            try {
              const img = await loadImage(person.photo_url);
              const detection = await faceapi
                .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ maxResults: 1 }))
                .withFaceLandmarks()
                .withFaceDescriptor();
              if (detection) {
                return new faceapi.LabeledFaceDescriptors(person.id, [detection.descriptor]);
              }
            } catch (err) {
              console.warn(`Erro ao processar imagem de ${person.name}:`, err);
            }
            return null;
          })
        );

        if (!active) return;

        const labeledDescriptors = results.filter(Boolean);

        if (labeledDescriptors.length === 0) {
          setError('Não foi possível gerar biometria das fotos cadastradas.');
          return;
        }

        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
        setFaceMatcher(matcher);

        setLoadingText('Iniciando câmera...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
      } catch (err) {
        console.error(err);
        setError('Erro ao iniciar reconhecimento facial: ' + (err.message || err));
      }
    }

    init();

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const loadImage = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!url.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    });
  };

  useEffect(() => {
    if (!faceMatcher || !modelsLoaded || !cameraReady || error || capturedImage) return;

    let timerId;
    let isDetecting = false;

    const detectFace = async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || isDetecting) return;

      isDetecting = true;
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas) {
          const displaySize = { width: video.videoWidth || 640, height: video.videoHeight || 480 };
          faceapi.matchDimensions(canvas, displaySize);

          const detections = await faceapi
            .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ maxResults: 1 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

          const resizedDetections = faceapi.resizeResults(detections, displaySize);

          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          setMatchStatus(detections.length > 0 ? 'searching' : 'idle');

          resizedDetections.forEach(detection => {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { 
              label: bestMatch.toString(),
              boxColor: bestMatch.label !== 'unknown' ? '#10B981' : '#EF4444'
            });
            drawBox.draw(canvas);

            if (bestMatch.label !== 'unknown') {
              handleFoundMatch(bestMatch.label, bestMatch.distance);
            }
          });
        }
      } catch (err) {
        console.error('Erro no loop de detecção:', err);
      }
      isDetecting = false;
      timerId = setTimeout(detectFace, 250);
    };

    timerId = setTimeout(detectFace, 100);

    return () => clearTimeout(timerId);
  }, [faceMatcher, modelsLoaded, cameraReady, error, authorizedList, capturedImage]);

  const handleFoundMatch = async (personId, distance) => {
    const person = authorizedList.find(p => p.id === personId);
    if (!person) return;
    
    setMatchedPerson(person);
    setMatchDistance(distance);
    setMatchStatus('matched');
    
    // Fetch students
    try {
      const { data: familyStudents } = await executeKioskQuery(
        supabase.from('students').select('*').eq('family_id', person.family_id)
      );
      setMatchedStudents(familyStudents || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCaptureAndCompare = async () => {
    if (!videoRef.current || !faceMatcher) return;

    setIsProcessingCapture(true);
    setError(null);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');

      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      setMatchStatus('searching');

      const img = await loadImage(dataUrl);
      const detection = await faceapi.detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setMatchStatus('no-match');
        setIsProcessingCapture(false);
        return;
      }

      const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
      
      if (bestMatch.label !== 'unknown') {
        await handleFoundMatch(bestMatch.label, bestMatch.distance);
      } else {
        setMatchStatus('no-match');
      }
    } catch (err) {
      console.error('Erro na captura/comparação:', err);
      setError('Erro ao processar imagem capturada.');
      setMatchStatus('no-match');
    } finally {
      setIsProcessingCapture(false);
    }
  };

  const handleResetScanner = () => {
    setCapturedImage(null);
    setMatchDistance(null);
    setMatchedPerson(null);
    setMatchStatus('idle');
    setMatchedStudents([]);
    setActionDone(false);
  };

  const handleRequestAccess = async () => {
    if (!matchedStudents.length) return;
    
    try {
      for (const student of matchedStudents) {
        let newStatus = student.status;
        let updates = {};
        const now = new Date();
        const fullRecordStr = `${now.toISOString().split('T')[0]}|${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

        if (['idle', 'left'].includes(student.status)) {
          newStatus = 'pending_entry';
          updates = { status: newStatus, today_entry: fullRecordStr, today_exit: null };
        } else if (student.status === 'in_school') {
          newStatus = 'pending_exit';
          updates = { status: newStatus, today_exit: fullRecordStr };
        }

        if (newStatus !== student.status) {
          await executeKioskQuery(supabase.from('students').update(updates).eq('id', student.id));
        }
      }
      setActionDone(true);
      setTimeout(() => {
        onClose(); // Volta pro menu depois de 3 segundos
      }, 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const getSimilarityPercentage = (distance) => {
    if (distance === null || distance === undefined) return 0;
    const score = Math.max(0, 1 - (distance / 0.75));
    return Math.round(score * 100);
  };

  return (
    <div className="w-full h-full max-w-4xl mx-auto bg-black rounded-3xl overflow-hidden relative shadow-2xl flex flex-col md:flex-row border border-white/10">
      
      <div className="relative flex-1 md:flex-auto bg-slate-950 flex items-center justify-center overflow-hidden min-h-[40vh] md:min-h-0">
        {(!cameraReady || !faceMatcher) && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-950/80 z-10 p-6 text-center">
            <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
            <p className="text-sm font-semibold">{loadingText}</p>
          </div>
        )}

        {error && !capturedImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-950/90 z-10 p-6 text-center">
            <ShieldAlert className="h-12 w-12 text-red-500 mb-3" />
            <p className="text-sm font-bold text-red-400 mb-4">{error}</p>
          </div>
        )}

        {capturedImage ? (
          <img src={capturedImage} alt="Foto Capturada" className="w-full h-full object-cover" />
        ) : (
          <>
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100" />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none transform -scale-x-100" />
          </>
        )}

        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-white flex items-center gap-1.5 font-mono">
          <span className={`w-2.5 h-2.5 rounded-full ${
            matchStatus === 'matched' ? 'bg-green-500' : 
            matchStatus === 'searching' ? 'bg-amber-500 animate-ping' : 
            matchStatus === 'no-match' ? 'bg-red-500' : 'bg-slate-500'
          }`}></span>
          {
            isProcessingCapture ? 'ANALISANDO SNAPSHOT...' :
            matchStatus === 'matched' ? 'BIOMETRIA APONTADA' : 
            matchStatus === 'searching' ? 'VERIFICANDO ROSTO...' : 
            matchStatus === 'no-match' ? 'SEM CORRESPONDÊNCIA' : 'CÂMERA ATIVA'
          }
        </div>

        {modelsLoaded && !capturedImage && !error && (
          <div className="absolute bottom-4 right-4">
            <button
              onClick={handleCaptureAndCompare}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-4 rounded-xl shadow-lg transition active:scale-95 text-xs uppercase"
            >
              <Camera size={16} /> Tirar Foto
            </button>
          </div>
        )}
      </div>

      <div className="w-full md:w-85 md:shrink-0 flex-1 md:flex-none border-t md:border-t-0 md:border-l border-white/10 flex flex-col bg-slate-900 text-white min-h-0">
        <div className="flex justify-between items-center p-4 sm:p-5 border-b border-white/10 shrink-0">
          <h3 className="font-bold flex items-center gap-1.5 text-lg">
            <ScanFace size={18} className="text-blue-400" /> Biometria
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition">
            <X size={20}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {isProcessingCapture ? (
            <div className="text-center py-16 space-y-3">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto" />
              <p className="text-sm font-bold">Processando...</p>
            </div>
          ) : matchStatus === 'no-match' ? (
            <div className="text-center py-10 space-y-4 animate-in fade-in duration-200">
              <ShieldAlert className="mx-auto h-14 w-14 text-red-500 animate-bounce" />
              <div>
                <h4 className="font-bold text-base">Não Reconhecido</h4>
                <p className="text-slate-400 text-xs mt-2 px-4">O rosto não corresponde a nenhum responsável cadastrado.</p>
              </div>
              <button 
                onClick={handleResetScanner}
                className="w-full bg-slate-800 hover:bg-slate-700 font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> Tentar Novamente
              </button>
            </div>
          ) : actionDone ? (
            <div className="text-center py-10 space-y-4 animate-in zoom-in">
              <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
              <div>
                <h4 className="font-bold text-lg">Sucesso!</h4>
                <p className="text-slate-400 text-xs mt-1">Presença registrada.</p>
              </div>
            </div>
          ) : matchStatus !== 'matched' ? (
            <div className="text-center py-12 text-slate-500 space-y-3">
              <Camera className="mx-auto h-12 w-12 text-slate-700 animate-pulse" />
              <p className="text-sm font-semibold text-slate-400">Olhe para a câmera</p>
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-blue-500 bg-slate-800 shrink-0">
                  <img src={matchedPerson.photo_url} alt="Responsável" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate text-sm">{matchedPerson.name}</p>
                  <span className="inline-block bg-green-500/20 text-green-400 text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-md mt-1 border border-green-500/30">
                    Aprovado ({getSimilarityPercentage(matchDistance)}%)
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Alunos Vinculados</p>
                <div className="space-y-2">
                  {matchedStudents.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhum aluno encontrado.</p>
                  ) : (
                    matchedStudents.map(student => (
                      <div key={student.id} className="p-3 bg-white/5 border border-white/10 rounded-xl flex justify-between items-center text-sm">
                        <p className="font-bold">{student.name}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                           {student.status === 'in_school' ? 'Saída' : 'Entrada'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={handleRequestAccess}
                disabled={matchedStudents.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 font-black py-4 rounded-2xl active:scale-95 transition-all shadow-md text-sm uppercase tracking-wider mt-4"
              >
                Confirmar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ScanFace = ({ size, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>
  </svg>
);
