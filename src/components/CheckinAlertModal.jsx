import React, { useEffect, useRef } from 'react';
import { Bell, Monitor, X } from 'lucide-react';

/**
 * CheckinAlertModal
 * Aparece em qualquer tela do Admin quando um aluno entra em
 * status 'pending_entry' ou 'pending_exit' via Realtime.
 *
 * Props:
 *   alert        — { studentName, type: 'Check-in'|'Check-out', studentId }
 *   onDismiss    — fecha o modal sem navegar
 *   onGoToMonitor — fecha e navega para a aba Monitor
 */
export default function CheckinAlertModal({ alert, onDismiss, onGoToMonitor }) {
  const dismissTimerRef = useRef(null);
  const progressRef = useRef(null);

  // Toca um bipe de alerta usando a Web Audio API (sem arquivo externo)
  const tocarAlerta = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      const tocarNota = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Acorde ascendente: Lá4 → Dó#5 → Mi5 (som amigável de notificação)
      tocarNota(440, ctx.currentTime, 0.18);
      tocarNota(554, ctx.currentTime + 0.18, 0.18);
      tocarNota(659, ctx.currentTime + 0.36, 0.35);
    } catch (e) {
      // Browser sem suporte a AudioContext — silent fail
      console.warn('[Zela] AudioContext não disponível:', e.message);
    }
  };

  useEffect(() => {
    if (!alert) return;

    // Toca o som ao montar
    tocarAlerta();

    // Barra de progresso animada (30s)
    if (progressRef.current) {
      progressRef.current.style.transition = 'none';
      progressRef.current.style.width = '100%';
      // Força reflow para garantir que a transição recomece
      progressRef.current.getBoundingClientRect();
      progressRef.current.style.transition = 'width 30s linear';
      progressRef.current.style.width = '0%';
    }

    // Auto-dismiss após 30 segundos
    dismissTimerRef.current = setTimeout(() => {
      onDismiss?.();
    }, 30000);

    return () => {
      clearTimeout(dismissTimerRef.current);
    };
  }, [alert]);

  if (!alert) return null;

  const isCheckin = alert.type === 'Check-in';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onDismiss}
    >
      {/* Card — clique no interior não fecha */}
      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'zelaAlertZoom 0.25s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de progresso de auto-dismiss no topo */}
        <div className="h-1 bg-slate-100 w-full">
          <div
            ref={progressRef}
            className="h-1 bg-amber-400"
            style={{ width: '100%' }}
          />
        </div>

        {/* Cabeçalho colorido */}
        <div className={`px-6 pt-6 pb-4 text-center ${isCheckin ? 'bg-gradient-to-b from-amber-50 to-white' : 'bg-gradient-to-b from-indigo-50 to-white'}`}>
          {/* Ícone animado */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md ${isCheckin ? 'bg-amber-100' : 'bg-indigo-100'}`}
            style={{ animation: 'zelaAlertBounce 0.6s ease infinite alternate' }}
          >
            <Bell
              size={32}
              className={isCheckin ? 'text-amber-500' : 'text-indigo-500'}
              fill="currentColor"
            />
          </div>

          <p className={`text-xs font-black uppercase tracking-widest mb-1 ${isCheckin ? 'text-amber-500' : 'text-indigo-500'}`}>
            Nova Solicitação!
          </p>
          <h2 className="text-2xl font-black text-slate-800 leading-tight">
            {alert.studentName}
          </h2>
        </div>

        {/* Tipo da operação */}
        <div className="px-6 pb-2">
          <div className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm ${isCheckin ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
            <span className="text-base">{isCheckin ? '📥' : '📤'}</span>
            {alert.type} solicitado no Autoatendimento
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 font-medium px-6 pb-4">
          Auto-dispensando em 30 segundos
        </p>

        {/* Botões */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onDismiss}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-bold py-3.5 rounded-2xl transition-all text-sm"
          >
            <X size={16} />
            Dispensar
          </button>
          <button
            onClick={onGoToMonitor}
            className={`flex-[2] flex items-center justify-center gap-2 text-white font-black py-3.5 rounded-2xl active:scale-95 transition-all shadow-md text-sm ${isCheckin ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            <Monitor size={16} />
            Ver no Monitor
          </button>
        </div>
      </div>

      {/* Keyframes via style tag inline — compatível sem CSS externo */}
      <style>{`
        @keyframes zelaAlertZoom {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes zelaAlertBounce {
          from { transform: translateY(0px) rotate(-4deg); }
          to   { transform: translateY(-5px) rotate(4deg); }
        }
      `}</style>
    </div>
  );
}
