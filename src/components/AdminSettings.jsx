import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, Upload, AlertCircle, Building2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminSettings({ currentUser, currentSchool, onUpdate }) {
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: currentSchool?.name || '',
    phone: currentSchool?.phone || '',
    address: currentSchool?.address || '',
    city: currentSchool?.city || '',
    director_name: currentSchool?.director_name || '',
  });

  const [logoUrl, setLogoUrl] = useState(
    currentSchool?.logo_url || ''
  );

  const features = currentSchool?.features_enabled || {};
  const prefsKey = `admin_menu_prefs_${currentSchool?.id}`;
  
  const [localPrefs, setLocalPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(prefsKey) || '{}');
    } catch {
      return {};
    }
  });

  const allModules = [
    { id: 'cadastros', label: 'Cadastros', desc: 'Usuários e funcionários', core: true },
    { id: 'gerenciamento', label: 'Gerenciamento', desc: 'Lista de alunos e gestão de acessos', core: true },
    { id: 'checkin', label: 'Check-in/out', desc: 'Autoatendimento, monitor, presença e histórico', core: true },
    { id: 'formularios', label: 'Formulários', desc: 'Matrículas e fichas médicas', core: false },
    { id: 'calendario', label: 'Calendário Escolar', desc: 'Eventos da escola', core: false },
    { id: 'comunicados', label: 'Comunicados', desc: 'Mural de recados', core: false },
    { id: 'mural', label: 'Mural de Fotos', desc: 'Fotos das turmas', core: false },
    { id: 'cardapio', label: 'Cardápio', desc: 'Lanches e refeições', core: false },
  ];

  const availableModules = allModules.filter(mod => {
    if (mod.core) return features[mod.id] !== false;
    return features[mod.id] === true;
  });

  useEffect(() => {
    if (currentSchool) {
      setLogoUrl(currentSchool.logo_url || '');
      setFormData({
        name: currentSchool.name || '',
        phone: currentSchool.phone || '',
        address: currentSchool.address || '',
        city: currentSchool.city || '',
        director_name: currentSchool.director_name || '',
      });
      try {
        setLocalPrefs(JSON.parse(localStorage.getItem(`admin_menu_prefs_${currentSchool.id}`) || '{}'));
      } catch {
        setLocalPrefs({});
      }
    }
  }, [currentSchool]);


  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {


      // 2. Update Supabase
      const updates = {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        director_name: formData.director_name,
        logo_url: logoUrl || null,
      };

      const { error } = await supabase
        .from('schools')
        .update(updates)
        .eq('id', currentUser.school_id);

      if (error) throw error;
      
      // Salvar as preferências locais
      localStorage.setItem(prefsKey, JSON.stringify(localPrefs));
      
      setSuccessMsg('Configurações atualizadas com sucesso! A página será atualizada.');
      if (onUpdate) onUpdate();
      
      // O header e componentes irao atualizar reativamente via React e banco de dados

    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao atualizar dados: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white p-3 md:p-4 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 pb-3 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
            <Settings size={22} />
          </div>
          <h2 className="text-xl font-black text-on-surface">Configurações da Escola</h2>
        </div>
        <button
          type="submit"
          form="admin-settings-form"
          disabled={isLoading}
          className="px-5 py-2.5 bg-primary hover:bg-primary-container disabled:opacity-50 text-white font-bold rounded-zela-md shadow-md transition flex items-center justify-center gap-2 shrink-0"
        >
          <Save size={18} />
          {isLoading ? 'Salvando' : 'Salvar Alterações'}
        </button>
      </div>

      <form id="admin-settings-form" onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] gap-3 items-stretch">

            {/* LOGO UPLOAD */}
            <div className="flex flex-col items-center justify-center text-center gap-2 bg-surface-container-low p-3 rounded-zela-lg border border-outline-variant">
              <div className="w-12 h-12 bg-white rounded-full border-2 border-dashed border-primary/20 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="text-indigo-200" size={22} />
                )}
              </div>
              <div className="flex gap-2 items-center justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-outline-variant rounded-lg text-xs font-bold text-on-surface-variant hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition shrink-0"
                >
                  <Upload size={13} /> {logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl('')}
                    title="Remover logo"
                    className="p-1.5 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* DADOS DA ESCOLA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Nome / Razão Social</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-2 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Nome da Diretora Pedagógica</label>
                <input
                  type="text"
                  value={formData.director_name}
                  onChange={e => setFormData({...formData, director_name: e.target.value})}
                  placeholder="Ex: Vanessa Ramalho"
                  className="w-full p-2 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Cidade</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={e => setFormData({...formData, city: e.target.value})}
                  placeholder="Ex: Vitória"
                  className="w-full p-2 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>
          </div>

          {/* PERSONALIZAÇÃO DO MENU LOCAL */}
          <div className="pt-3 border-t border-outline-variant">
            <div className="mb-2">
              <h3 className="text-sm font-bold text-on-surface">Personalizar Menu</h3>
              <p className="text-xs text-on-surface-variant">Escolha quais módulos ficarão visíveis para você nesta tela. Esta configuração afeta apenas o seu navegador.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
              {availableModules.map(mod => {
                const isVisible = localPrefs[mod.id] !== false; // default true if available
                return (
                  <div key={mod.id} className="flex items-start gap-2 p-2 border border-outline-variant rounded-zela-md bg-white hover:bg-surface-container-low transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface">{mod.label}</p>
                      <p className="text-xs text-on-surface-variant/70 mt-0.5">{mod.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocalPrefs(prev => ({ ...prev, [mod.id]: !isVisible }))}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${isVisible ? 'bg-primary' : 'bg-slate-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isVisible ? 'translate-x-2' : '-translate-x-2'}`} />
                    </button>
                  </div>
                );
              })}
              {availableModules.length === 0 && (
                <p className="text-small text-on-surface-variant italic col-span-full">Nenhum módulo customizável disponível.</p>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-2 bg-green-50 border border-green-200 rounded-zela-md text-sm text-green-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {successMsg}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}


