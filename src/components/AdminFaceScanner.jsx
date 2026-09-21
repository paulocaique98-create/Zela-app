import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, ShieldAlert, CheckCircle, Loader2, RefreshCw, QrCode } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { preloadFaceModels } from '../lib/faceModels';
import { supabase } from '../lib/supabase';
import { getAuthorizedPersonPhotoSignedUrl } from '../lib/storage';
import { detectViaHumanWorker, cosineSimilarity } from '../lib/humanShadowClient';
import { useWakeLock } from '../hooks/useWakeLock';
import { getCurrentScreen } from '../lib/errorLogger';

// Beeps curtos via Web Audio API — sem depender de arquivos de áudio externos.
let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  return _audioCtx;
}

function playTone(frequency, durationMs, delayMs = 0, volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const startAt = ctx.currentTime + delayMs / 1000;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.linearRampToValueAtTime(0, startAt + durationMs / 1000);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationMs / 1000 + 0.02);
}

function playSuccessBeep() {
  playTone(880, 120, 0);
  playTone(1320, 160, 130);
}

function playErrorBeep() {
  playTone(220, 220, 0, 0.18);
}

// ── Parâmetros de segurança/precisão do reconhecimento facial ──
// Distância euclidiana máxima para considerar um match (menor = mais rígido).
// 0.55 era permissivo demais e permitia falsos positivos entre pessoas parecidas.
const MATCH_THRESHOLD = 0.45;
// A 2ª melhor correspondência precisa estar pelo menos essa distância acima da melhor,
// senão o match é ambíguo demais (rostos parecidos) e é descartado por segurança.
const MATCH_MARGIN = 0.07;
// Quantos frames CONSECUTIVOS precisam apontar para a mesma pessoa antes de confirmar
// — evita que um único frame ruidoso (comum em pouca luz) confirme a pessoa errada.
const CONSISTENCY_FRAMES = 3;
// Luminância média (escala 0-255) abaixo da qual o realce de baixa luminosidade é
// aplicado automaticamente.
const DARK_LUMINANCE_THRESHOLD = 85;
const LUMINANCE_CHECK_INTERVAL_MS = 1000;
const DETECTION_INTERVAL_MS = 180;
const LIVE_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

// ── Liveness Detection (Fase 1 — passivo, só em modo observação) ──
// Roda por cima dos MESMOS frames/landmarks já calculados durante a janela de
// CONSISTENCY_FRAMES (nenhum frame extra, nenhum segundo a mais de espera).
// Só GRAVA o que teria decidido (logFaceEvent) -- nunca muda o resultado do
// reconhecimento nesta fase. Ver plano de implementação (liveness detection).
const LIVENESS_EAR_VARIANCE_THRESHOLD = 0.003; // abaixo disso, olhos "congelados" demais entre frames

// Eye Aspect Ratio (Soukupová & Čech): razão entre a abertura vertical e a
// largura horizontal do olho a partir dos 6 pontos do landmark de 68 pontos.
export function eyeAspectRatio(eyePoints) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vertical1 = dist(eyePoints[1], eyePoints[5]);
  const vertical2 = dist(eyePoints[2], eyePoints[4]);
  const horizontal = dist(eyePoints[0], eyePoints[3]);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2 * horizontal);
}

export function averageEyeAspectRatio(landmarks) {
  const left = eyeAspectRatio(landmarks.getLeftEye());
  const right = eyeAspectRatio(landmarks.getRightEye());
  return (left + right) / 2;
}

// ── Enquadramento: exige que o rosto esteja perto (~60cm) e centralizado no molde ──
// Sem sensor de profundidade, a distância é aproximada pela LARGURA que o rosto ocupa
// no quadro: quanto mais perto, maior o rosto na imagem. Calibrado para uma webcam
// comum de totem (campo de visão ~60-70°): a ~60cm o rosto ocupa por volta de 20-24%
// da largura do quadro; abaixo disso está longe demais, acima de ~50% está perto demais.
const MIN_FACE_WIDTH_RATIO = 0.20;
const MAX_FACE_WIDTH_RATIO = 0.50;
// Tolerância de centralização em relação ao centro do quadro (0 a 0.5)
const CENTER_TOLERANCE_X = 0.26;
const CENTER_TOLERANCE_Y = 0.32;

// Avalia se o rosto detectado está bem posicionado (perto e dentro do molde central)
export function evaluateFramePosition(box, videoWidth, videoHeight) {
  const faceWidthRatio = box.width / videoWidth;
  const cx = (box.x + box.width / 2) / videoWidth;
  const cy = (box.y + box.height / 2) / videoHeight;
  const isOffCenter = Math.abs(cx - 0.5) > CENTER_TOLERANCE_X || Math.abs(cy - 0.5) > CENTER_TOLERANCE_Y;
  const isTooFar = faceWidthRatio < MIN_FACE_WIDTH_RATIO;
  const isTooClose = faceWidthRatio > MAX_FACE_WIDTH_RATIO;

  if (isTooFar) return 'too-far';
  if (isTooClose) return 'too-close';
  if (isOffCenter) return 'off-center';
  return 'ok';
}

// Canvases reaproveitados entre frames. O loop de detecção roda ~5x/s por
// minutos a fio num totem; criar `document.createElement('canvas')` a cada
// frame (um deles do tamanho cheio do vídeo) acumulava lixo de memória
// suficiente pra travar/derrubar a aba em dispositivos de baixo poder.
const _lumCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const _enhanceCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

// Mede a luminância média de um frame de vídeo/canvas de forma barata (amostra pequena)
function getAverageLuminance(source, sampleSize = 24) {
  const canvas = _lumCanvas || document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return total / (data.length / 4);
}

// Gera um canvas com realce de brilho/contraste proporcional ao quão escura está a cena
// (ou forçado no máximo se `boost` estiver ativo pelo toggle manual do totem).
function enhanceForLowLight(source, width, height, luminance, boost) {
  const canvas = _enhanceCanvas || document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const deficit = Math.max(0, DARK_LUMINANCE_THRESHOLD - luminance);
  const brightness = boost ? 1.9 : Math.min(1.8, 1 + deficit / 90);
  const contrast = boost ? 1.35 : Math.min(1.3, 1 + deficit / 220);
  ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

// Substitui o FaceMatcher padrão por uma versão com verificação de ambiguidade:
// rejeita o match se a segunda melhor correspondência estiver perigosamente próxima
// da primeira (rostos parecidos), em vez de simplesmente aceitar a menor distância.
export function findSecureMatch(descriptor, labeledDescriptors) {
  let bestLabel = 'unknown';
  let bestDistance = Infinity;
  let secondBestDistance = Infinity;

  for (const ld of labeledDescriptors) {
    for (const stored of ld.descriptors) {
      const distance = faceapi.euclideanDistance(descriptor, stored);
      if (distance < bestDistance) {
        secondBestDistance = bestDistance;
        bestDistance = distance;
        bestLabel = ld.label;
      } else if (distance < secondBestDistance) {
        secondBestDistance = distance;
      }
    }
  }

  if (bestDistance > MATCH_THRESHOLD) {
    return { label: 'unknown', distance: bestDistance, secondBestDistance };
  }
  if (secondBestDistance - bestDistance < MATCH_MARGIN) {
    return { label: 'unknown', distance: bestDistance, secondBestDistance, ambiguous: true };
  }
  return { label: bestLabel, distance: bestDistance, secondBestDistance };
}

export default function AdminFaceScanner({ onClose, requestKioskAccess, students, currentUser, isKioskMode = false, onUseAlternative }) {
  const videoRef = useRef(null);

  // Mantém a tela do dispositivo sempre acesa enquanto esta tela estiver
  // aberta — reclamação da escola: a tela apagava sozinha (economia de
  // energia do SO/navegador) no meio do reconhecimento facial.
  useWakeLock(true);

  // Sair desta tela (biometria) volta direto pro menu do Autoatendimento, sem
  // senha — a senha só é exigida pra sair do Autoatendimento como um todo
  // pra outro menu (ver AdminPortal.jsx > confirmKioskExit), não pra voltar
  // do reconhecimento facial pro menu de opções do próprio totem.
  const requestExit = () => onClose();

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [authorizedList, setAuthorizedList] = useState([]);
  const [labeledDescriptors, setLabeledDescriptors] = useState(null);
  const isDarkRef = useRef(false);
  const lastLuminanceCheckRef = useRef(0);
  const recentMatchesRef = useRef([]);
  // Liveness Detection (Fase 1, observação) — só liga por escola, via
  // schools.features_enabled.liveness_detection (Portal do Dev), padrão OFF.
  const livenessEnabledRef = useRef(false);
  const livenessEnforceRef = useRef(false);
  const earHistoryRef = useRef([]);
  // 'ok' | 'too-far' | 'off-center' | null — orienta o overlay de enquadramento
  const [framePosition, setFramePosition] = useState(null);
  const [noMatchReason, setNoMatchReason] = useState('');

  const [matchedPerson, setMatchedPerson] = useState(null); // The authorized person detected
  const [matchStatus, setMatchStatus] = useState('idle'); // 'idle' | 'searching' | 'matched' | 'no-match'
  const [matchedStudents, setMatchedStudents] = useState([]);
  // Quais dos alunos vinculados a essa pessoa estão de fato sendo
  // entregues/buscados agora — o reconhecimento facial só identifica o
  // ADULTO, não diz quais filhos estão fisicamente com ele. Filho único
  // pré-marca sozinho (sem ambiguidade, mantém o fluxo automático de
  // sempre); com 2+ filhos vinculados ao mesmo responsável (ex: pai e mãe
  // responsáveis pelos dois), começa tudo desmarcado e o responsável marca
  // quem está entregando/buscando agora.
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const toggleStudentSelection = (id) => {
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const [actionDone, setActionDone] = useState(false);
  // true quando a confirmação foi um mero RE-reconhecimento de uma
  // solicitação que já estava pendente (a pessoa esqueceu que já passou pelo
  // totem e tentou de novo) — antes disso mostrava a mesma tela de "sucesso"
  // de sempre, dando a entender que uma solicitação NOVA tinha sido criada.
  const [wasAlreadyPending, setWasAlreadyPending] = useState(false);

  // Fase B1 do PLANO_LOGGING_ERROS_PORTAL_DEV.md — grava cada falha REAL de
  // reconhecimento (nunca o estado ocioso do totem esperando alguém) em
  // error_logs, pra sair do "chute" e ter dado de campo sobre a causa das
  // reclamações de responsáveis não conseguindo ser reconhecidos. Sempre
  // best-effort (nunca lança, nunca atrasa o reconhecimento em si) e
  // throttled por categoria — o loop ao vivo roda a cada 180ms, sem
  // throttle isso viraria centenas de chamadas por minuto.
  const kioskSessionIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const lastFaceLogAtRef = useRef({});
  const FACE_LOG_THROTTLE_MS = 5000;

  const logFaceEvent = (category, severity, context = {}) => {
    // Achado real (Escola Montessori de Vitória, 21/09): supabase.rpc(...)
    // devolve um "query builder" que só garante implementar .then() -- não é
    // uma Promise nativa de verdade. No Safari/WebKit (totem rodando em
    // iPhone), chamar .catch() direto nesse objeto lança
    // "TypeError: ...catch is not a function" -- um erro DENTRO do próprio
    // log de erros. Isso quebrava o vigia de câmera travada (ver watchdog
    // logo abaixo, "camera_watchdog_recovery"): o throw síncrono aqui
    // impedia recoverOnce() de chegar até retryInit(), deixando o totem
    // preso com a câmera travada até alguém desistir e usar senha.
    // Correção definitiva, duas camadas:
    //   1. .then(null, fn) em vez de .catch(fn) -- .then sempre existe no
    //      builder, em qualquer motor/navegador, ao contrário de .catch.
    //   2. try/catch envolvendo a função inteira -- essa é a função
    //      chamada por vários pontos do app SEM proteção própria (ex:
    //      recoverOnce, resetStuckTimer); nenhum erro aqui dentro (nem
    //      futuro, nem previsto) pode voltar a interromper quem a chamou.
    try {
      const now = Date.now();
      const last = lastFaceLogAtRef.current[category] || 0;
      if (now - last < FACE_LOG_THROTTLE_MS) return;
      lastFaceLogAtRef.current[category] = now;
      supabase.rpc('log_error', {
        p_source: 'face_recognition',
        p_category: category,
        p_message: category,
        p_severity: severity,
        p_context: { kiosk_session_id: kioskSessionIdRef.current, ...context },
        p_school_id: currentUser?.school_id || null,
        p_user_id: currentUser?.id || null,
        p_role: currentUser?.role || null,
        p_url: typeof window !== 'undefined' ? window.location.href : null,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        p_screen: getCurrentScreen(),
      }).then(null, () => {});
    } catch (err) {
      console.warn('[FaceScanner] Falha ao registrar evento (não propagada):', err?.message || err);
    }
  };

  // Timeout de segurança: se ninguém for reconhecido depois de um tempo, oferece uma
  // alternativa (QR Code/PIN) em vez de deixar a pessoa presa olhando pra câmera.
  const STUCK_TIMEOUT_MS = 20000;
  const [showAlternative, setShowAlternative] = useState(false);
  const stuckTimerRef = useRef(null);

  const resetStuckTimer = () => {
    setShowAlternative(false);
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    stuckTimerRef.current = setTimeout(() => {
      setShowAlternative(true);
      logFaceEvent('stuck_timeout', 'warn', { elapsed_ms: STUCK_TIMEOUT_MS });
    }, STUCK_TIMEOUT_MS);
  };

  useEffect(() => {
    resetStuckTimer();
    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, []);

  // Feedback sonoro nas transições de status — o responsável nem sempre está olhando
  // para a tela, então o som confirma o resultado sem precisar checar visualmente.
  const prevMatchStatusRef = useRef('idle');
  useEffect(() => {
    if (matchStatus === prevMatchStatusRef.current) return;
    if (matchStatus === 'matched') playSuccessBeep();
    else if (matchStatus === 'no-match') playErrorBeep();
    prevMatchStatusRef.current = matchStatus;
  }, [matchStatus]);

  const [capturedImage, setCapturedImage] = useState(null);
  const [matchDistance, setMatchDistance] = useState(null);
  const [isProcessingCapture, setIsProcessingCapture] = useState(false);
  const [cameraReady, setCameraReady] = useState(false); // true quando stream de vídeo está ativo
  const [retryCount, setRetryCount] = useState(0); // incrementar refaz o init() (câmera falhou ou travou — nova tentativa, manual ou automática)
  const streamRef = useRef(null); // stream ativo, pra observar se a trilha de vídeo cai/congela
  const capturedImageRef = useRef(null); // espelha capturedImage sem precisar recriar o watchdog abaixo a cada captura

  // Confirma automaticamente a entrada/saída assim que o match ficar estável
  // por 1s (evita confirmar em cima de um frame instável/falso positivo) —
  // sem nenhuma espera visível depois disso (removida a pedido, ver useEffect
  // mais abaixo).
  const autoTriggeredRef = useRef(false);

  const retryInit = () => {
    setError(null);
    setCameraReady(false);
    setRetryCount(c => c + 1);
  };

  useEffect(() => { capturedImageRef.current = capturedImage; }, [capturedImage]);

  useEffect(() => {
    let active = true;
    let stream = null;

    async function init() {
      try {
        // 1. Aguarda modelos (já carregados em background pelo AdminPortal)
        await preloadFaceModels(); // retorna imediatamente se já estiverem em cache

        if (!active) return;
        setModelsLoaded(true);

        // 2. Busca responsáveis com foto aprovada
        // Sem photo_url aqui de propósito — a comparação facial só usa
        // face_descriptor, e photo_url guarda a foto em base64 (pode ser
        // pesada). Ela é buscada à parte, só da pessoa reconhecida, em
        // fetchMatchedPersonPhoto() — evita baixar a foto de TODOS os
        // responsáveis da escola toda vez que o Autoatendimento abre.
        const { data: authData, error: authError } = await supabase
          .from('authorized_persons')
          // face_descriptor_v2: só para o modo observador da Fase F (motor
          // candidato Human, rodando em paralelo num Worker isolado, nunca
          // usado pra decidir nada aqui) — ver humanShadowClient.js.
          .select('id, name, relation, family_id, face_descriptor, face_descriptor_v2, status')
          .eq('school_id', currentUser.school_id);

        if (authError) throw authError;

        const peopleWithBiometrics = (authData || []).filter(p => p.face_descriptor);
        setAuthorizedList(authData || []);

        if (peopleWithBiometrics.length === 0) {
          setError('Nenhum responsável com biometria facial cadastrado no sistema.');
          return;
        }

        const results = peopleWithBiometrics.map(person => {
          try {
            let desc = person.face_descriptor;
            if (typeof desc === 'string') {
              desc = JSON.parse(desc);
            }
            const floatArray = new Float32Array(desc);
            return new faceapi.LabeledFaceDescriptors(person.id, [floatArray]);
          } catch (err) {
            console.warn(`Erro ao ler biometria de ${person.name}:`, err);
            return null;
          }
        });

        if (!active) return;

        const validLabeledDescriptors = results.filter(Boolean);

        if (validLabeledDescriptors.length === 0) {
          setError('Não foi possível carregar as biometrias cadastradas.');
          return;
        }

        // 4. Guarda os descritores para comparação com verificação de ambiguidade
        // (ver findSecureMatch) — substitui o FaceMatcher padrão do face-api.js.
        setLabeledDescriptors(validLabeledDescriptors);

        // 5. Inicia câmera (o texto "Iniciando câmera" já é mostrado pela UI
        // derivada de modelsLoaded/cameraReady, ver render mais abaixo)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
      } catch (err) {
        console.error(err);
        const friendly =
          err.name === 'NotAllowedError' ? 'Permissão de câmera negada. Habilite o acesso à câmera nas configurações do navegador e tente novamente.' :
          err.name === 'NotFoundError' ? 'Nenhuma câmera foi encontrada neste dispositivo.' :
          err.name === 'NotReadableError' ? 'A câmera está em uso por outro aplicativo ou aba. Feche-o e tente novamente.' :
          'Erro ao iniciar reconhecimento facial: ' + (err.message || err);
        setError(friendly);
      }
    }

    init();

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (streamRef.current === stream) streamRef.current = null;
    };
  }, [retryCount]);

  // "Tela preta com o molde ao vivo" — relato real de um pai/dev chegando na
  // escola e encontrando o totem travado assim: cameraReady já tinha virado
  // true uma vez, mas a trilha de vídeo morreu ou congelou depois (câmera
  // solta pelo SO por inatividade, driver, outro app tomando o dispositivo)
  // sem nenhum evento óbvio pra reagir — o app nunca percebia e ficava preso
  // até alguém notar e recarregar manualmente. Isso não pode depender de
  // alguém notando: enquanto o totem está "ativo" (câmera pronta, sem
  // erro, sem foto capturada), observa a trilha de vídeo de duas formas
  // complementares e recupera sozinho, sem intervenção humana:
  //   1. Evento nativo da trilha (ended/mute) — sinal explícito do navegador.
  //   2. Vigia de progresso: video.currentTime tem que avançar; se ficar
  //      parado por ~12s com a câmera supostamente "pronta", é uma tela
  //      preta/congelada mesmo sem o navegador ter avisado nada.
  useEffect(() => {
    if (!cameraReady) return;

    const track = streamRef.current?.getVideoTracks?.()[0];
    let stalled = false;
    const recoverOnce = (reason) => {
      if (stalled) return; // evita disparar retry várias vezes pro mesmo travamento
      stalled = true;
      console.warn('[FaceScanner] Câmera travada/perdida, recuperando sozinho:', reason);
      logFaceEvent('camera_watchdog_recovery', 'error', { reason });
      retryInit();
    };
    const onEnded = () => recoverOnce('track ended');
    const onMute = () => recoverOnce('track muted');
    track?.addEventListener('ended', onEnded);
    track?.addEventListener('mute', onMute);

    let lastTime = videoRef.current?.currentTime ?? 0;
    let stuckChecks = 0;
    const watchdog = setInterval(() => {
      const video = videoRef.current;
      if (!video || capturedImageRef.current) return; // captura manual pausa naturalmente o vídeo, não é travamento
      if (video.currentTime === lastTime) {
        stuckChecks++;
        if (stuckChecks >= 3) recoverOnce('sem progresso de frame por ~12s'); // 3 checagens de 4s
      } else {
        stuckChecks = 0;
        lastTime = video.currentTime;
      }
    }, 4000);

    return () => {
      clearInterval(watchdog);
      track?.removeEventListener('ended', onEnded);
      track?.removeEventListener('mute', onMute);
    };
  }, [cameraReady, retryCount]);

  // Recarrega as biometrias sem reabrir o app. Antes, uma foto cadastrada
  // com a tela do totem já aberta só passava a ser reconhecida depois de
  // fechar e abrir o aplicativo por completo — o scanner montava a lista de
  // descritores uma única vez. Agora:
  //  1. Realtime: qualquer INSERT/UPDATE/DELETE em authorized_persons da
  //     escola dispara um novo carregamento na hora (cobre cadastro feito
  //     em outro dispositivo, ex: Portal da Família).
  //  2. Foco da janela: ao voltar pra aba do totem, revalida (cobre o
  //     cadastro feito na mesma máquina, na tela de Cadastro de Foto).
  useEffect(() => {
    if (!currentUser?.school_id) return;
    let cancelled = false;

    const reloadBiometrics = async () => {
      try {
        const { data, error: reloadError } = await supabase
          .from('authorized_persons')
          .select('id, name, relation, family_id, face_descriptor, face_descriptor_v2, status')
          .eq('school_id', currentUser.school_id);
        if (reloadError || cancelled || !data) return;

        const withBio = data.filter(p => p.face_descriptor);
        const rebuilt = withBio.map(person => {
          try {
            let desc = person.face_descriptor;
            if (typeof desc === 'string') desc = JSON.parse(desc);
            return new faceapi.LabeledFaceDescriptors(person.id, [new Float32Array(desc)]);
          } catch {
            return null;
          }
        }).filter(Boolean);

        if (cancelled) return;
        setAuthorizedList(data);
        if (rebuilt.length > 0) setLabeledDescriptors(rebuilt);
      } catch (err) {
        console.warn('[FaceScanner] Falha ao recarregar biometrias:', err?.message || err);
      }
    };

    const channel = supabase
      .channel(`face-scanner-biometrics-${currentUser.school_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'authorized_persons', filter: `school_id=eq.${currentUser.school_id}` },
        reloadBiometrics
      )
      .subscribe();

    const onFocus = () => reloadBiometrics();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [currentUser?.school_id]);

  // Liveness Detection (Fase 1, observação) — checa uma vez só se a escola
  // tem o módulo ligado no Portal do Dev. Padrão OFF, nunca afeta escolas
  // sem o módulo habilitado.
  useEffect(() => {
    if (!currentUser?.school_id) return;
    let cancelled = false;
    supabase
      .from('schools')
      .select('features_enabled')
      .eq('id', currentUser.school_id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        livenessEnabledRef.current = Boolean(data?.features_enabled?.liveness_detection);
        // Só tem efeito se o módulo de observação acima também estiver ligado
        // — sem ele, não existe earHistory pra avaliar.
        livenessEnforceRef.current = livenessEnabledRef.current && Boolean(data?.features_enabled?.liveness_detection_enforce);
      }, () => {});
    return () => { cancelled = true; };
  }, [currentUser?.school_id]);

  // Busca a foto só da pessoa reconhecida (não de todos os cadastrados) —
  // usada apenas para exibir o confronto visual na tela; nunca bloqueia o
  // check-in em si (best-effort, se falhar simplesmente não mostra a foto).
  const fetchMatchedPersonPhoto = async (personId) => {
    try {
      const { data } = await supabase
        .from('authorized_persons')
        .select('photo_storage_path')
        .eq('id', personId)
        .single();

      // Foto vem exclusivamente do Storage. Se não houver
      // photo_storage_path (sem foto cadastrada) ou a signed URL falhar,
      // simplesmente não mostra a foto — não há mais fallback pra Base64.
      let resolvedUrl = null;
      if (data?.photo_storage_path) {
        resolvedUrl = await getAuthorizedPersonPhotoSignedUrl(data.photo_storage_path).catch(() => null);
      }

      if (resolvedUrl) {
        setMatchedPerson(prev => (prev && prev.id === personId ? { ...prev, photo_url: resolvedUrl } : prev));
      }
    } catch (err) {
      console.error('Erro ao buscar foto do responsável reconhecido:', err);
    }
  };

  // FASE F (modo observador) do plano de migração de reconhecimento facial.
  // Roda o motor candidato (Human, isolado num Worker — ver
  // humanShadowClient.js) sobre o MESMO frame que o motor atual já
  // confirmou de verdade, só pra registrar o que ele diria. NUNCA decide
  // nada, NUNCA bloqueia nem atrasa o check-in real, NUNCA lança erro pra
  // fora — qualquer falha aqui é só logada e ignorada.
  const runHumanShadowComparison = async (video, faceApiMatchedId, schoolId, people) => {
    try {
      const t0 = performance.now();
      const result = await detectViaHumanWorker(video);
      const ms = Math.round(performance.now() - t0);

      if (!result.ok || !result.descriptor) {
        await supabase.from('shadow_face_recognition_log').insert({
          school_id: schoolId,
          faceapi_matched_person_id: faceApiMatchedId,
          human_matched_person_id: null,
          human_similarity: null,
          agree: false,
          human_detection_ms: ms,
        });
        return;
      }

      let best = null;
      for (const person of people) {
        if (!person.face_descriptor_v2) continue;
        let candidateDescriptor;
        try {
          candidateDescriptor = JSON.parse(person.face_descriptor_v2);
        } catch {
          continue;
        }
        const similarity = cosineSimilarity(result.descriptor, candidateDescriptor);
        if (!best || similarity > best.similarity) best = { id: person.id, similarity };
      }

      await supabase.from('shadow_face_recognition_log').insert({
        school_id: schoolId,
        faceapi_matched_person_id: faceApiMatchedId,
        human_matched_person_id: best?.id || null,
        human_similarity: best?.similarity ?? null,
        agree: best?.id === faceApiMatchedId,
        human_detection_ms: ms,
      });
    } catch (err) {
      // Silencioso de propósito — o modo observador nunca pode afetar o
      // fluxo real de reconhecimento/check-in.
      console.error('[Shadow Human] erro (não afeta o check-in real):', err.message);
    }
  };

  // Busca os alunos vinculados a um responsável reconhecido (1º e 2º Responsável)
  const fetchStudentsForPerson = async (person) => {
    const { data: guardianLinks } = await supabase
      .from('student_guardians')
      .select('student_id')
      .eq('guardian_id', person.family_id);

    const studentIds = guardianLinks?.map(l => l.student_id) || [];

    if (studentIds.length > 0) {
      if (students && students.length > 0) {
        return students.filter(s => studentIds.includes(s.id) || s.family_id === person.family_id || s.familyId === person.family_id);
      }
      const { data } = await supabase
        .from('students')
        .select('*')
        .in('id', studentIds)
        .eq('school_id', currentUser.school_id);
      return data || [];
    }

    if (students && students.length > 0) {
      return students.filter(s => s.familyId === person.family_id || s.family_id === person.family_id);
    }
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('family_id', person.family_id)
      .eq('school_id', currentUser.school_id);
    return data || [];
  };

  // Loop de detecção — só roda quando câmera estiver realmente ativa
  useEffect(() => {
    if (!labeledDescriptors || !modelsLoaded || !cameraReady || error || capturedImage) return;

    let timerId;
    let cancelled = false;
    let isDetecting = false;
    let matchConfirmed = false;

    // Anti-flicker: só atualiza o estado exibido (borda/mensagem do molde) depois que
    // a MESMA leitura se repetir por alguns frames seguidos, evitando que a mensagem
    // "Aproxime-se/Afaste-se/Centralize" pisque a cada pequena oscilação da detecção.
    let lastRawPosition = undefined;
    let stableCount = 0;
    const debouncedSetFramePosition = (position) => {
      if (position === lastRawPosition) {
        stableCount += 1;
      } else {
        lastRawPosition = position;
        stableCount = 1;
      }
      if (stableCount === 2) {
        setFramePosition(position);
      }
    };

    const detectFace = async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || isDetecting) return;

      isDetecting = true;
      try {
        const video = videoRef.current;

        if (video && video.videoWidth) {
          // Reavalia a luminância periodicamente (não a cada frame — é custoso)
          const now = Date.now();
          if (now - lastLuminanceCheckRef.current > LUMINANCE_CHECK_INTERVAL_MS) {
            lastLuminanceCheckRef.current = now;
            isDarkRef.current = getAverageLuminance(video) < DARK_LUMINANCE_THRESHOLD;
          }

          // Só paga o custo de pré-processamento em canvas quando necessário
          // (cena escura ou boost manual ligado) — mantém o caminho rápido em boa luz.
          let detectionInput = video;
          if (isDarkRef.current) {
            const luminance = getAverageLuminance(video);
            detectionInput = enhanceForLowLight(video, video.videoWidth, video.videoHeight, luminance, false);
          }

          // Depois de já confirmado, só precisamos monitorar a posição do rosto (mais
          // barato) — landmarks/descriptor só são recalculados enquanto ainda buscando.
          const detections = matchConfirmed
            ? await faceapi.detectSingleFace(detectionInput, LIVE_DETECTOR_OPTIONS)
            : await faceapi.detectSingleFace(detectionInput, LIVE_DETECTOR_OPTIONS).withFaceLandmarks().withFaceDescriptor();

          if (!detections) {
            setMatchStatus('idle');
            debouncedSetFramePosition(null);
            recentMatchesRef.current = [];
            earHistoryRef.current = [];
            if (matchConfirmed) {
              matchConfirmed = false;
              setMatchedPerson(null);
              setMatchedStudents([]);
              setMatchDistance(null);
              resetStuckTimer();
            }
          } else {
            const box = matchConfirmed ? detections.box : detections.detection.box;
            const position = evaluateFramePosition(box, video.videoWidth, video.videoHeight);
            debouncedSetFramePosition(position);

            if (position !== 'ok') {
              // Fora do molde (longe demais ou descentralizado): não é seguro confirmar
              // — e se já estava confirmado, o molde é o "foco": sair dele cancela o
              // match e volta automaticamente para "Verificando Rosto".
              recentMatchesRef.current = [];
              earHistoryRef.current = [];
              if (matchConfirmed) {
                matchConfirmed = false;
                setMatchedPerson(null);
                setMatchedStudents([]);
                setMatchDistance(null);
                resetStuckTimer();
              }
              setMatchStatus('searching');
              logFaceEvent('frame_position_rejected', 'warn', { reason: position, mode: 'live' });
            } else if (!matchConfirmed) {
              setMatchStatus('searching');
              const bestMatch = findSecureMatch(detections.descriptor, labeledDescriptors);

              // Liveness Detection (Fase 1, observação) — reaproveita os MESMOS
              // landmarks já calculados pra achar o rosto (nenhum custo extra),
              // acumulados na mesma janela de CONSISTENCY_FRAMES.
              if (livenessEnabledRef.current) {
                const earHistory = earHistoryRef.current;
                earHistory.push(averageEyeAspectRatio(detections.landmarks));
                if (earHistory.length > CONSISTENCY_FRAMES) earHistory.shift();
              }

              // Debounce por consistência: só confirma depois de N frames seguidos
              // apontando para a MESMA pessoa. Um frame isolado ruim (comum em pouca
              // luz) nunca é suficiente para exibir/confirmar alguém.
              const history = recentMatchesRef.current;
              history.push(bestMatch.label);
              if (history.length > CONSISTENCY_FRAMES) history.shift();

              const isConsistent =
                history.length === CONSISTENCY_FRAMES &&
                history.every(label => label === bestMatch.label);

              if (bestMatch.label !== 'unknown' && isConsistent) {
                const personId = bestMatch.label;
                const person = authorizedList.find(p => p.id === personId);

                // Liveness Detection — avaliado ANTES de confirmar, pra poder
                // vetar o match quando "Bloqueio Ativo" estiver ligado. Com só
                // o módulo de observação ligado (sem o de bloqueio), isso
                // nunca impede a confirmação — só registra o que teria sido.
                let suspectedSpoof = false;
                let earVariance = null;
                if (livenessEnabledRef.current && earHistoryRef.current.length === CONSISTENCY_FRAMES) {
                  const ears = earHistoryRef.current;
                  const mean = ears.reduce((a, b) => a + b, 0) / ears.length;
                  earVariance = ears.reduce((a, b) => a + (b - mean) ** 2, 0) / ears.length;
                  suspectedSpoof = earVariance < LIVENESS_EAR_VARIANCE_THRESHOLD;
                }

                if (livenessEnforceRef.current && suspectedSpoof) {
                  // Recusa como se fosse mais um frame inconclusivo — mesmo
                  // caminho de "não reconhecido" de sempre (senha/QR via
                  // timeout já existente), nunca um beco sem saída novo.
                  recentMatchesRef.current = [];
                  earHistoryRef.current = [];
                  logFaceEvent('liveness_blocked', 'warn', {
                    mode: 'live',
                    ear_variance: earVariance,
                    threshold: LIVENESS_EAR_VARIANCE_THRESHOLD,
                    person_id: personId,
                  });
                } else if (person && !cancelled) {
                  matchConfirmed = true;
                  setMatchedPerson(person);
                  setMatchDistance(bestMatch.distance);
                  setMatchStatus('matched');
                  if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
                  setShowAlternative(false);
                  fetchMatchedPersonPhoto(person.id);
                  // Fase 1 (observação) — só grava o que a checagem de
                  // liveness decidiu; com "Bloqueio Ativo" desligado (padrão),
                  // nunca muda o resultado do reconhecimento.
                  if (earVariance !== null) {
                    logFaceEvent('liveness_check_observed', 'warn', {
                      mode: 'live',
                      ear_variance: earVariance,
                      suspected_spoof: suspectedSpoof,
                      person_id: person.id,
                    });
                  }
                  // Fase F — modo observador: nunca aguardado, nunca afeta o
                  // fluxo real acima. Ver runHumanShadowComparison().
                  runHumanShadowComparison(video, person.id, currentUser.school_id, authorizedList);
                  const studentsData = await fetchStudentsForPerson(person);
                  if (!cancelled) {
                    setMatchedStudents(studentsData);
                    // Só filho único pré-marca sozinho (sem ambiguidade). Com
                    // 2+, começa desmarcado — o responsável marca quem está
                    // entregando/buscando agora.
                    setSelectedStudentIds(studentsData.length === 1 ? studentsData.map(s => s.id) : []);
                  }
                }
              } else if (isConsistent) {
                // 3 frames seguidos apontando consistentemente pra "não
                // reconhecido" (não é ruído de 1 frame isolado) -- é o dado
                // que faltava pra saber SE a causa mais comum das
                // reclamações é limiar apertado demais (below_threshold) ou
                // ambiguidade entre cadastros parecidos (ambiguous_match).
                logFaceEvent(bestMatch.ambiguous ? 'ambiguous_match' : 'below_threshold', 'warn', {
                  mode: 'live',
                  distance: bestMatch.distance,
                  second_best_distance: bestMatch.secondBestDistance,
                  threshold: MATCH_THRESHOLD,
                  margin: MATCH_MARGIN,
                  candidate_count: labeledDescriptors.length,
                });
              }
            }
            // Se matchConfirmed && position === 'ok': mantém o estado atual (já confirmado).
          }
        }
      } catch (err) {
        console.error('Erro no loop de detecção:', err);
      }
      isDetecting = false;
      timerId = setTimeout(detectFace, DETECTION_INTERVAL_MS);
    };

    timerId = setTimeout(detectFace, 100); // Primeira execução um pouco mais cedo

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [labeledDescriptors, modelsLoaded, cameraReady, error, authorizedList, students, capturedImage]);

  // Capture current frame and run face comparison
  const handleCaptureAndCompare = async () => {
    if (!videoRef.current || !labeledDescriptors) return;

    // Protege contra tentativa de reconhecimento em série (alguém tentando
    // rosto atrás de rosto — o próprio, foto impressa, foto na tela de um
    // celular — pra forçar um falso positivo). Checagem no banco, escopada
    // pela própria escola.
    const { data: allowed, error: rateLimitError } = await supabase.rpc('check_kiosk_recognition_rate_limit');
    if (!rateLimitError && allowed === false) {
      setError('Muitas tentativas de reconhecimento em pouco tempo. Aguarde um instante ou use Senha/PIN.');
      logFaceEvent('rate_limited', 'warn', { mode: 'manual_capture' });
      return;
    }

    setIsProcessingCapture(true);
    setError(null);
    setNoMatchReason('');
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

      // Pré-processamento adaptativo: só realça brilho/contraste na intensidade que a
      // cena realmente precisa, em vez do filtro fixo 1.8/1.3 anterior, que distorcia
      // o rosto mesmo com boa iluminação e piorava a taxa de falso-positivo.
      const luminance = getAverageLuminance(video);
      const processCanvas = enhanceForLowLight(video, video.videoWidth || 640, video.videoHeight || 480, luminance, false);

      // Detector mais preciso (SsdMobilenetv1) para a confirmação manual — não é
      // tempo-crítico como o loop ao vivo, então vale usar o modelo mais robusto.
      const detection = await faceapi.detectSingleFace(processCanvas, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setMatchStatus('no-match');
        setIsProcessingCapture(false);
        logFaceEvent('no_face_detected', 'warn', { mode: 'manual_capture' });
        return;
      }

      const position = evaluateFramePosition(detection.detection.box, video.videoWidth || 640, video.videoHeight || 480);
      if (position !== 'ok') {
        setNoMatchReason(
          position === 'too-far' ? 'Aproxime-se do Dispositivo e tente novamente.' :
            position === 'too-close' ? 'Afaste-se do Dispositivo e tente novamente.' :
              'Centralize o rosto no molde e tente novamente.'
        );
        setMatchStatus('no-match');
        setIsProcessingCapture(false);
        logFaceEvent('frame_position_rejected', 'warn', { reason: position, mode: 'manual_capture' });
        return;
      }

      const bestMatch = findSecureMatch(detection.descriptor, labeledDescriptors);

      if (bestMatch.label !== 'unknown') {
        const personId = bestMatch.label;
        const person = authorizedList.find(p => p.id === personId);
        if (person) {
          setMatchedPerson(person);
          setMatchDistance(bestMatch.distance);
          setMatchStatus('matched');
          fetchMatchedPersonPhoto(person.id);
          const studentsData = await fetchStudentsForPerson(person);
          setMatchedStudents(studentsData);
          setSelectedStudentIds(studentsData.length === 1 ? studentsData.map(s => s.id) : []);
        } else {
          setMatchStatus('no-match');
          logFaceEvent('matched_person_not_found', 'error', { mode: 'manual_capture', person_id: personId });
        }
      } else {
        setMatchStatus('no-match');
        logFaceEvent(bestMatch.ambiguous ? 'ambiguous_match' : 'below_threshold', 'warn', {
          mode: 'manual_capture',
          distance: bestMatch.distance,
          second_best_distance: bestMatch.secondBestDistance,
          threshold: MATCH_THRESHOLD,
          margin: MATCH_MARGIN,
          candidate_count: labeledDescriptors.length,
        });
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
    setSelectedStudentIds([]);
    setActionDone(false);
    setWasAlreadyPending(false);
    setFramePosition(null);
    setNoMatchReason('');
    recentMatchesRef.current = [];
    autoTriggeredRef.current = false;
    resetStuckTimer();
  };

  const handleRequestAccess = async () => {
    const selected = matchedStudents.filter(s => selectedStudentIds.includes(s.id));
    if (!selected.length || isProcessingCapture || actionDone) return;

    // Calculado ANTES do requestKioskAccess (que reenvia o evento sem mudar
    // o status quando já está pending) — depois da chamada o status local já
    // seria o mesmo pending de antes, impossível diferenciar "novo" de
    // "repetido" só olhando o resultado.
    const alreadyPending = selected.every(s => s.status === 'pending_entry' || s.status === 'pending_exit');

    setIsProcessingCapture(true);
    try {
      await requestKioskAccess(selected.map(s => s.id), matchedPerson?.id || null);
      setWasAlreadyPending(alreadyPending);
      setActionDone(true); // Só aqui, após confirmação real do banco
    } catch (err) {
      console.error('Erro ao solicitar acesso:', err);
      setError('Falha ao registrar. Tente novamente: ' + (err.message || ''));
      setMatchStatus('no-match');
    } finally {
      setIsProcessingCapture(false);
    }
  };

  // Após concluir o check-in/check-out, volta pra tela de seleção do
  // Autoatendimento (Reconhecimento Facial / Senha·PIN) depois de 3s —
  // mesmo comportamento que o fluxo de PIN já tinha (AdminPasswordLogin.jsx),
  // só que este ficava preso "escaneando o próximo rosto" sem nunca fechar.
  useEffect(() => {
    if (!actionDone) return;
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [actionDone]);

  // Só confirma depois que o match ficar estável por 1s seguido — mesma
  // lógica do Cadastro de Foto (evita confirmar em cima de um único frame
  // trêmulo/falso positivo). Antes disso ainda tinha uma contagem regressiva
  // visível de 2s depois da estabilidade (~3s de atraso total); removida a
  // pedido — agora solicita assim que o reconhecimento fica estável, sem
  // espera visível nenhuma. Com mais de um aluno vinculado, NÃO confirma
  // sozinho: o reconhecimento facial só identifica o adulto, não diz quais
  // filhos estão fisicamente ali — precisa da conferência manual das
  // marcações antes de confirmar.
  useEffect(() => {
    if (matchStatus !== 'matched' || actionDone || isProcessingCapture || autoTriggeredRef.current || matchedStudents.length > 1) return;
    const timer = setTimeout(() => {
      autoTriggeredRef.current = true;
      handleRequestAccess();
    }, 1000);
    return () => clearTimeout(timer);
  }, [matchStatus, actionDone, isProcessingCapture, matchedStudents.length]);

  useEffect(() => {
    if (matchStatus !== 'matched') {
      autoTriggeredRef.current = false;
    }
  }, [matchStatus]);

  // Convert distance to similarity percentage
  const getSimilarityPercentage = (distance) => {
    if (distance === null || distance === undefined) return 0;
    // Euclidean distance of 0.6 is the default threshold.
    // Scale so distance=0 is 100%, distance=0.55 is 50%, and distance >= 0.7 is 0%
    const score = Math.max(0, 1 - (distance / 0.75));
    return Math.round(score * 100);
  };

  const innerContent = (
    <>
      {/* Mobile Header (Fixed at top on small screens) */}
      {!isKioskMode && (
        <div className="md:hidden flex justify-between items-center p-4 border-b border-outline-variant bg-white shrink-0 z-10">
          <h3 className="font-bold text-on-surface flex items-center gap-1.5 text-base">
            <Camera size={18} className="text-primary" /> Biometria Facial
          </h3>
          <button onClick={requestExit} className="p-2 -mr-2 text-on-surface-variant/70 hover:text-red-500 bg-surface-container hover:bg-red-50 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden w-full h-full">
        {/* Left pane: Camera feed or Static Captured Image */}
        <div className="relative flex-none h-[55%] min-h-[300px] md:h-auto md:flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">

          {(!cameraReady || !labeledDescriptors) && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-950/80 z-10 p-6 text-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-sm font-semibold">
                {!modelsLoaded ? "Carregando IA de reconhecimento" :
                  !cameraReady ? "Iniciando câmera" :
                    !labeledDescriptors ? "Preparando biometrias" : "Preparando sistema"}
              </p>
            </div>
          )}

          {error && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-950/90 z-10 p-6 text-center">
              <ShieldAlert className="h-12 w-12 text-red-500 mb-3" />
              <p className="text-sm font-bold text-red-400 mb-4 max-w-sm">{error}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={retryInit} className="bg-primary hover:bg-primary-container text-white font-bold py-2 px-6 rounded-zela-md text-sm transition">
                  Tentar Novamente
                </button>
                {isKioskMode && onUseAlternative ? (
                  <button onClick={onUseAlternative} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-zela-md text-sm transition flex items-center justify-center gap-1.5">
                    <QrCode size={16} /> Usar QR Code / Senha
                  </button>
                ) : (
                  <button onClick={requestExit} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-zela-md text-sm transition">
                    Fechar Janela
                  </button>
                )}
              </div>
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
            </>
          )}

          {/* Molde de rosto central: guia o responsável a se posicionar bem próximo
              da câmera (~60cm) para melhor precisão do reconhecimento. O tamanho grande
              exige aproximação — se o rosto não preencher o molde, está longe demais. */}
          {!capturedImage && !error && cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 pt-16 pb-16 md:pt-0 md:pb-0">
              <div className={`relative h-[96%] max-h-[360px] md:h-[82%] md:max-h-[420px] aspect-[3/4] rounded-full border-4 transition-colors duration-300 flex items-center justify-center ${
                matchStatus === 'matched' ? 'border-green-500' :
                  matchStatus === 'no-match' ? 'border-red-500' :
                    framePosition === 'too-far' || framePosition === 'too-close' || framePosition === 'off-center' ? 'border-orange-500' :
                      matchStatus === 'searching' ? 'border-indigo-600' : 'border-white/80'
              }`} />
            </div>
          )}

          {/* "Calibrando Câmera" — some assim que um rosto começa a ser verificado */}
          {!capturedImage && !error && cameraReady && matchStatus === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 gap-2 px-6 text-center">
              <span className="bg-black/60 backdrop-blur-md text-white text-sm sm:text-base font-bold px-4 py-2 rounded-zela-md shadow-md">
                Calibrando Câmera
              </span>
              <span className="bg-black/60 backdrop-blur-md text-slate-200 text-[11px] sm:text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md">
                Posicione o rosto dentro do molde
              </span>
            </div>
          )}

          {/* Aviso de enquadramento: rosto detectado mas longe/descentralizado do molde.
              Enquanto isso, nenhum match é confirmado — o molde é o foco obrigatório. */}
          {!capturedImage && !error && cameraReady && matchStatus === 'searching' && (framePosition === 'too-far' || framePosition === 'too-close' || framePosition === 'off-center') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 gap-2 px-6 text-center">
              <span className="bg-orange-500/90 backdrop-blur-md text-white text-sm sm:text-base font-bold px-4 py-2 rounded-zela-md shadow-md animate-pulse">
                {framePosition === 'too-far' ? 'Aproxime-se do Dispositivo' :
                  framePosition === 'too-close' ? 'Afaste-se do Dispositivo' :
                    'Centralize o rosto no molde'}
              </span>
            </div>
          )}

          {/* Timeout de segurança: se ninguém for reconhecido depois de um tempo,
              oferece uma alternativa em vez de deixar a pessoa presa olhando pra câmera */}
          {!capturedImage && !error && cameraReady && showAlternative && matchStatus !== 'matched' && onUseAlternative && (
            <div className="absolute bottom-20 left-4 right-4 flex justify-center z-30">
              <button
                onClick={onUseAlternative}
                className="pointer-events-auto flex items-center gap-2 bg-white text-on-surface font-bold px-4 py-2.5 rounded-zela-md shadow-lg text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-4"
              >
                <QrCode size={16} className="text-primary" /> Não está reconhecendo? Usar QR Code / Senha
              </button>
            </div>
          )}

          {/* Mirror status badge */}
          <div className="absolute top-4 left-4 md:top-auto md:bottom-4 md:left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-zela-md text-[10px] md:text-[11px] text-white flex items-center gap-1.5 font-mono max-w-[calc(100%-2rem)] md:max-w-none truncate shadow-md">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${matchStatus === 'matched' ? 'bg-green-500' :
              matchStatus === 'searching' ? 'bg-amber-500 animate-ping' :
                matchStatus === 'no-match' ? 'bg-red-500' : 'bg-surface-container-low0'
              }`}></span>
            <span className="truncate">
              {
                isProcessingCapture ? 'ANALISANDO SNAPSHOT' :
                  matchStatus === 'matched' ? (matchedPerson ? matchedPerson.name : 'BIOMETRIA APONTADA') :
                    matchStatus === 'searching' ? 'VERIFICANDO ROSTO' :
                      matchStatus === 'no-match' ? 'SEM CORRESPONDÊNCIA' : 'CÂMERA ATIVA'
              }
            </span>
          </div>


          {/* Botão principal da câmera: captura manual antes do match. Depois de
              encontrar o responsável com só 1 filho vinculado, a confirmação é
              100% automática (useEffect de auto-confirmação acima) — nenhum
              botão aparece, pra não dar a impressão de que precisa clicar em
              algo. Só reaparece (como confirmação manual de verdade) quando há
              MAIS de 1 filho vinculado: aí o reconhecimento do responsável não
              basta pra saber quem está fisicamente ali, precisa da escolha. */}
          {modelsLoaded && !capturedImage && !error && !actionDone && matchStatus !== 'matched' && (
            <div className="absolute bottom-4 left-4 right-4 md:left-auto md:w-auto">
              <button
                onClick={handleCaptureAndCompare}
                className="w-full md:w-auto flex justify-center items-center gap-2 bg-primary hover:bg-primary-container text-white font-black py-2.5 px-4 rounded-zela-md shadow-lg transition active:scale-95 text-[11px] sm:text-xs uppercase"
              >
                <Camera size={16} /> Capturar e Comparar
              </button>
            </div>
          )}

          {modelsLoaded && !capturedImage && !error && !actionDone && matchStatus === 'matched' && matchedStudents.length > 1 && (
            <div className="absolute bottom-4 left-4 right-4 md:left-auto md:w-auto">
              <button
                onClick={handleRequestAccess}
                disabled={selectedStudentIds.length === 0 || isProcessingCapture}
                className="w-full md:w-auto flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-black py-2.5 px-4 rounded-zela-md shadow-lg transition active:scale-95 text-[11px] sm:text-xs uppercase"
              >
                {isProcessingCapture ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {(() => {
                  const selected = matchedStudents.filter(s => selectedStudentIds.includes(s.id));
                  if (selected.length === 0) return 'Selecione ao menos 1 aluno';
                  const hasIn = selected.some(s => s.status === 'in_school');
                  const hasOut = selected.some(s => s.status !== 'in_school');
                  if (hasIn && hasOut) return 'Confirmar Entrada/Saída';
                  return hasIn ? 'Realizar Check-out' : 'Realizar Check-in';
                })()}
              </button>
            </div>
          )}
        </div>

        {/* Right pane: Match details / Actions */}
        <div className="flex-1 md:flex-none w-full md:w-96 shrink-0 border-t md:border-t-0 md:border-l border-outline-variant flex flex-col bg-surface-container-low min-h-0">
          {/* Desktop Header (Hidden on mobile) */}
          {!isKioskMode && (
            <div className="hidden md:flex justify-between items-center p-5 border-b border-outline-variant bg-white shrink-0">
              <h3 className="font-bold text-on-surface flex items-center gap-1.5">
                <Camera size={18} className="text-primary" /> Biometria Facial
              </h3>
              <button onClick={requestExit} className="p-1 text-on-surface-variant/70 hover:bg-surface-container rounded-lg transition">
                <X size={20} />
              </button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 sm:space-y-5 pb-10">
            {isProcessingCapture ? (
              <div className="text-center py-16 space-y-3">
                <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
                <p className="text-sm font-bold text-on-surface">Fazendo confronto biométrico</p>
                <p className="text-xs text-on-surface-variant/70">Verificando face com banco de dados de responsáveis cadastrados.</p>
              </div>
            ) : matchStatus === 'no-match' ? (
              <div className="text-center py-10 space-y-4 animate-in fade-in duration-200">
                <ShieldAlert className="mx-auto h-14 w-14 text-red-500 animate-bounce" />
                <div>
                  <h4 className="font-bold text-on-surface text-base">Nenhum Confronto Encontrado</h4>
                  <p className="text-on-surface-variant text-xs mt-2 px-4 leading-relaxed">
                    {noMatchReason || 'O rosto capturado não corresponde a nenhum dos responsáveis aprovados e cadastrados no sistema.'}
                  </p>
                </div>
                <button
                  onClick={handleResetScanner}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-zela-md transition text-sm flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} /> Tentar Novamente
                </button>
              </div>
            ) : actionDone ? (
              <div className="text-center py-10 space-y-4">
                <CheckCircle className="mx-auto h-16 w-16 text-green-500 animate-bounce" />
                <div>
                  <h4 className="font-bold text-on-surface text-lg">
                    {wasAlreadyPending ? 'Solicitação já realizada' : 'Solicitação Enviada!'}
                  </h4>
                  <p className="text-on-surface-variant text-xs mt-1">
                    {wasAlreadyPending
                      ? 'Aguardando aprovação da recepção. Não precisa escanear de novo.'
                      : 'Aguardando confirmação da recepção.'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-zela-md transition text-sm shadow-sm"
                >
                  Concluir
                </button>
              </div>
            ) : matchStatus !== 'matched' ? (
              <div className="text-center py-12 text-on-surface-variant/70 space-y-3">
                <Camera className="mx-auto h-12 w-12 text-slate-300 animate-pulse" />
                <div>
                  <p className="text-sm font-semibold text-on-surface">Aguardando detecção</p>
                  <p className="text-xs mt-1 px-4 leading-relaxed">
                    Posicione o responsável ou clique no botão Capturar e Comparar na câmera para capturar uma foto manual de confronto.
                  </p>
                </div>
              </div>
            ) : (
              // Match Found
              <div className="space-y-5 animate-in fade-in duration-300">

                {/* Visual side-by-side confrontation */}
                {capturedImage && (
                  <div>
                    <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-2">Confronto Biométrico</p>
                    <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-zela-lg border border-outline-variant shadow-sm relative">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-extrabold text-on-surface-variant/70 uppercase mb-1">Capturado</span>
                        <div className="w-full h-24 rounded-lg overflow-hidden border border-outline-variant">
                          <img src={capturedImage} alt="Capturado" className="w-full h-full object-cover" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-extrabold text-primary uppercase mb-1">Cadastrado</span>
                        <div className="w-full h-24 rounded-lg overflow-hidden border border-indigo-100 flex items-center justify-center bg-surface-container">
                          {matchedPerson.photo_url ? (
                            <img src={matchedPerson.photo_url} alt="Registrado" className="w-full h-full object-cover" />
                          ) : (
                            <Loader2 size={20} className="text-primary animate-spin" />
                          )}
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
                <div className="bg-white p-4 rounded-zela-lg border border-outline-variant shadow-sm flex items-center gap-3">
                  {!capturedImage && (
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-600 bg-surface-container shrink-0 flex items-center justify-center">
                      {matchedPerson.photo_url ? (
                        <img src={matchedPerson.photo_url} alt="Responsável" className="w-full h-full object-cover" />
                      ) : (
                        <Loader2 size={18} className="text-primary animate-spin" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-on-surface truncate text-sm">{matchedPerson.name}</p>
                    <p className="text-primary font-bold text-xs">{matchedPerson.relation}</p>
                    <span className="inline-block bg-green-100 text-green-700 text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-md mt-1 border border-green-200">
                      Biometria Aprovada
                    </span>
                  </div>
                </div>

                {/* Related students — o rosto reconhecido identifica o
                    responsável, não diz quais filhos estão fisicamente com
                    ele. Vem tudo marcado (mesmo comportamento de sempre pra
                    quem tem 1 filho só), mas dá pra desmarcar quem não está
                    sendo entregue/buscado agora. */}
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1">Quem está aqui agora?</p>
                  {matchedStudents.length > 1 && (
                    <p className="text-[11px] text-on-surface-variant/70 mb-2">Marque quem você está entregando ou buscando agora.</p>
                  )}
                  <div className="space-y-2 mt-2">
                    {matchedStudents.length === 0 ? (
                      <p className="text-xs text-on-surface-variant/70 italic">Nenhum aluno matriculado sob este responsável.</p>
                    ) : (
                      matchedStudents.map(student => {
                        const checked = selectedStudentIds.includes(student.id);
                        return (
                          <button
                            type="button"
                            key={student.id}
                            onClick={() => toggleStudentSelection(student.id)}
                            className={`w-full p-3 border rounded-zela-md flex justify-between items-center text-sm shadow-sm transition-all text-left ${checked ? 'bg-white border-outline-variant' : 'bg-surface-container-lowest border-dashed border-outline-variant opacity-60'}`}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-indigo-600' : 'border-outline-variant'}`}>
                                {checked && <CheckCircle size={13} className="text-white" strokeWidth={3} />}
                              </span>
                              <span className="min-w-0">
                                <p className="font-bold text-on-surface truncate">{student.name}</p>
                                <span className="text-[10px] text-on-surface-variant/70 uppercase">Horas/Dia: {student.contractedHours || '4h'}</span>
                              </span>
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${student.status === 'in_school' ? 'bg-indigo-100 text-primary' :
                              student.status === 'left' ? 'bg-surface-container text-on-surface-variant' :
                                student.status === 'pending_entry' || student.status === 'pending_exit' ? 'bg-amber-100 text-amber-700' : 'bg-surface-container text-on-surface-variant'
                              }`}>
                              {student.status === 'in_school' ? 'Na Escola' : student.status === 'left' ? 'Saiu' : student.status === 'pending_entry' ? 'Entrada Solicitada' : student.status === 'pending_exit' ? 'Saída Solicitada' : 'Pendente de Check-in'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (isKioskMode) {
    return (
      <div className="w-full h-full flex flex-col bg-white overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 bg-slate-900/80 backdrop-blur-sm">
      <div className="w-full h-full max-w-5xl max-h-[850px] bg-white rounded-zela-lg sm:rounded-zela-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {innerContent}
      </div>
    </div>
  );
}
