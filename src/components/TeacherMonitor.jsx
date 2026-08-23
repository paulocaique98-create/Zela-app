import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, Car, Clock, Eye } from 'lucide-react';

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
    <div className={`h-full flex flex-col bg-white p-5 md:p-6 rounded-zela-xl shadow-sm border-2 transition-all duration-500 overflow-hidden ${newArrival ? 'border-amber-400 shadow-amber-100 shadow-lg' : 'border-outline-variant'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <AlertCircle size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Monitor de Solicitações</h2>
            <p className="text-small text-on-surface-variant">Acompanhe as solicitações em tempo real</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-wide bg-surface-container-low border border-outline-variant px-3 py-1.5 rounded-zela-md shrink-0">
          <Eye size={13} /> Somente visualização
        </span>
      </div>

      {newArrival && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-300 rounded-zela-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 shrink-0">
          <Bell className="text-amber-600 shrink-0 animate-bounce" size={22} />
          <div>
            <p className="font-bold text-amber-800">Nova atualização no painel!</p>
            <p className="text-xs text-amber-600">A recepção precisa confirmar essa solicitação.</p>
          </div>
        </div>
      )}

      {monitorStudents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
          <Car className="mx-auto h-12 w-12 text-outline-variant mb-3" />
          <h3 className="text-on-surface-variant font-medium">Nenhuma solicitação no momento.</h3>
          <p className="text-on-surface-variant/70 text-sm mt-1">O painel atualiza automaticamente com o totem e avisos das famílias.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {monitorStudents.map(student => {
              let badgeClass, badgeText, borderColor, bgColor;

              if (student.status === 'pending_entry') {
                badgeClass = "text-green-700"; badgeText = "Solicitação de Entrada";
                borderColor = "border-green-300"; bgColor = "bg-green-50";
              } else if (student.status === 'pending_exit') {
                badgeClass = "text-primary"; badgeText = "Solicitação de Saída";
                borderColor = "border-indigo-300"; bgColor = "bg-primary/10";
              }

              const requester = student.pendingRequesterId ? (authorized || []).find(p => p.id === student.pendingRequesterId) : null;

              return (
                <div
                  key={student.id}
                  className={`relative p-5 border-2 ${borderColor} ${bgColor} rounded-zela-lg shadow-sm animate-in zoom-in-95 duration-300`}
                >
                  {requester?.photo_url && (
                    <img
                      src={requester.photo_url}
                      alt={requester.name}
                      title={requester.name}
                      className="absolute top-3 right-3 w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                    />
                  )}
                  <p className={`text-[10px] md:text-xs font-bold uppercase mb-1 flex items-center gap-1 pr-11 ${badgeClass}`}>
                    <Clock size={12} /> {badgeText}
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
