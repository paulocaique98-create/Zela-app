import React, { useEffect, useRef } from 'react';
import { Bell, Monitor, X } from 'lucide-react';
import TrilhaConfirmacao from './TrilhaConfirmacao';

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
  const operacao = isCheckin ? 'Entrada' : 'Saída';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70"
      onClick={onDismiss}
    >
      {/* Card: clique no interior não fecha */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="checkin-alert-titulo"
        className={`relative bg-surface-container-lowest rounded-lg shadow-lg w-full max-w-sm overflow-hidden border-l-4 ${isCheckin ? 'border-l-success' : 'border-l-primary'}`}
        style={{ animation: 'zelaAlertZoom 0.2s ease-out both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de progresso do fechamento automático */}
        <div className="h-1 bg-surface-container-low w-full">
          <div ref={progressRef} className="h-1 bg-brass" style={{ width: '100%' }} />
        </div>

        <div className="px-6 pt-6 pb-4">
          <p className="text-sm font-semibold text-on-surface-variant flex items-center gap-2 mb-1">
            <Bell size={16} className="text-warning" aria-hidden="true" />
            Nova solicitação
          </p>
          <h2 id="checkin-alert-titulo" className="text-2xl font-semibold text-on-surface leading-tight">
            {alert.studentName}
          </h2>
          <p className="mt-2 text-sm text-on-surface">
            {operacao} solicitada no Autoatendimento
          </p>
        </div>

        <div className="px-6 pb-4">
          <TrilhaConfirmacao atual={2} />
        </div>

        <p className="text-xs text-on-surface-variant px-6 pb-4">
          Este aviso fecha sozinho em 30 segundos
        </p>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onDismiss}
            className="flex-1 flex items-center justify-center gap-2 min-h-[48px] bg-surface-container-low hover:bg-outline-variant text-on-surface font-semibold rounded-md transition-colors text-sm"
          >
            <X size={16} aria-hidden="true" />
            Dispensar
          </button>
          <button
            onClick={onGoToMonitor}
            className="flex-[2] flex items-center justify-center gap-2 min-h-[48px] bg-primary hover:bg-primary-container text-white font-semibold rounded-md transition-colors text-sm"
          >
            <Monitor size={16} aria-hidden="true" />
            Abrir o monitor
          </button>
        </div>
      </div>

      {/* Keyframes inline, compatível sem CSS externo. Movimento reduzido respeitado. */}
      <style>{`
        @keyframes zelaAlertZoom {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="alertdialog"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
