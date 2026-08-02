import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Camera, Check, RefreshCcw, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { faceapi, preloadFaceModels } from '../lib/faceModels';

export default function AdminKioskFaceRegistration({ currentSchool, students = [], onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [allPersons, setAllPersons] = useState([]);
  const [filteredPersons, setFilteredPersons] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Camera states
  const videoRef = useRef(null);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  // Fetch all persons missing photo/descriptor for this school
  const fetchPersons = async () => {
    setIsLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('authorized_persons')
        .select(`
          id, 
          name, 
          photo_url, 
          face_descriptor,
          family_id
        `)
        .eq('school_id', currentSchool.id)
        .or('photo_url.is.null,face_descriptor.is.null')
        .order('name', { ascending: true });

      if (error) throw error;
      setAllPersons(data || []);
      setFilteredPersons(data || []);
    } catch (err) {
      console.error('Erro ao buscar responsáveis:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchPersons();
    preloadFaceModels().then(() => setIsModelsLoaded(true));
  }, []);

  // Real-time search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPersons(allPersons);
      return;
    }
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = allPersons.filter(ap => {
      const apMatch = ap.name.toLowerCase().includes(lowerQuery);
      const apStudents = students.filter(s => s.familyId === ap.family_id);
      const stMatch = apStudents.some(s => s.name.toLowerCase().includes(lowerQuery));
      return apMatch || stMatch;
    });
    setFilteredPersons(filtered);
  }, [searchQuery, allPersons]);

  // Start camera when person is selected
  useEffect(() => {
    if (selectedPerson && !capturedPhoto) {
      startCamera();
    } else if (!selectedPerson) {
      stopCamera();
    }
    return () => stopCamera();
  }, [selectedPerson, capturedPhoto]);

  const startCamera = async () => {
    setCameraError('');
    setSaveSuccess('');
    setCapturedPhoto(null);
    setFaceDescriptor(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setCameraError('Erro ao acessar a câmera. Verifique as permissões.');
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handleCapture = async () => {
    if (!videoRef.current || !isModelsLoaded) return;
    setIsProcessing(true);
    setCameraError('');

    try {
      const video = videoRef.current;
      
      // Capture frame to canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);

      // Detect face
      const detection = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setCameraError('Nenhum rosto detectado. Peça ao responsável para se aproximar e olhar para a câmera.');
        setIsProcessing(false);
        return;
      }

      setFaceDescriptor(detection.descriptor);
      setCapturedPhoto(photoBase64);
      stopCamera();
    } catch (err) {
      console.error('Erro na captura:', err);
      setCameraError('Erro ao processar imagem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPerson || !capturedPhoto || !faceDescriptor) return;
    setIsProcessing(true);
    try {
      const descriptorArray = Array.from(faceDescriptor);
      
      const { error } = await supabase
        .from('authorized_persons')
        .update({
          photo_url: capturedPhoto,
          face_descriptor: JSON.stringify(descriptorArray)
        })
        .eq('id', selectedPerson.id);

      if (error) throw error;

      setSaveSuccess(`Cadastro facial de ${selectedPerson.name} realizado com sucesso!`);
      
      // Remove from lists
      const updatedAll = allPersons.filter(p => p.id !== selectedPerson.id);
      setAllPersons(updatedAll);
      setSelectedPerson(null);
      setCapturedPhoto(null);
      setFaceDescriptor(null);
      
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(''), 3000);
      
    } catch (err) {
      console.error('Erro ao salvar:', err);
      setCameraError('Erro ao salvar os dados.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = () => {
    setCapturedPhoto(null);
    setFaceDescriptor(null);
    startCamera();
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col font-sans h-screen h-[100dvh]">
      {/* HEADER */}
      <header className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
        <div>
          <h1 className="font-black text-xl leading-none flex items-center gap-2">
            <Camera className="w-6 h-6 text-indigo-400" />
            Cadastro Facial — Modo Escola
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Posicione o responsável em frente à câmera para registrar o reconhecimento facial
          </p>
        </div>
        <button 
          onClick={() => { stopCamera(); onClose(); }}
          className="p-2 text-slate-400 hover:bg-slate-800 rounded-xl transition-colors"
        >
          <X size={24} />
        </button>
      </header>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50">
        
        {/* ESQUERDA: LISTA */}
        <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r border-slate-200 bg-white flex flex-col h-[40vh] md:h-full shrink-0">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por nome do aluno ou responsável..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 text-sm"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {isLoadingList ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : allPersons.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 mt-10">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h3 className="text-lg font-bold text-slate-800 mb-2">Tudo Certo!</h3>
                <p className="text-sm text-slate-500 font-medium">
                  ✅ Todos os responsáveis desta escola já possuem cadastro facial completo.
                </p>
              </div>
            ) : filteredPersons.length === 0 ? (
              <div className="text-center text-slate-500 py-8 text-sm font-medium">
                Nenhum responsável pendente encontrado com essa busca.
              </div>
            ) : (
              filteredPersons.map(ap => {
                const isSelected = selectedPerson?.id === ap.id;
                const apStudents = students.filter(s => s.familyId === ap.family_id);
                const studentNames = apStudents.map(s => s.name).join(', ');

                return (
                  <button
                    key={ap.id}
                    onClick={() => setSelectedPerson(ap)}
                    className={`w-full text-left p-4 rounded-xl transition-all border ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' 
                        : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-slate-800">{ap.name}</span>
                      <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Sem Foto
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-medium line-clamp-1">
                      Aluno(s): {studentNames || 'Não informado'}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* DIREITA: CÂMERA */}
        <div className="w-full md:w-3/5 flex-1 flex flex-col items-center justify-center p-6 bg-slate-900 relative">
          
          {saveSuccess && (
            <div className="absolute top-6 left-6 right-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 z-10 animate-in fade-in slide-in-from-top-4">
              <Check className="w-5 h-5" />
              {saveSuccess}
            </div>
          )}

          {!selectedPerson ? (
            <div className="text-center text-slate-400">
              <Camera className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-medium">Selecione um responsável na lista para ativar a câmera</p>
            </div>
          ) : (
            <div className="w-full max-w-lg flex flex-col items-center">
              
              <div className="w-full text-white text-center mb-4">
                <h2 className="font-bold text-lg">{selectedPerson.name}</h2>
                <p className="text-slate-400 text-sm">Posicione o rosto centralizado</p>
              </div>

              <div className="relative w-full aspect-[3/4] sm:aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl mb-6">
                
                {/* Erro de câmera */}
                {cameraError && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 text-center z-10">
                    <div>
                      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                      <p className="text-red-200 font-medium text-sm">{cameraError}</p>
                      <button 
                        onClick={startCamera}
                        className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 text-sm"
                      >
                        Tentar Ligar Câmera Novamente
                      </button>
                    </div>
                  </div>
                )}

                {!capturedPhoto ? (
                  <video 
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
                  />
                ) : (
                  <img src={capturedPhoto} alt="Preview" className="w-full h-full object-cover" />
                )}

                {/* Overlay de carregamento */}
                {(!isModelsLoaded || isProcessing) && !cameraError && (
                  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                      <span className="text-indigo-200 text-sm font-bold">
                        {!isModelsLoaded ? 'Carregando IA Facial...' : 'Processando rosto...'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="w-full">
                {!capturedPhoto ? (
                  <button
                    onClick={handleCapture}
                    disabled={!cameraActive || isProcessing || !isModelsLoaded}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black rounded-xl text-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Camera className="w-6 h-6" />
                    Capturar Foto
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={handleRetry}
                      disabled={isProcessing}
                      className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      <RefreshCcw className="w-5 h-5" />
                      Tentar Novamente
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isProcessing}
                      className="flex-1 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                      Confirmar e Salvar
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
