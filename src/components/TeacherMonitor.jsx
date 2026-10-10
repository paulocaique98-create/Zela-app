import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, UserRound, Clock, Eye } from 'lucide-react';
import Selo from './Selo';

// Monitor do Professor — SOMENTE VISUALIZAÇÃO. Confirmar/cancelar check-in e
// check-out é responsabilidade da Recepção/Admin; o professor só acompanha as
// solicitações pendentes dos alunos das próprias turmas (já filtradas por RLS).
export default function TeacherMonitor({ students, authorized }) {
  const monitorStudents = students.filter(s => ['pending_entry', 'pending_exit'].includes(s.status));
  const prevMonitorCount = useRef(monitorStudents.length);
  const [newArrival, setNewArrival] = useState(false);

  useEffect(() => {
    const current = monitorStudents.length;
    if (current > prevMonitorCount.current) {
      setNewArrival(true);
      const timer = setTimeout(() => setNewArrival(false), 4000);
      prevMonitorCount.current = current;
      return () => clearTimeout(timer);
    }
    prevMonitorCount.current = current;
  }, [monitorStudents.length]);

  return (
    <div className={`h-full flex flex-col bg-surface-container-lowest -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-zela-lg md:rounded-none border transition-colors duration-500 overflow-hidden ${newArrival ? 'border-warning' : 'border-outline-variant'}`}>
      {/* Título "Monitor de Solicitações" removido (o Header do app já mostra
          o nome da tela dinamicamente); ícone + descrição numa linha
          compacta (descrição sempre visível, mantém o ícone). */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 p-2 rounded-zela-md text-primary shrink-0">
            <AlertCircle size={18} aria-hidden="true" />
          </div>
          <p className="text-small text-on-surface-variant">Acompanhe as solicitações em tempo real</p>
        </div>
        <Selo tom="neutro" icon={Eye} className="shrink-0">Somente visualização</Selo>
      </div>

      {newArrival && (
        <div className="mb-5 p-4 bg-warning/10 border-l-4 border-warning rounded-zela-lg flex items-center gap-3 motion-safe:animate-in fade-in duration-300 shrink-0">
          <Bell className="text-warning shrink-0" size={22} aria-hidden="true" />
          <div>
            <p className="font-bold text-warning">Nova atualização no painel</p>
            <p className="text-xs text-on-surface-variant">A recepção precisa confirmar essa solicitação.</p>
          </div>
        </div>
      )}

      {monitorStudents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
          <UserRound className="mx-auto h-12 w-12 text-outline-variant mb-3" aria-hidden="true" />
          <h3 className="text-on-surface-variant font-medium">Nenhuma solicitação no momento.</h3>
          <p className="text-on-surface-variant/70 text-sm mt-1">O painel atualiza automaticamente com o totem e avisos das famílias.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {monitorStudents.map(student => {
              let badgeClass, badgeText, borderColor, bgColor;

              if (student.status === 'pending_entry') {
                badgeClass = "text-success"; badgeText = "Solicitação de entrada";
                borderColor = "border-l-success"; bgColor = "bg-success/10";
              } else if (student.status === 'pending_exit') {
                badgeClass = "text-primary"; badgeText = "Solicitação de saída";
                borderColor = "border-l-primary"; bgColor = "bg-primary/10";
              }

              const requester = student.pendingRequesterId ? (authorized || []).find(p => p.id === student.pendingRequesterId) : null;

              return (
                <div
                  key={student.id}
                  className={`relative p-5 border border-outline-variant border-l-4 ${borderColor} ${bgColor} rounded-zela-lg`}
                >
                  {requester?.photo_url && (
                    <img
                      src={requester.photo_url}
                      alt={requester.name}
                      title={requester.name}
                      className="absolute top-3 right-3 w-10 h-10 rounded-full object-cover border border-outline-variant"
                    />
                  )}
                  <p className={`text-xs font-semibold mb-1 flex items-center gap-1 pr-11 ${badgeClass}`}>
                    <Clock size={14} aria-hidden="true" /> {badgeText}
                  </p>
                  <h3 className="font-bold text-lg text-on-surface pr-11">{student.name}</h3>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
