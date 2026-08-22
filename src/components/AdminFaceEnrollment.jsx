import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Camera, Loader2, UserX, Search, ArrowLeft, RefreshCw, Check } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { preloadFaceModels } from '../lib/faceModels';
import { supabase } from '../lib/supabase';

const POSITION_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

// Verifica a posição do rosto contra a geometria REAL da oval na tela (não
// uma proporção genérica) — projeta a caixa do rosto (coordenadas nativas do
// vídeo) para o espaço renderizado do container levando em conta o recorte
// do object-cover. Checa o CENTRO da caixa contra a elipse da oval (não os 4
// cantos: uma caixa retangular bem enquadrada sempre tem cantos fora de uma
// elipse inscrita — isso faria um rosto perfeitamente centralizado nunca
// passar) e o tamanho do rosto relativo à oval, pra distinguir perto/longe.
function evaluateFramePosition(box, videoWidth, videoHeight, containerRect, ovalRect) {
  if (!containerRect || !ovalRect || !containerRect.width || !containerRect.height) return null;

  const scale = Math.max(containerRect.width / videoWidth, containerRect.height / videoHeight);
  const renderedW = videoWidth * scale;
  const renderedH = videoHeight * scale;
  const offsetX = (renderedW - containerRect.width) / 2;
  const offsetY = (renderedH - containerRect.height) / 2;

  // Mirror horizontal é ignorado de propósito: a oval é centralizada no
  // container (items-center/justify-center), então o teste é simétrico em
  // relação ao espelhamento — o resultado é o mesmo com ou sem inverter o
  // eixo X.
  const left = box.x * scale - offsetX;
  const top = box.y * scale - offsetY;
  const width = box.width * scale;
  const height = box.height * scale;
  const boxCenterX = left + width / 2;
  const boxCenterY = top + height / 2;

  const ovalLocalLeft = ovalRect.left - containerRect.left;
  const ovalLocalTop = ovalRect.top - containerRect.top;
  const ovalCenterX = ovalLocalLeft + ovalRect.width / 2;
  const ovalCenterY = ovalLocalTop + ovalRect.height / 2;
  const rx = ovalRect.width / 2;
  const ry = ovalRect.height / 2;

  if (rx <= 0 || ry <= 0) return null;

  const nx = (boxCenterX - ovalCenterX) / rx;
  const ny = (boxCenterY - ovalCenterY) / ry;
  const isCentered = nx * nx + ny * ny <= 0.4 * 0.4 + 0.4 * 0.4; // até ~40% do raio em cada eixo

  const boxWidthRatio = width / ovalRect.width;

  if (boxWidthRatio < 0.5) return 'too-far';
  if (boxWidthRatio > 1.15) return 'too-close';
  if (!isCentered) return 'off-center';
  return 'ok';
}

// Cadastro de foto facial pelo Admin — auxilia responsáveis que esqueceram
// de cadastrar a própria biometria pelo Portal da Família. Lista só quem
// AINDA NÃO tem foto, com busca por nome do responsável ou do filho, e
// captura a foto AO VIVO pela câmera (nunca por upload de arquivo do
// dispositivo — evita fotos antigas/de terceiros sendo usadas na biometria).
export default function AdminFaceEnrollment({ authorized, togglePhoto, students, currentUser, onClose }) {
  const [search, setSearch] = useState('');
  const [studentsByPersonId, setStudentsByPersonId] = useState({});
  const [cameraFor, setCameraFor] = useState(null); // pessoa sendo fotografada agora
  const [error, setError] = useState('');

  const pending = useMemo(
    () => (authorized || []).filter(p => !p.photo_url && !p.hasPhoto && !p.has_biometrics),
    [authorized]
  );

  // Monta um índice pessoa -> nomes dos filhos, pra permitir buscar tanto pelo
  // nome do responsável quanto pelo nome da criança.
  useEffect(() => {
    let cancelled = false;
    const buildIndex = async () => {
      const familyIds = [...new Set(pending.map(p => p.family_id).filter(Boolean))];
      if (familyIds.length === 0) return;

      const byFamilyId = new Map();
      (students || []).forEach(s => {
        const fid = s.family_id || s.familyId;
        if (!fid) return;
        if (!byFamilyId.has(fid)) byFamilyId.set(fid, []);
        byFamilyId.get(fid).push(s.name);
      });

      let guardianLinks = [];
      if (currentUser?.school_id) {
        const { data } = await supabase
          .from('student_guardians')
          .select('guardian_id, student_id')
          .in('guardian_id', familyIds);
        guardianLinks = data || [];
      }
      const studentsById = new Map((students || []).map(s => [s.id, s.name]));

      if (cancelled) return;
      const index = {};
      pending.forEach(p => {
        const names = new Set(byFamilyId.get(p.family_id) || []);
        guardianLinks.filter(l => l.guardian_id === p.family_id).forEach(l => {
          const name = studentsById.get(l.student_id);
          if (name) names.add(name);
        });
        index[p.id] = [...names];
      });
      setStudentsByPersonId(index);
    };
    buildIndex();
    return () => { cancelled = true; };
  }, [pending, students, currentUser?.school_id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return pending;
    return pending.filter(p => {
      if (p.name?.toLowerCase().includes(term)) return true;
      return (studentsByPersonId[p.id] || []).some(name => name.toLowerCase().includes(term));
    });
  }, [pending, search, studentsByPersonId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={cameraFor ? undefined : onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {cameraFor ? (
          <CameraCapture
            person={cameraFor}
            togglePhoto={togglePhoto}
            onDone={() => setCameraFor(null)}
            onCancel={() => setCameraFor(null)}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600 shrink-0">
                  <Camera size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-800">Cadastrar Foto de Responsáveis</h2>
                  <p className="text-xs text-slate-500">Apenas quem ainda não tem foto cadastrada</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
                <X size={20} />
              </button>
            </div>

            {pending.length > 0 && (
              <div className="px-5 pt-4 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por responsável ou criança"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">{error}</div>
              )}

              {pending.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <UserX className="mx-auto h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-slate-500 font-medium">Todos os responsáveis já têm foto cadastrada</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <Search className="mx-auto h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-slate-500 font-medium">Nenhum resultado para "{search}"</p>
                </div>
              ) : (
                filtered.map(person => (
                  <div key={person.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border border-slate-100 rounded-2xl bg-slate-50 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 bg-slate-200 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm">
                        <Camera size={16} className="text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 break-words">{person.name}</p>
                        <p className="text-xs text-slate-400 break-words">
                          {person.relation}{(studentsByPersonId[person.id]?.length > 0) ? ` · ${studentsByPersonId[person.id].join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setError(''); setCameraFor(person); }}
                      className="w-full sm:w-auto text-xs font-bold flex items-center justify-center gap-1.5 bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm shrink-0 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition"
                    >
                      <Camera size={14} /> Cadastrar
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Captura ao vivo pela câmera (nunca upload de arquivo) + detecção facial +
// gravação da biometria, reaproveitando o mesmo modelo/threshold usado no
// reconhecimento (AdminFaceScanner).
function CameraCapture({ person, togglePhoto, onDone, onCancel, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const ovalRef = useRef(null);
  const autoTriggeredRef = useRef(false); // evita reiniciar a contagem repetidas vezes enquanto o rosto permanece "ok"
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(null);
  // null (sem rosto) | 'too-far' | 'too-close' | 'off-center' | 'ok'
  const [framePosition, setFramePosition] = useState(null);

  // A câmera só é solicitada depois que a pessoa clica em "Iniciar Captura"
  // — nunca abre sozinha ao entrar na tela.
  useEffect(() => {
    if (!cameraStarted) return;
    let active = true;
    let stream = null;

    (async () => {
      try {
        await preloadFaceModels();
        if (!active) return;
        setModelsLoaded(true);

        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
      } catch (err) {
        console.error(err);
        const friendly =
          err.name === 'NotAllowedError' ? 'Permissão de câmera negada. Habilite o acesso à câmera e tente novamente.' :
          err.name === 'NotFoundError' ? 'Nenhuma câmera foi encontrada neste dispositivo.' :
          err.name === 'NotReadableError' ? 'A câmera está em uso por outro aplicativo ou aba.' :
          'Erro ao iniciar a câmera.';
        setError(friendly);
      }
    })();

    // O <video> nunca é desmontado (evita a tela preta ao "Tirar Outra" —
    // remontar o elemento perderia o srcObject já anexado ao stream ativo).
    return () => {
      active = false;
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [cameraStarted]);

  const handleStartCapture = () => { setError(''); setCameraStarted(true); };

  // Loop leve de posicionamento: só detecta a caixa do rosto (sem descriptor)
  // pra guiar visualmente a pessoa até o enquadramento ideal antes da captura.
  useEffect(() => {
    if (!cameraReady || !modelsLoaded || error || capturedImage) return;
    let cancelled = false;
    let timerId;

    const detect = async () => {
      const video = videoRef.current;
      if (!cancelled && video && video.videoWidth) {
        try {
          const detection = await faceapi.detectSingleFace(video, POSITION_DETECTOR_OPTIONS);
          if (!cancelled) {
            if (!detection) {
              setFramePosition(null);
            } else {
              const containerRect = containerRef.current?.getBoundingClientRect();
              const ovalRect = ovalRef.current?.getBoundingClientRect();
              setFramePosition(evaluateFramePosition(detection.box, video.videoWidth, video.videoHeight, containerRect, ovalRect));
            }
          }
        } catch (err) {
          console.error('Erro no loop de posicionamento:', err);
        }
      }
      if (!cancelled) timerId = setTimeout(detect, 200);
    };
    detect();

    return () => { cancelled = true; clearTimeout(timerId); };
  }, [cameraReady, modelsLoaded, error, capturedImage]);

  const doCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    // Espelha pra ficar igual ao preview (que está espelhado via CSS)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL('image/jpeg'));
  };

  // Só dispara a contagem regressiva depois que o "Perfeito" ficar estável
  // por 1s seguido — dá tempo da pessoa realmente ler a mensagem antes da
  // contagem começar, e evita que uma detecção instável de um único frame
  // (ruído) inicie a captura sem o enquadramento estar de fato correto.
  useEffect(() => {
    if (framePosition !== 'ok' || countdown !== null || capturedImage || autoTriggeredRef.current) return;
    const timer = setTimeout(() => {
      autoTriggeredRef.current = true;
      setCountdown(3);
    }, 1000);
    return () => clearTimeout(timer);
  }, [framePosition, countdown, capturedImage]);

  useEffect(() => {
    if (framePosition !== 'ok' && countdown === null) {
      autoTriggeredRef.current = false;
    }
  }, [framePosition, countdown]);

  // Contagem regressiva de 3s antes da captura automática.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      doCapture();
      setCountdown(null);
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleRetake = () => {
    setCapturedImage(null);
    setCountdown(null);
    autoTriggeredRef.current = false;
  };

  const handleSave = async () => {
    if (!capturedImage) return;
    setIsSaving(true);
    setError('');
    try {
      const img = new Image();
      img.src = capturedImage;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
      if (!detection) {
        setError('Não foi possível detectar um rosto nítido. Tente novamente com melhor iluminação.');
        setIsSaving(false);
        return;
      }
      const descriptorArray = Array.from(detection.descriptor);
      await togglePhoto(person.id, capturedImage, descriptorArray);
      onDone();
    } catch (err) {
      console.error(err);
      setError('Erro ao processar a biometria.');
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[75vh] max-h-[560px]">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onCancel} className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base font-bold text-slate-800 truncate">{person.name}</h2>
        </div>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
          <X size={20} />
        </button>
      </div>

      <div ref={containerRef} className="relative flex-1 bg-slate-950 overflow-hidden">
        {/* O <video> fica sempre montado (a partir do momento em que a câmera é
            iniciada) — desmontá-lo (ex: ao mostrar a foto capturada) perde o
            srcObject e a câmera não volta em "Tirar Outra". */}
        {cameraStarted && (
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100" />
        )}

        {!cameraStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center">
            <div className="bg-white/10 p-4 rounded-full mb-4">
              <Camera size={32} />
            </div>
            <p className="text-sm font-semibold text-slate-200 max-w-xs">
              A câmera só é ligada quando você clicar em "Iniciar Captura"
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center bg-slate-950">
            <p className="text-sm font-bold text-red-400">{error}</p>
          </div>
        )}

        {!error && capturedImage && (
          <img src={capturedImage} alt="Foto capturada" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {!error && cameraStarted && !capturedImage && (!modelsLoaded || !cameraReady) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 bg-slate-950/60">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-xs font-semibold">{!modelsLoaded ? 'Carregando IA de reconhecimento...' : 'Iniciando câmera...'}</p>
          </div>
        )}

        {!error && !capturedImage && cameraReady && (() => {
          const ovalColor =
            countdown !== null ? 'border-indigo-400' :
            framePosition === 'ok' ? 'border-green-500' :
            framePosition ? 'border-amber-500' : 'border-white/80';
          const message =
            countdown !== null ? null :
            framePosition === 'ok' ? 'Perfeito' :
            framePosition === 'too-far' ? 'Aproxime-se' :
            framePosition === 'too-close' ? 'Afaste-se' :
            framePosition === 'off-center' ? 'Centralize o rosto' :
            'Olhe para a câmera';
          return (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
              <div ref={ovalRef} className={`relative h-[82%] max-h-[380px] aspect-[3/4] rounded-full border-4 transition-colors duration-300 flex items-center justify-center ${ovalColor}`}>
                {countdown !== null ? (
                  <span className="text-white text-6xl font-black drop-shadow-lg animate-in zoom-in duration-300" key={countdown}>
                    {countdown}
                  </span>
                ) : (
                  <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg text-center leading-tight backdrop-blur-md ${framePosition === 'ok' ? 'bg-green-600/80 text-white' : 'bg-black/60 text-white'}`}>
                    {message}
                  </span>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="p-5 border-t border-slate-100 shrink-0">
        {capturedImage ? (
          <div className="flex gap-2">
            <button
              onClick={handleRetake}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition text-sm disabled:opacity-60"
            >
              <RefreshCw size={16} /> Tirar Outra
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {isSaving ? 'Salvando' : 'Confirmar'}
            </button>
          </div>
        ) : !cameraStarted ? (
          <button
            onClick={handleStartCapture}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm"
          >
            <Camera size={16} /> Iniciar Captura
          </button>
        ) : (
          <p className="text-center text-xs font-semibold text-slate-400">
            {countdown !== null ? `Capturando em ${countdown}` :
              framePosition === 'ok' ? 'Perfeito, capturando' :
              !cameraReady || !modelsLoaded ? 'Preparando câmera' :
              'Captura automática'}
          </p>
        )}
      </div>
    </div>
  );
}
