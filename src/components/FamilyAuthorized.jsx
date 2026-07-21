import React, { useState } from 'react';
import { Users, Plus, Camera, Fingerprint, Loader2, Trash2 } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { preloadFaceModels } from '../lib/faceModels';

export default function FamilyAuthorized({ authorized, togglePhoto, onOpenAuthModal, currentSchool }) {
  const [isProcessingId, setIsProcessingId] = useState(null);
  const isBasic = currentSchool?.plan === 'basic';
  const limitReached = isBasic && authorized.length >= 2;
  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Autorizados</h2>
            <p className="text-sm text-slate-500">Pessoas com permissão para retirar os alunos.</p>
          </div>
        </div>
        <div className="text-right flex flex-col items-end shrink-0">
          <button
            onClick={onOpenAuthModal}
            disabled={limitReached}
            className={`font-bold py-2.5 px-4 rounded-xl transition flex items-center gap-2 text-sm shadow-sm ${
              limitReached ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <Plus size={16}/> Novo Autorizado
          </button>
          {limitReached && (
            <p className="text-[10px] text-red-500 mt-1 max-w-[150px]">Limite do plano Basic atingido (Máx 2).</p>
          )}
        </div>
      </div>

      {/* List - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
        <div className="space-y-4">
          {authorized.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
              <Users className="mx-auto h-10 w-10 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Nenhum autorizado cadastrado.</p>
              <p className="text-xs text-slate-400 mt-1">Adicione familiares que podem buscar seus filhos.</p>
            </div>
          )}
          {authorized.map(person => {
            const handleFileChange = async (e) => {
              const file = e.target.files[0];
              if (file) {
                setIsProcessingId(person.id);
                try {
                  await preloadFaceModels();
                  const reader = new FileReader();
                  reader.onloadend = async () => {
                    const img = new Image();
                    img.src = reader.result;
                    img.onload = async () => {
                      const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                      if (detection) {
                        const descriptorArray = Array.from(detection.descriptor);
                        // Salva a foto (base64) e o descritor biométrico no banco de dados
                        await togglePhoto(person.id, reader.result, descriptorArray);
                      } else {
                        alert("Não foi possível detectar um rosto nítido na foto. Tente outra imagem.");
                      }
                      setIsProcessingId(null);
                    };
                  };
                  reader.readAsDataURL(file);
                } catch (err) {
                  console.error(err);
                  alert("Erro ao processar biometria.");
                  setIsProcessingId(null);
                }
              }
            };

            const handleRemovePhoto = async () => {
              if (window.confirm('Tem certeza que deseja remover a foto e biometria deste autorizado? O acesso por biometria será revogado imediatamente.')) {
                setIsProcessingId(person.id);
                try {
                  await togglePhoto(person.id, null, null);
                } catch (err) {
                  console.error(err);
                  alert("Erro ao remover biometria.");
                } finally {
                  setIsProcessingId(null);
                }
              }
            };

            return (
              <div key={person.id} className="flex flex-col sm:flex-row items-center justify-between p-4 border border-slate-100 rounded-2xl bg-slate-50 gap-4 transition hover:border-slate-300">
                {/* Avatar & Info */}
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-14 h-14 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-sm shrink-0 relative group cursor-pointer">
                    {isProcessingId === person.id ? (
                      <Loader2 size={20} className="text-indigo-600 animate-spin"/>
                    ) : person.photo_url ? (
                      <img src={person.photo_url} alt={person.name} className="w-full h-full object-cover" />
                    ) : person.hasPhoto || person.has_biometrics ? (
                      <div className="w-full h-full bg-green-100 flex items-center justify-center text-green-600">
                        <Fingerprint size={24} />
                      </div>
                    ) : (
                      <Camera size={20} className="text-slate-400"/>
                    )}
                    <label className="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center text-white cursor-pointer transition">
                      <Camera size={18}/>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isProcessingId === person.id}/>
                    </label>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base text-slate-800 truncate">{person.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">{person.relation}</span>
                      {person.emergencyOrder && (
                        <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-lg font-bold border border-red-100">
                          {person.emergencyOrder}º Emergência
                        </span>
                      )}
                      {person.temporaryUntil && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg font-bold border border-amber-100">
                          Até {person.temporaryUntil}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status + Foto Action */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 sm:gap-2 pt-3 sm:pt-0 border-t sm:border-0 border-slate-200">
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg ${person.status === 'approved' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                    {person.status === 'approved' ? 'Ativo' : 'Pendente'}
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer flex items-center justify-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm w-full sm:w-auto">
                      {isProcessingId === person.id ? (
                         <><Loader2 size={14} className="animate-spin"/> Proc...</>
                      ) : (
                         <><Fingerprint size={14}/> {person.hasPhoto || person.has_biometrics ? 'Atualizar' : 'Cadastrar Biometria'}</>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isProcessingId === person.id}/>
                    </label>
                    
                    {(person.hasPhoto || person.has_biometrics || person.photo_url) && (
                      <button 
                        onClick={handleRemovePhoto}
                        disabled={isProcessingId === person.id}
                        className="text-xs text-red-600 font-bold hover:underline cursor-pointer flex items-center justify-center gap-1 bg-white border border-red-200 px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50 w-full sm:w-auto"
                      >
                        <Trash2 size={14} /> Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 p-4 bg-indigo-50 text-indigo-800 rounded-xl border border-indigo-100 text-sm flex gap-3">
          <Camera className="shrink-0 text-indigo-600" />
          <p>
            <strong>Lembrete:</strong> É obrigatório anexar uma foto nítida do rosto do autorizado para o sistema de Reconhecimento Facial na recepção.
          </p>
        </div>
      </div>
    </div>
  );
}
