import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getBrasiliaDateStr } from '../utils/attendanceUtils';
import { quemFezHoje } from '../lib/quemRegistrou';
import Selo from './Selo';

// Entrada e saída são registradas SÓ no autoatendimento da escola (decisão
// de 27/09/2026) -- aqui a família acompanha e, antes da chegada, pode
// avisar que o aluno não irá.
export default function FamilyHome({ familyStudents, markStudentAbsent }) {
  // Quem fez a entrada e a saída de hoje (30/09/2026): recarrega quando a
  // entrada ou a saída de algum filho muda (o App já atualiza isso em tempo
  // real).
  const [quem, setQuem] = useState({});
  const assinatura = (familyStudents || []).map(s => `${s.id}:${s.todayRecord?.entry || ''}:${s.todayRecord?.exit || ''}`).join('|');
  useEffect(() => {
    const ids = (familyStudents || []).map(s => s.id);
    if (ids.length === 0) return undefined;
    let cancelado = false;
    const hoje = getBrasiliaDateStr();
    supabase.from('attendance_logs')
      .select('student_id, event_type, event_time, performed_by_name, corrected')
      .in('student_id', ids)
      .gte('event_time', `${hoje}T00:00:00-03:00`)
      .lte('event_time', `${hoje}T23:59:59-03:00`)
      .then(({ data, error }) => { if (!cancelado && !error) setQuem(quemFezHoje(data)); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-zela-lg border-0 sm:border sm:border-outline-variant md:rounded-none md:border-0 overflow-hidden">
      {/* Título "Início" removido (o Header do app já mostra "Zela Portal"
          nessa tela). */}
      <div className="mb-6 flex justify-between items-start shrink-0">
        <p className="text-on-surface-variant text-small">Acompanhamento diário das entradas e saídas.</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <div className="flex flex-wrap gap-6 pb-4">
          {familyStudents.map(student => (
            <div key={student.id} className="w-full md:w-[calc(50%-12px)] border border-outline-variant rounded-zela-lg bg-surface-container-lowest overflow-hidden flex flex-col">
              <div className="p-5 md:p-6 border-b border-outline-variant flex-1">
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6">
                  <div>
                    <h3 className="font-serif font-semibold text-xl text-on-surface">{student.name}</h3>
                    <p className="text-small text-on-surface-variant">Contrato: {student.contractedHours}h/dia</p>
                  </div>
                  <div className="shrink-0">
                    {student.status === 'idle' && <Selo tom="neutro">Entrada pendente</Selo>}
                    {student.status === 'in_school' && <Selo tom="ok" icon={CheckCircle2}>Na escola</Selo>}
                    {student.status === 'left' && <Selo tom="petroleo">Já saiu</Selo>}
                    {student.status === 'absent' && <Selo tom="risco">Não irá hoje</Selo>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-2">
                  <div className="bg-surface-container-low p-3 md:p-4 rounded-zela-md border border-outline-variant">
                    <p className="text-xs text-on-surface-variant mb-1">Entrada</p>
                    <p className="text-base md:text-lg font-semibold text-on-surface tabular-nums">{student.todayRecord.entry || '--:--'}</p>
                    {student.todayRecord.entry && quem[student.id]?.entrada && (
                      <p className="text-xs text-on-surface-variant mt-1 break-words">{quem[student.id].entrada}</p>
                    )}
                  </div>
                  <div className="bg-surface-container-low p-3 md:p-4 rounded-zela-md border border-outline-variant">
                    <p className="text-xs text-on-surface-variant mb-1">Saída</p>
                    <p className="text-base md:text-lg font-semibold text-on-surface tabular-nums">{student.todayRecord.exit || '--:--'}</p>
                    {student.todayRecord.exit && quem[student.id]?.saida && (
                      <p className="text-xs text-on-surface-variant mt-1 break-words">{quem[student.id].saida}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 md:p-5 bg-surface-container-low border-t border-outline-variant">
                {student.status === 'idle' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-on-surface-variant text-center">A entrada é registrada no autoatendimento da escola.</p>
                    <button onClick={() => markStudentAbsent(student.id)} className="w-full bg-surface-container-lowest text-on-surface border border-outline-variant font-semibold py-3 min-h-[44px] rounded-zela-md hover:bg-surface-container transition-colors flex items-center justify-center gap-2 text-sm">
                      Não irá hoje
                    </button>
                  </div>
                ) : student.status === 'in_school' ? (
                  <div className="space-y-3">
                    <div className="w-full bg-success/10 text-success border border-success/30 border-l-4 border-l-success font-semibold py-3 rounded-zela-md flex items-center justify-center gap-2 text-sm">
                      <CheckCircle2 size={18} /> Aluno em segurança
                    </div>
                    <p className="text-xs text-on-surface-variant text-center">A saída é registrada no autoatendimento da escola, na hora da retirada.</p>
                  </div>
                ) : student.status === 'absent' ? (
                  <div className="w-full bg-error/10 text-error border border-error/30 border-l-4 border-l-error font-semibold py-4 rounded-zela-md flex items-center justify-center gap-2 text-sm text-center">
                    Escola notificada da ausência.
                  </div>
                ) : (
                   <div className="w-full bg-surface-container text-on-surface-variant border border-outline-variant font-semibold py-4 rounded-zela-md flex items-center justify-center gap-2 text-sm">
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
