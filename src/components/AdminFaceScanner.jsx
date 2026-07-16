import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, ShieldAlert, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { preloadFaceModels } from '../lib/faceModels';
import { supabase } from '../lib/supabase';

export default function AdminFaceScanner({ onClose, updateStudentStatus, students, currentUser }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingText, setLoadingText] = useState('Carregando modelos de Inteligência Artificial...');
  const [error, setError] = useState(null);
  const [authorizedList, setAuthorizedList] = useState([]);
  const [faceMatcher, setFaceMatcher] = useState(null);
  
  const [matchedPerson, setMatchedPerson] = useState(null); // The authorized person detected
  const [matchStatus, setMatchStatus] = useState('idle'); // 'idle' | 'searching' | 'matched' | 'no-match'
  const [matchedStudents, setMatchedStudents] = useState([]);
  const [actionDone, setActionDone] = useState(false);

  // New states for manual snapshot confrontation
  const [capturedImage, setCapturedImage] = useState(null);
  const [matchDistance, setMatchDistance] = useState(null);
  const [isProcessingCapture, setIsProcessingCapture] = useState(false);
  const [cameraReady, setCameraReady] = useState(false); // true quando stream de vídeo está ativo

  useEffect(() => {
    let active = true;
    let stream = null;

    async function init() {
      try {
        // 1. Aguarda modelos (já carregados em background pelo AdminPortal)
        setLoadingText('Verificando modelos de IA...');
        await preloadFaceModels(); // retorna imediatamente se já estiverem em cache

        if (!active) return;
        setModelsLoaded(true);

        // 2. Busca responsáveis com foto aprovada
        setLoadingText('Buscando dados de responsáveis...');
        const { data: authData, error: authError } = await supabase
          .from('authorized_persons')
          .select('*')
          .eq('status', 'approved')
          .eq('school_id', currentUser.school_id);

        if (authError) throw authError;

        const peopleWithPhotos = (authData || []).filter(p => p.photo_url);
        setAuthorizedList(authData || []);

        if (peopleWithPhotos.length === 0) {
          setError('Nenhum responsável com foto aprovada cadastrado no sistema.');
          return;
        }

        // 3. Processa todas as fotos EM PARALELO (antes: sequencial)
        setLoadingText(`Processando biometrias em paralelo...`);
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
          setError('Não foi possível gerar biometria das fotos cadastradas. Verifique se as fotos são claras.');
          return;
        }

        // 4. Cria o matcher
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
        setFaceMatcher(matcher);

        // 5. Inicia câmera
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

  // Helper para carregar imagem — evita crossOrigin em data: URLs (causa erro em alguns browsers)
  const loadImage = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!url.startsWith('data:')) {
        img.crossOrigin = 'anonymous'; // só define CORS para URLs externas
      }
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar imagem: ' + url.substring(0, 60)));
    });
  };

  // Loop de detecção — só roda quando câmera estiver realmente ativa
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

          // Usa maxResults: 1 para ser mais rápido (estamos procurando 1 rosto)
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
            
            // Draw box
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { 
              label: bestMatch.toString(),
              boxColor: bestMatch.label !== 'unknown' ? '#10B981' : '#EF4444' // Green if match, Red if unknown
            });
            drawBox.draw(canvas);

            if (bestMatch.label !== 'unknown') {
              // Found a match!
              const personId = bestMatch.label;
              const person = authorizedList.find(p => p.id === personId);
              if (person) {
                setMatchedPerson(person);
                setMatchDistance(bestMatch.distance);
                setMatchStatus('matched');
                
                // Find all students related to this authorized person's family
                const familyStudents = students.filter(s => s.familyId === person.family_id);
                setMatchedStudents(familyStudents);
              }
            }
          });
        }
      } catch (err) {
        console.error('Erro no loop de detecção:', err);
      }
      isDetecting = false;
      // Agenda próxima detecção a cada 250ms (mais leve que 60fps)
      timerId = setTimeout(detectFace, 250);
    };

    timerId = setTimeout(detectFace, 100); // Primeira execução um pouco mais cedo

    return () => {
      clearTimeout(timerId);
    };
  }, [faceMatcher, modelsLoaded, cameraReady, error, authorizedList, students, capturedImage]);

  // Capture current frame and run face comparison
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

      // Mirror the context so captured photo matches mirrored camera display
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset

      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      setMatchStatus('searching');

      // Run face detection on the captured static image
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
        const personId = bestMatch.label;
        const person = authorizedList.find(p => p.id === personId);
        if (person) {
          setMatchedPerson(person);
          setMatchDistance(bestMatch.distance);
          setMatchStatus('matched');
          
          // Find all students related to this authorized person's family
          const familyStudents = students.filter(s => s.familyId === person.family_id);
          setMatchedStudents(familyStudents);
        } else {
          setMatchStatus('no-match');
        }
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
    
    setIsProcessingCapture(true);
    try {
      // Como o processamento já ocorreu via front-end (face-api.js), chamamos a função direta
      // para cada aluno ao invés de usar a Edge Function que pode estar indisponível localmente
      for (const student of matchedStudents) {
        let newStatus = student.status;
        if (['idle', 'left'].includes(student.status)) {
          newStatus = 'pending_entry';
        } else if (student.status === 'in_school') {
          newStatus = 'pending_exit';
        }

        if (newStatus !== student.status) {
          // Utiliza a função já existente no App.jsx que salva as métricas de tempo
          await updateStudentStatus(student.id, newStatus);
        }
      }

      // Sucesso!
      setActionDone(true);
    } catch (err) {
      console.error('Erro ao solicitar acesso:', err);
      setError('Acesso negado: ' + (err.message || 'Erro de comunicação.'));
      setMatchStatus('no-match');
    } finally {
      setIsProcessingCapture(false);
    }
  };

  // Convert distance to similarity percentage
  const getSimilarityPercentage = (distance) => {
    if (distance === null || distance === undefined) return 0;
    // Euclidean distance of 0.6 is the default threshold.
    // Scale so distance=0 is 100%, distance=0.55 is 50%, and distance >= 0.7 is 0%
    const score = Math.max(0, 1 - (distance / 0.75));
    return Math.round(score * 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-[600px] animate-in zoom-in-95 duration-200">
        
        {/* Left pane: Camera feed or Static Captured Image */}
        <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden min-h-[300px] md:min-h-0">
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
              <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-xl text-sm transition">
                Fechar Janela
              </button>
            </div>
          )}

          {capturedImage ? (
            <img 
              src={capturedImage} 
              alt="Foto Capturada" 
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <video 
                ref={videoRef}
                autoPlay 
                muted 
                playsInline
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <canvas 
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none transform -scale-x-100"
              />
            </>
          )}

          {/* Mirror status badge */}
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

          {/* Capture snapshot overlay button */}
          {modelsLoaded && !capturedImage && !error && (
            <div className="absolute bottom-4 right-4">
              <button
                onClick={handleCaptureAndCompare}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-4 rounded-xl shadow-lg transition active:scale-95 text-xs uppercase"
              >
                <Camera size={16} /> Capturar e Comparar
              </button>
            </div>
          )}
        </div>

        {/* Right pane: Match details / Actions */}
        <div className="w-full md:w-85 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 flex flex-col bg-slate-50">
          {/* Header */}
          <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-white">
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
              <Camera size={18} className="text-indigo-600" /> Biometria Facial
            </h3>
            <button onClick={onClose} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg transition">
              <X size={20}/>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {isProcessingCapture ? (
              <div className="text-center py-16 space-y-3">
                <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-700">Fazendo confronto biométrico...</p>
                <p className="text-xs text-slate-400">Verificando face com banco de dados de responsáveis cadastrados.</p>
              </div>
            ) : matchStatus === 'no-match' ? (
              <div className="text-center py-10 space-y-4 animate-in fade-in duration-200">
                <ShieldAlert className="mx-auto h-14 w-14 text-red-500 animate-bounce" />
                <div>
                  <h4 className="font-bold text-slate-800 text-base">Nenhum Confronto Encontrado</h4>
                  <p className="text-slate-500 text-xs mt-2 px-4 leading-relaxed">
                    O rosto capturado não corresponde a nenhum dos responsáveis aprovados e cadastrados no sistema.
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
                  <h4 className="font-bold text-slate-800 text-lg">Solicitação Enviada!</h4>
                  <p className="text-slate-500 text-xs mt-1">Aguardando confirmação da recepção.</p>
                </div>
                <button 
                  onClick={handleResetScanner}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition text-sm shadow-sm"
                >
                  Escanear Próximo
                </button>
              </div>
            ) : matchStatus !== 'matched' ? (
              <div className="text-center py-12 text-slate-400 space-y-3">
                <Camera className="mx-auto h-12 w-12 text-slate-300 animate-pulse" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Aguardando detecção...</p>
                  <p className="text-xs mt-1 px-4 leading-relaxed">
                    Posicione o responsável ou clique no botão **"Capturar e Comparar"** na câmera para capturar uma foto manual de confronto.
                  </p>
                </div>
              </div>
            ) : (
              // Match Found
              <div className="space-y-5 animate-in fade-in duration-300">
                
                {/* Visual side-by-side confrontation */}
                {capturedImage && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Confronto Biométrico</p>
                    <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm relative">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase mb-1">Capturado</span>
                        <div className="w-full h-24 rounded-lg overflow-hidden border border-slate-100">
                          <img src={capturedImage} alt="Capturado" className="w-full h-full object-cover" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-extrabold text-indigo-600 uppercase mb-1">Cadastrado</span>
                        <div className="w-full h-24 rounded-lg overflow-hidden border border-indigo-100">
                          <img src={matchedPerson.photo_url} alt="Registrado" className="w-full h-full object-cover" />
                        </div>
                      </div>
                      
                      {/* Similarity Badge */}
                      <div className="absolute top-[48%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white font-black text-[10px] px-2 py-1 rounded-full shadow border-2 border-white">
                        {getSimilarityPercentage(matchDistance)}%
                      </div>
                    </div>
                  </div>
                )}

                {/* Person details */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                  {!capturedImage && (
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-600 bg-slate-100 shrink-0">
                      <img src={matchedPerson.photo_url} alt="Responsável" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate text-sm">{matchedPerson.name}</p>
                    <p className="text-indigo-600 font-bold text-xs">{matchedPerson.relation}</p>
                    <span className="inline-block bg-green-100 text-green-700 text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-md mt-1 border border-green-200">
                      Biometria Aprovada
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

                {/* Reset button to clear confrontation and start live scans again */}
                <button 
                  onClick={handleResetScanner}
                  className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-xl transition text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={12} /> Limpar e Voltar
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
    </div>
  );
}
