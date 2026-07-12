import React from 'react';
import { QrCode, GraduationCap } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function FamilyWallet({ familyStudents }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-2 md:mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Carteira Digital</h2>
        <p className="text-slate-500 text-sm">Apresente o QR Code individual do aluno na portaria.</p>
      </div>

      {familyStudents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
          <p className="text-slate-500 font-medium">Nenhum aluno vinculado a esta conta.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {familyStudents.map(student => (
            <div key={student.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
              
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4 mt-2">
                <GraduationCap size={24} className="text-indigo-600" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-1">{student.name}</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">
                Turma: <span className="text-slate-700">{student.turma || 'Não definida'}</span>
              </p>
              
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 inline-block shadow-inner mb-6">
                <QRCodeSVG 
                  value={JSON.stringify({ studentId: student.id, type: 'student_checkin' })} 
                  size={160} 
                  level="M" 
                />
              </div>

              <p className="text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 flex items-center gap-1.5">
                <QrCode size={12} /> QR Code individual intransferível
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
