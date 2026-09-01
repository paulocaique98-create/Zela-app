import React, { useState } from 'react';
import { Users, Plus, Camera, Fingerprint, Loader2, Trash2 } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { preloadFaceModels } from '../lib/faceModels';
import ConfirmModal from './ConfirmModal';

export default function FamilyAuthorized({ authorized, togglePhoto, deleteAuthorized, onOpenAuthModal, currentSchool }) {
  const [isProcessingId, setIsProcessingId] = useState(null);
  const [confirmRemovePhotoId, setConfirmRemovePhotoId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pendingConsent, setPendingConsent] = useState(null); // { person, file }
  const isBasic = currentSchool?.plan === 'basic';
  const limitReached = isBasic && authorized.length >= 2;

  const performRemovePhoto = async () => {
    const personId = confirmRemovePhotoId;
    setIsProcessingId(personId);
    try {
      await togglePhoto(personId, null, null);
    } catch (err) {
      console.error(err);
      alert("Erro ao remover biometria.");
    } finally {
      setIsProcessingId(null);
      setConfirmRemovePhotoId(null);
    }
  };

  // Exclui o autorizado por completo (nome, foto e biometria) — diferente
  // de "Remover Foto", que só limpa a biometria e mantém o cadastro.
  const performDeleteAuthorized = async () => {
    const personId = confirmDeleteId;
    setIsProcessingId(personId);
    try {
      await deleteAuthorized(personId);
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir autorizado.");
    } finally {
      setIsProcessingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Só processa a foto (detecção facial + gravação) depois que o
  // responsável confirma o consentimento LGPD explícito — ver modal abaixo.
  const processCapture = async () => {
    const { person, file } = pendingConsent;
    setPendingConsent(null);
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
            try {
              await togglePhoto(person.id, reader.result, descriptorArray, true);
            } catch (err) {
              console.error(err);
              alert(err.message?.startsWith('Este rosto já está cadastrado') ? err.message : 'Erro ao processar biometria.');
            }
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
  };

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Autorizados</h2>
            <p className="text-small text-on-surface-variant">Pessoas com permissão para retirar os alunos.</p>
          </div>
        </div>
        <div className="text-right flex flex-col items-end shrink-0">
          <button
            onClick={onOpenAuthModal}
            disabled={limitReached}
            className={`font-bold py-2.5 px-4 rounded-zela-md transition flex items-center gap-2 text-sm shadow-sm ${
              limitReached ? 'bg-slate-200 text-on-surface-variant/70 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-container'
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
            <div className="text-center py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
              <Users className="mx-auto h-10 w-10 text-outline-variant mb-3" />
              <p className="text-on-surface-variant font-medium">Nenhum autorizado cadastrado.</p>
              <p className="text-xs text-on-surface-variant/70 mt-1">Adicione familiares que podem buscar seus filhos.</p>
            </div>
          )}
          {authorized.map(person => {
            const handleFileChange = (e) => {
              const file = e.target.files[0];
              if (file) setPendingConsent({ person, file });
              e.target.value = ''; // permite selecionar o mesmo arquivo de novo se cancelar
            };

            const handleRemovePhoto = () => setConfirmRemovePhotoId(person.id);
            const handleDeleteAuthorized = () => setConfirmDeleteId(person.id);

            return (
              <div key={person.id} className="flex flex-col sm:flex-row items-center justify-between p-4 border border-outline-variant rounded-zela-lg bg-surface-container-low gap-4 transition hover:border-slate-300">
                {/* Avatar & Info */}
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-14 h-14 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-sm shrink-0 relative group cursor-pointer">
                    {isProcessingId === person.id ? (
                      <Loader2 size={20} className="text-primary animate-spin"/>
                    ) : person.photo_url ? (
                      <img src={person.photo_url} alt={person.name} className="w-full h-full object-cover" />
                    ) : person.hasPhoto || person.has_biometrics ? (
                      <div className="w-full h-full bg-green-100 flex items-center justify-center text-green-600">
                        <Fingerprint size={24} />
                      </div>
                    ) : (
                      <Camera size={20} className="text-on-surface-variant/70"/>
                    )}
                    <label className="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center text-white cursor-pointer transition">
                      <Camera size={18}/>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isProcessingId === person.id}/>
                    </label>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base text-on-surface truncate">{person.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-xs font-medium text-on-surface-variant bg-white border border-outline-variant px-2 py-0.5 rounded-lg">{person.relation}</span>
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
                <div className="flex flex-col sm:flex-col items-start sm:items-end justify-between w-full sm:w-auto gap-3 sm:gap-2 pt-3 sm:pt-0 border-t sm:border-0 border-outline-variant">
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg ${person.status === 'approved' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                    {person.status === 'approved' ? 'Ativo' : 'Pendente'}
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <label className="text-xs text-primary font-bold hover:underline cursor-pointer flex items-center justify-center gap-1 bg-white border border-outline-variant px-3 py-1.5 rounded-lg shadow-sm w-full sm:w-auto">
                      {isProcessingId === person.id ? (
                         <><Loader2 size={14} className="animate-spin"/> Processando</>
                      ) : (
                         <><Fingerprint size={14}/> {person.hasPhoto || person.has_biometrics ? 'Atualizar' : 'Cadastrar Biometria'}</>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isProcessingId === person.id}/>
                    </label>
                    
                    {(person.hasPhoto || person.has_biometrics || person.photo_url) && (
                      <button
                        onClick={handleRemovePhoto}
                        disabled={isProcessingId === person.id}
                        className="text-xs text-on-surface-variant font-bold hover:underline cursor-pointer flex items-center justify-center gap-1 bg-white border border-outline-variant px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50 w-full sm:w-auto"
                      >
                        <Trash2 size={14} /> Remover Foto
                      </button>
                    )}
                    <button
                      onClick={handleDeleteAuthorized}
                      disabled={isProcessingId === person.id}
                      className="text-xs text-red-600 font-bold hover:underline cursor-pointer flex items-center justify-center gap-1 bg-white border border-red-200 px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50 w-full sm:w-auto"
                    >
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 p-4 bg-primary/10 text-indigo-800 rounded-zela-md border border-primary/10 text-sm flex gap-3">
          <Camera className="shrink-0 text-primary" />
          <p>
            <strong>Lembrete:</strong> É obrigatório anexar uma foto nítida do rosto do autorizado para o sistema de Reconhecimento Facial na recepção.
          </p>
        </div>
      </div>

      {confirmRemovePhotoId && (
        <ConfirmModal
          title="Remover biometria"
          message="Tem certeza que deseja remover a foto e biometria deste autorizado? O acesso por biometria será revogado imediatamente. O cadastro (nome/parentesco) continua existindo."
          isLoading={isProcessingId === confirmRemovePhotoId}
          onConfirm={performRemovePhoto}
          onCancel={() => setConfirmRemovePhotoId(null)}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Excluir autorizado"
          message="Isso apaga o cadastro por completo: nome, foto e biometria. Esta ação não pode ser desfeita."
          danger
          isLoading={isProcessingId === confirmDeleteId}
          onConfirm={performDeleteAuthorized}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {pendingConsent && (
        <ConfirmModal
          title="Consentimento para uso de biometria"
          message={`Ao continuar, você autoriza o uso da foto e dos dados biométricos faciais de ${pendingConsent.person.name} exclusivamente para identificação no sistema de reconhecimento facial da escola (check-in/check-out), conforme a Lei Geral de Proteção de Dados (LGPD). Você pode remover essa autorização e os dados a qualquer momento.`}
          confirmLabel="Concluir"
          danger={false}
          onConfirm={processCapture}
          onCancel={() => setPendingConsent(null)}
        />
      )}
    </div>
  );
}
