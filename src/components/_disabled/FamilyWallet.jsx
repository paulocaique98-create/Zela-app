import React from 'react';
import { QrCode, GraduationCap } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function FamilyWallet({ familyStudents }) {
  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
          <QrCode size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Carteira Digital</h2>
          <p className="text-slate-500 text-sm">Apresente este código na câmera do totem para realizar o check-in ou check-out.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1 flex items-center justify-center">
        {familyStudents.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <p className="text-slate-500 font-medium">Nenhum aluno vinculado a esta conta.</p>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
              
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 mt-2">
                <GraduationCap size={32} className="text-indigo-600" />
              </div>
              
              <h3 className="text-2xl font-black text-slate-800 mb-1">{currentUser?.name || 'Responsável'}</h3>
              <p className="text-sm font-medium text-slate-500 mb-8">
                Responsável Familiar
              </p>
              
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 inline-block shadow-inner mb-8">
                <QRCodeSVG 
                  value={JSON.stringify({ type: 'zela_checkin', family_id: currentUser?.id, school_id: currentSchool?.id })} 
                  size={200} 
                  level="M" 
                />
              </div>

              <div className="w-full border-t border-slate-100 pt-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Alunos Vinculados</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {familyStudents.map(student => (
                    <span key={student.id} className="bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
                      {student.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
