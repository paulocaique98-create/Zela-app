import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2, ArrowLeft, RefreshCw, Check, CheckCircle2 } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { preloadFaceModels } from '../lib/faceModels';
import { detectViaHumanWorker } from '../lib/humanShadowClient';
import { medirRostoNaImagem, avaliarQualidade, mediaDeDescritores } from '../lib/qualidadeFoto';
import { evaluateFramePosition, proximoPassoDaContagem, MENSAGEM_DO_ENQUADRAMENTO } from '../lib/enquadramentoCadastro';
import { versaoNovaParaRecarregar, recarregarParaVersao } from '../lib/versaoDoApp';
import { marcarAtividadeDoTotem } from '../lib/atualizacaoDoTotem';
import ConfirmModal from './ConfirmModal';
import { supabase } from '../lib/supabase';
import { getCurrentScreen, registroDeErrosAtivo } from '../lib/errorLogger';

const POSITION_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
// Rede lenta: depois disso a câmera é liberada mesmo sem a conferência de versão.
const ESPERA_MAXIMA_DA_VERSAO_MS = 4000;
// Tela preta no cadastro (iPhone do totem, 08/10/2026): a câmera abria e o
// vídeo nunca pintava, sem erro e sem registro. Agora a câmera é vigiada.
const ESPERA_MAXIMA_DA_CAMERA_MS = 12000;
const CHECAGEM_DE_QUADRO_MS = 3000;
const CHECAGENS_SEM_QUADRO_PARA_REINICIAR = 3;
const MAX_REINICIOS_AUTOMATICOS = 2;

// Registro best-effort em error_logs (source face_recognition, categorias
// cadastro_*). Nunca lança nem atrasa a captura. O servidor define escola e
// usuário pela sessão (log_error), por isso não são enviados daqui.
const SESSAO_DO_CADASTRO = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ultimoRegistroEm = {};
function registrarCadastro(category, severity, context = {}) {
  try {
    if (!registroDeErrosAtivo()) return;
    const agora = Date.now();
    if (agora - (ultimoRegistroEm[category] || 0) < 2000) return;
    ultimoRegistroEm[category] = agora;
    supabase.rpc('log_error', {
      p_source: 'face_recognition',
      p_category: category,
      p_message: category,
      p_severity: severity,
      p_context: { cadastro_session_id: SESSAO_DO_CADASTRO, ...context },
      p_url: typeof window !== 'undefined' ? window.location.href : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      p_screen: getCurrentScreen(),
    }).then(null, () => {});
  } catch { /* o log nunca interrompe o cadastro */ }
}

function descreverCamera(video, track) {
  const ajustes = track?.getSettings?.() || {};
  return {
    video_width: video?.videoWidth ?? null,
    video_height: video?.videoHeight ?? null,
    video_ready_state: video?.readyState ?? null,
    track_ready_state: track?.readyState ?? null,
    track_muted: track?.muted ?? null,
    track_width: ajustes.width ?? null,
    track_height: ajustes.height ?? null,
    track_frame_rate: ajustes.frameRate ?? null,
  };
}

// Captura de biometria facial ao vivo pela câmera, com molde oval guiando o
// enquadramento (nunca por upload de arquivo/galeria) — extraído de
// AdminFaceEnrollment.jsx pra ser reaproveitado também no autocadastro da
// família (FamilyAuthorized.jsx). Antes, o cadastro pela família era um
// simples <input type="file">, sem nenhum controle de distância/
// enquadramento/iluminação: fotos de ângulo ruim, longe ou desfocadas
// geravam uma biometria de baixa qualidade que não batia de forma confiável
// no totem depois — o responsável ficava "preso" no reconhecimento sem
// nunca ser identificado. Usar a MESMA captura guiada em qualquer lugar do
// sistema que grave biometria elimina essa causa na raiz.
export default function FaceCameraCapture({ personName, consentMessage, onSave, onDone, onCancel, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const ovalRef = useRef(null);
  const autoTriggeredRef = useRef(false); // evita reiniciar a contagem repetidas vezes enquanto o rosto permanece "ok"
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  // Tela de sucesso explícita, só depois que o banco confirma de verdade —
  // sem isso, a pessoa fechava a tela assim que o "Confirmar" some e corria
  // pro totem, sem saber se realmente tinha terminado de salvar.
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(null);
  // null (sem rosto) | 'too-far' | 'too-close' | 'off-center' | 'ok'
  const [framePosition, setFramePosition] = useState(null);
  const [showConsent, setShowConsent] = useState(false);
  // Descritores do motor Human tirados ao vivo enquanto o rosto está bem
  // posicionado (01/10/2026). A média vira o face_descriptor_v2, em vez de
  // depender de uma foto comprimida.
  const amostrasHumanRef = useRef([]);
  // 'conferindo' | 'ok' | 'atualizando' (ver conferência de versão abaixo)
  const [versao, setVersao] = useState('conferindo');
  // Reinício da câmera (vigia de tela preta ou botão "Tentar de novo").
  const [tentativa, setTentativa] = useState(0);
  const reiniciosRef = useRef(0);

  // Conferência de versão antes da câmera (01/10/2026): o iPhone do totem
  // cadastrou biometria horas depois de uma publicação ainda com a captura
  // antiga. Se este aparelho estiver com o Zela desatualizado, recarrega
  // antes de abrir a câmera. Rede lenta ou fora: libera a câmera assim mesmo.
  useEffect(() => {
    let decidido = false;
    let recarga;
    const limite = setTimeout(() => {
      if (decidido) return;
      decidido = true;
      setVersao('ok');
    }, ESPERA_MAXIMA_DA_VERSAO_MS);
    versaoNovaParaRecarregar().then((build) => {
      if (decidido) return;
      decidido = true;
      clearTimeout(limite);
      if (!build) { setVersao('ok'); return; }
      setVersao('atualizando');
      recarga = setTimeout(() => recarregarParaVersao(build), 1500);
    });
    return () => {
      decidido = true;
      clearTimeout(limite);
      clearTimeout(recarga);
    };
  }, []);

  // A câmera só é solicitada depois que a pessoa clica em "Iniciar Captura"
  // — nunca abre sozinha ao entrar na tela.
  useEffect(() => {
    if (!cameraStarted) return;
    let active = true;
    let stream = null;
    let pronta = false;
    let limiteDaCamera;
    let vigia;
    setCameraReady(false);

    // Reinicia sozinho até MAX_REINICIOS_AUTOMATICOS vezes; depois mostra o
    // botão "Tentar de novo" em vez de deixar a tela preta.
    const reiniciar = (category, extra = {}) => {
      if (!active) return;
      const track = stream?.getVideoTracks?.()[0];
      registrarCadastro(category, 'error', { ...descreverCamera(videoRef.current, track), reinicios: reiniciosRef.current, ...extra });
      if (reiniciosRef.current < MAX_REINICIOS_AUTOMATICOS) {
        reiniciosRef.current += 1;
        setTentativa((t) => t + 1);
      } else {
        setError('A câmera não respondeu. Toque em "Tentar de novo".');
      }
    };

    (async () => {
      try {
        await preloadFaceModels();
      } catch (err) {
        console.error(err);
        registrarCadastro('cadastro_modelos_erro', 'error', { erro: err?.message || String(err) });
        if (active) setError('Não foi possível carregar a IA de reconhecimento. Verifique a internet e toque em "Tentar de novo".');
        return;
      }
      if (!active) return;
      setModelsLoaded(true);

      try {
        // 1920x1080 (08/10/2026): o pedido de 4096x2160 de 01/10 é pesado para
        // o iPhone (face-api + Human no WebGL sobre vídeo enorme) e é suspeito
        // da tela preta. Full HD mantém detalhe para o Human; o navegador
        // escolhe o modo mais próximo.
        const obtido = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' } });
        if (!active) {
          // Saiu da tela enquanto a câmera abria: não deixa a câmera presa.
          obtido.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = obtido;
        const track = stream.getVideoTracks()[0];
        const video = videoRef.current;

        const aoFicarPronta = () => {
          if (!active || pronta) return;
          pronta = true;
          clearTimeout(limiteDaCamera);
          setCameraReady(true);
          let ultimoTempo = videoRef.current?.currentTime ?? 0;
          let parados = 0;
          vigia = setInterval(() => {
            const v = videoRef.current;
            if (!v || document.hidden) return;
            if (v.currentTime === ultimoTempo) {
              parados += 1;
              if (parados >= CHECAGENS_SEM_QUADRO_PARA_REINICIAR) {
                clearInterval(vigia);
                reiniciar('cadastro_camera_travada', { motivo: 'sem progresso de quadro' });
              }
            } else {
              parados = 0;
              ultimoTempo = v.currentTime;
            }
          }, CHECAGEM_DE_QUADRO_MS);
        };

        track?.addEventListener('ended', () => reiniciar('cadastro_camera_travada', { motivo: 'track ended' }));
        track?.addEventListener('mute', () => registrarCadastro('cadastro_track_mudo', 'warn', descreverCamera(videoRef.current, track)));

        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = aoFicarPronta;
          if (video.readyState >= 1) aoFicarPronta();
          // Só autoPlay não basta em alguns iPhones; recusa de play() é registrada.
          try {
            video.play()?.then(null, (e) => registrarCadastro('cadastro_play_recusado', 'warn', { erro: e?.name || String(e) }));
          } catch { /* melhor esforço */ }
        }

        limiteDaCamera = setTimeout(() => {
          if (!pronta) reiniciar('cadastro_camera_sem_resposta', { espera_ms: ESPERA_MAXIMA_DA_CAMERA_MS });
        }, ESPERA_MAXIMA_DA_CAMERA_MS);
      } catch (err) {
        console.error(err);
        registrarCadastro('cadastro_camera_erro', 'error', { erro: err?.name || null, mensagem: err?.message || null });
        const friendly =
          err.name === 'NotAllowedError' ? 'Permissão de câmera negada. Habilite o acesso à câmera e toque em "Tentar de novo".' :
          err.name === 'NotFoundError' ? 'Nenhuma câmera foi encontrada neste dispositivo.' :
          err.name === 'NotReadableError' ? 'A câmera está em uso por outro aplicativo ou aba. Feche-o e toque em "Tentar de novo".' :
          'Erro ao iniciar a câmera. Toque em "Tentar de novo".';
        if (active) setError(friendly);
      }
    })();

    // O <video> nunca é desmontado (evita a tela preta ao "Tirar Outra" —
    // remontar o elemento perderia o srcObject já anexado ao stream ativo).
    return () => {
      active = false;
      clearTimeout(limiteDaCamera);
      clearInterval(vigia);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [cameraStarted, tentativa]);

  const tentarDeNovo = () => {
    reiniciosRef.current = 0;
    setError('');
    setTentativa((t) => t + 1);
  };

  const handleStartCapture = () => {
    if (versao !== 'ok') return;
    setError('');
    setCameraStarted(true);
  };

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
              marcarAtividadeDoTotem();
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

  // Foto salva na resolução cheia da câmera (01/10/2026). Antes era reduzida
  // para 480 px (JPEG 82%) para economizar espaço; o modo observador mostrou
  // que o motor Human, gerado a partir dessas fotos, confundia pessoas.
  const doCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const nativeWidth = video.videoWidth || 640;
    const nativeHeight = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = nativeWidth;
    canvas.height = nativeHeight;
    const ctx = canvas.getContext('2d');
    // Espelha pra ficar igual ao preview (que está espelhado via CSS)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Qualidade 0.92: preserva o detalhe do rosto.
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.92));
  };

  // Enquanto o rosto está bem posicionado (antes e durante a contagem), tira
  // descritores do Human de alguns quadros. Nunca bloqueia nada: se o Human
  // não responder, o cadastro segue só com o motor atual.
  useEffect(() => {
    if (!cameraReady || capturedImage || framePosition !== 'ok') return undefined;
    let cancelado = false;
    let timer;
    const coletar = async () => {
      const video = videoRef.current;
      if (cancelado || !video || video.readyState < 2) return;
      const r = await detectViaHumanWorker(video);
      if (cancelado) return;
      if (r?.ok && Array.isArray(r.descriptor) && r.descriptor.length) {
        amostrasHumanRef.current = [...amostrasHumanRef.current, r.descriptor].slice(-6);
      }
      timer = setTimeout(coletar, 400);
    };
    coletar();
    return () => { cancelado = true; clearTimeout(timer); };
  }, [cameraReady, capturedImage, framePosition]);

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

  // Contagem regressiva de 3 s (01/10/2026): só anda com o rosto em
  // "Perfeito". Se a pessoa sai do enquadramento, a contagem pausa e a
  // orientação volta a aparecer; quando ela volta, retoma de onde parou.
  // Cada número precisa de um segundo inteiro em "Perfeito", então a foto só
  // sai com o rosto bem enquadrado (antes, quem se afastava durante a
  // contagem saía com o rosto pequeno).
  useEffect(() => {
    if (countdown === null || capturedImage) return undefined;
    const passo = proximoPassoDaContagem(countdown, framePosition);
    if (passo === 'pausada') return undefined;
    const timer = setTimeout(() => {
      if (passo === 'capturar') {
        doCapture();
        setCountdown(null);
      } else {
        setCountdown(c => c - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, framePosition, capturedImage]);

  const handleRetake = () => {
    amostrasHumanRef.current = [];
    setError('');
    setCapturedImage(null);
    setCountdown(null);
    autoTriggeredRef.current = false;
  };

  const handleSave = () => {
    if (!capturedImage) return;
    setShowConsent(true);
  };

  // Só grava a biometria depois que a pessoa (ou quem está cadastrando por
  // ela) confirma o consentimento LGPD.
  const confirmSave = async () => {
    setShowConsent(false);
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
      // Qualidade da foto (01/10/2026): números da região do rosto.
      const qualidade = medirRostoNaImagem(img, detection.detection.box, 'cadastro');
      const avaliacao = avaliarQualidade(qualidade);
      if (!avaliacao.ok) {
        setError(`${avaliacao.motivos.join(' ')} Toque em "Tirar outra" para repetir.`);
        setIsSaving(false);
        return;
      }

      const descriptorArray = Array.from(detection.descriptor);
      // Descritor do Human: média dos quadros ao vivo (precisa de 2 ou mais).
      const amostras = amostrasHumanRef.current;
      const descriptorV2 = amostras.length >= 2 ? mediaDeDescritores(amostras) : null;
      await onSave(capturedImage, descriptorArray, { descriptorV2, qualidade });
      setIsSaving(false);
      setSaveSuccess(true);
    } catch (err) {
      console.error(err);
      setError(err.message?.startsWith('Este rosto já está cadastrado') ? err.message : 'Erro ao processar a biometria.');
      setIsSaving(false);
    }
  };

  // Depois de mostrar a confirmação, fecha sozinho em alguns segundos — dá
  // tempo de ler "já pode usar o reconhecimento facial" sem travar quem
  // quer seguir na hora (o botão "Concluir" já fecha antes disso).
  useEffect(() => {
    if (!saveSuccess) return;
    const timer = setTimeout(() => onDone(), 2500);
    return () => clearTimeout(timer);
  }, [saveSuccess]);

  return (
    <div className="flex flex-col h-[75vh] max-h-[560px]">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Sai bloqueada enquanto salva — sem isso, dava pra fechar antes
              do banco confirmar de verdade e a pessoa corria pro totem
              achando que já tinha terminado (ver diagnóstico de "recém
              cadastrada não reconhece"). Continua liberado na tela de
              sucesso, pra quem já leu e quer seguir na hora. */}
          {onCancel && (
            <button onClick={onCancel} disabled={isSaving} className="p-2 -ml-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-zela-md transition shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="text-base font-bold text-on-surface">{personName}</h2>
        </div>
        {onClose && (
          <button onClick={onClose} disabled={isSaving} className="p-2 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-zela-md transition shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">
            <X size={20} />
          </button>
        )}
      </div>

      {saveSuccess ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3 bg-white">
          <CheckCircle2 size={56} className="text-green-500" />
          <h3 className="font-bold text-lg text-on-surface">Biometria cadastrada!</h3>
          <p className="text-sm text-on-surface-variant max-w-xs">Já pode usar o reconhecimento facial no Autoatendimento.</p>
        </div>
      ) : (
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
            {versao === 'atualizando' ? (
              <p className="text-sm font-semibold text-slate-200 max-w-xs">
                Existe uma versão nova do Zela Escola. Atualizando antes de abrir a câmera; depois, é só abrir o cadastro de novo.
              </p>
            ) : (
              <p className="text-sm font-semibold text-slate-200 max-w-xs">
                A câmera só é ligada quando você clicar em "Iniciar Captura"
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center bg-slate-950">
            <p className="text-sm font-bold text-red-400">{error}</p>
            {cameraStarted && (
              <button onClick={tentarDeNovo} className="mt-4 flex items-center gap-2 bg-white text-slate-900 font-bold text-sm px-5 py-2.5 rounded-zela-md active:scale-[0.98] transition">
                <RefreshCw size={16} /> Tentar de novo
              </button>
            )}
          </div>
        )}

        {!error && capturedImage && (
          <img src={capturedImage} alt="Foto capturada" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {!error && cameraStarted && !capturedImage && (!modelsLoaded || !cameraReady) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 bg-slate-950/80">
            <Loader2 className="h-10 w-10 animate-spin mb-3" />
            <p className="text-sm font-semibold">{!modelsLoaded ? 'Carregando IA de reconhecimento' : 'Iniciando câmera'}</p>
          </div>
        )}

        {!error && !capturedImage && cameraReady && (() => {
          const pausada = countdown !== null && framePosition !== 'ok';
          const ovalColor =
            countdown !== null && !pausada ? 'border-indigo-400' :
            framePosition === 'ok' ? 'border-green-500' :
            framePosition ? 'border-amber-500' : 'border-white/80';
          const message = MENSAGEM_DO_ENQUADRAMENTO[framePosition] || 'Olhe para a câmera';
          return (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
              <div ref={ovalRef} className={`relative h-[82%] max-h-[380px] aspect-[3/4] rounded-full border-4 transition-colors duration-300 flex items-center justify-center ${ovalColor}`}>
                {countdown !== null ? (
                  <div className="flex flex-col items-center gap-2">
                    <span className={`text-white text-6xl font-black drop-shadow-lg animate-in zoom-in duration-300 ${pausada ? 'opacity-40' : ''}`} key={countdown}>
                      {countdown}
                    </span>
                    {pausada && (
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-center leading-tight backdrop-blur-md bg-black/60 text-white">
                        {message}
                      </span>
                    )}
                  </div>
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
      )}

      <div className="p-5 border-t border-outline-variant shrink-0">
        {saveSuccess ? (
          <button
            onClick={onDone}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-zela-md transition text-sm"
          >
            <Check size={16} /> Concluir
          </button>
        ) : capturedImage ? (
          <div className="flex gap-2">
            <button
              onClick={handleRetake}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-bold py-3 rounded-zela-md transition text-sm disabled:opacity-60"
            >
              <RefreshCw size={16} /> Tirar Outra
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-zela-md transition text-sm disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {isSaving ? 'Salvando' : 'Confirmar'}
            </button>
          </div>
        ) : !cameraStarted ? (
          <button
            onClick={handleStartCapture}
            disabled={versao !== 'ok'}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-zela-md transition text-sm disabled:opacity-60"
          >
            {versao === 'ok' ? (
              <><Camera size={16} /> Iniciar Captura</>
            ) : (
              <><Loader2 size={16} className="animate-spin" /> {versao === 'atualizando' ? 'Atualizando o Zela Escola' : 'Conferindo a versão'}</>
            )}
          </button>
        ) : (
          <p className="text-center text-xs font-semibold text-on-surface-variant/70">
            {countdown !== null ? (framePosition === 'ok' ? `Capturando em ${countdown}` : `Contagem pausada · ${MENSAGEM_DO_ENQUADRAMENTO[framePosition] || 'Olhe para a câmera'}`) :
              framePosition === 'ok' ? 'Perfeito, capturando' :
              !cameraReady || !modelsLoaded ? 'Preparando câmera' :
              'Captura automática'}
          </p>
        )}
      </div>

      {showConsent && (
        <ConfirmModal
          title="Consentimento para uso de biometria"
          message={consentMessage}
          confirmLabel="Concluir"
          danger={false}
          isLoading={isSaving}
          onConfirm={confirmSave}
          onCancel={() => setShowConsent(false)}
        />
      )}
    </div>
  );
}
