import React from 'react';
import { CheckCircle2, LogOut } from 'lucide-react';

export default function FamilyHome({ familyStudents, updateStudentStatus }) {
  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 flex justify-between items-start shrink-0">
        <div>
          <h2 className="text-h3 text-on-surface">Início</h2>
          <p className="text-on-surface-variant text-small">Acompanhamento diário das entradas e saídas.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <div className="flex flex-wrap gap-6 pb-4">
          {familyStudents.map(student => (
            <div key={student.id} className="w-full md:w-[calc(50%-12px)] border border-outline-variant rounded-zela-xl bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 md:p-6 border-b border-outline-variant flex-1">
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6">
                  <div>
                    <h3 className="font-bold text-xl text-on-surface">{student.name}</h3>
                    <p className="text-small text-on-surface-variant font-medium">Contrato: {student.contractedHours}h/dia</p>
                  </div>
                  <div className="shrink-0">
                    {student.status === 'idle' && <span className="bg-surface-container text-on-surface-variant text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full shrink-0 max-w-[140px] sm:max-w-none truncate text-center">Pendente Check-in</span>}

                    {student.status === 'in_school' && <span className="bg-green-100 text-green-700 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 w-fit shrink-0"><CheckCircle2 size={14} /> Na escola</span>}
                    {student.status === 'left' && <span className="bg-slate-800 text-slate-100 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full inline-block shrink-0">Já saiu</span>}
                    {student.status === 'absent' && <span className="bg-red-100 text-red-700 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full inline-block shrink-0">Não irá hoje</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-2">
                  <div className="bg-surface-container-low p-3 md:p-4 rounded-zela-lg border border-outline-variant">
                    <p className="text-[10px] md:text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1">Entrada</p>
                    <p className="text-base md:text-lg font-bold text-on-surface font-mono">{student.todayRecord.entry || '--:--'}</p>
                  </div>
                  <div className="bg-surface-container-low p-3 md:p-4 rounded-zela-lg border border-outline-variant">
                    <p className="text-[10px] md:text-xs font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1">Saída</p>
                    <p className="text-base md:text-lg font-bold text-on-surface font-mono">{student.todayRecord.exit || '--:--'}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 md:p-5 bg-surface-container-low border-t border-outline-variant">
                {student.status === 'idle' ? (
                  <div className="space-y-3">
                    <button onClick={() => updateStudentStatus(student.id, 'absent')} className="w-full bg-white text-on-surface-variant border border-outline-variant font-bold py-3 rounded-zela-lg hover:bg-surface-container-low active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm shadow-sm">
                      Não irá hoje
                    </button>
                  </div>
                ) : student.status === 'in_school' ? (
                  <div className="space-y-3">
                    <div className="w-full bg-green-50 text-green-800 border border-green-200 font-bold py-3 rounded-zela-lg flex items-center justify-center gap-2 text-sm">
                      <CheckCircle2 size={18} /> Aluno em segurança
                    </div>
                    <button onClick={() => updateStudentStatus(student.id, 'left')} className="w-full bg-slate-800 text-white font-bold py-4 rounded-zela-lg hover:bg-slate-900 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md">
                      <LogOut size={20} /> Registrar Saída
                    </button>
                  </div>
                ) : student.status === 'absent' ? (
                  <div className="w-full bg-red-50 text-red-800 border border-red-200 font-bold py-4 rounded-zela-lg flex items-center justify-center gap-2 text-sm text-center">
                    Escola notificada da ausência.
                  </div>
                ) : (
                   <div className="w-full bg-slate-200 text-on-surface-variant font-bold py-4 rounded-zela-lg flex items-center justify-center gap-2 text-sm">
                    Turno concluído hoje
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
