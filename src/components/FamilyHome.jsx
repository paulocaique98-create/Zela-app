import React from 'react';
import { Car, CheckCircle2, Clock, LogOut } from 'lucide-react';

export default function FamilyHome({ currentUser, familyStudents, updateStudentStatus }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-2 md:mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Início</h2>
          <p className="text-slate-500 text-sm">Acompanhamento diário das entradas e saídas.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        {familyStudents.map(student => (
          <div key={student.id} className="w-full md:w-[calc(50%-12px)] border border-slate-200 rounded-3xl bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 md:p-6 border-b border-slate-100 flex-1">
              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6">
                <div>
                  <h3 className="font-bold text-xl text-slate-800">{student.name}</h3>
                  <p className="text-sm text-slate-500 font-medium">Contrato: {student.contractedHours}h/dia</p>
                </div>
                <div className="shrink-0">
                  {student.status === 'idle' && <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-full inline-block">Não chegou</span>}

                  {student.status === 'in_school' && <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 w-fit"><CheckCircle2 size={14} /> Na escola</span>}
                  {student.status === 'left' && <span className="bg-slate-800 text-slate-100 text-xs font-bold px-3 py-1.5 rounded-full inline-block">Já saiu</span>}
                  {student.status === 'absent' && <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full inline-block">Não irá hoje</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:gap-4 mb-2">
                <div className="bg-slate-50 p-3 md:p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Entrada</p>
                  <p className="text-base md:text-lg font-bold text-slate-700 font-mono">{student.todayRecord.entry || '--:--'}</p>
                </div>
                <div className="bg-slate-50 p-3 md:p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Saída</p>
                  <p className="text-base md:text-lg font-bold text-slate-700 font-mono">{student.todayRecord.exit || '--:--'}</p>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-5 bg-slate-50 border-t border-slate-100">
              {student.status === 'idle' ? (
                <div className="space-y-3">
                  <button onClick={() => updateStudentStatus(student.id, 'absent')} className="w-full bg-white text-slate-600 border border-slate-200 font-bold py-3 rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm shadow-sm">
                    Não irá hoje
                  </button>
                </div>
              ) : student.status === 'in_school' ? (
                <div className="space-y-3">
                  <div className="w-full bg-green-50 text-green-800 border border-green-200 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 text-sm">
                    <CheckCircle2 size={18} /> Aluno em segurança
                  </div>
                  <button onClick={() => updateStudentStatus(student.id, 'left')} className="w-full bg-slate-800 text-white font-bold py-4 rounded-2xl hover:bg-slate-900 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md">
                    <LogOut size={20} /> Registrar Saída
                  </button>
                </div>
              ) : student.status === 'absent' ? (
                <div className="w-full bg-red-50 text-red-800 border border-red-200 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm text-center">
                  Escola notificada da ausência.
                </div>
              ) : (
                 <div className="w-full bg-slate-200 text-slate-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm">
                  Turno concluído hoje
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
