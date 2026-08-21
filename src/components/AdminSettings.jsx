import React, { useState, useEffect } from 'react';
import { Settings, Save, Upload, AlertCircle, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminSettings({ currentUser, currentSchool, onUpdate }) {
  const [formData, setFormData] = useState({
    name: currentSchool?.name || '',
    phone: currentSchool?.phone || '',
    address: currentSchool?.address || '',
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
    { id: 'cadastros', label: 'Cadastros', desc: 'Usuários, comunicados e funcionários', core: true },
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
        logo_url: logoUrl || null
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
    <div className="h-full flex flex-col bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
          <Settings size={22} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800">Configurações da Escola</h2>
          <p className="text-sm text-slate-500">Atualize informações e a identidade visual.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-6 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* LOGO UPLOAD MOCK */}
            <div className="md:col-span-2 flex flex-col gap-2 bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase">Logo da Escola</label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="w-20 h-20 bg-white rounded-full border-2 border-dashed border-indigo-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="text-indigo-200" size={32} />
                  )}
                </div>
                <div className="flex-1 w-full space-y-2">
                  <p className="text-xs text-slate-500">Selecione uma imagem (PNG, JPG) para ser a logo da sua escola no cabeçalho.</p>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2.5 file:px-4
                        file:rounded-xl file:border-0
                        file:text-sm file:font-bold
                        file:bg-indigo-50 file:text-indigo-700
                        hover:file:bg-indigo-100 cursor-pointer"
                    />
                    {logoUrl && (
                      <button type="button" onClick={() => setLogoUrl('')} className="px-3 text-red-500 text-xs font-bold hover:bg-red-50 rounded-xl transition h-10">
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome / Razão Social</label>
              <input 
                required 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm" 
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone de Contato</label>
              <input 
                type="text" 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm" 
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Endereço Completo</label>
              <input 
                type="text" 
                value={formData.address} 
                onChange={e => setFormData({...formData, address: e.target.value})} 
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm" 
              />
            </div>

            {/* PERSONALIZAÇÃO DO MENU LOCAL */}
            <div className="md:col-span-2 mt-4 pt-6 border-t border-slate-100">
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-800">Personalizar Menu</h3>
                <p className="text-sm text-slate-500">Escolha quais módulos ficarão visíveis para você nesta tela. Esta configuração afeta apenas o seu navegador.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {availableModules.map(mod => {
                  const isVisible = localPrefs[mod.id] !== false; // default true if available
                  return (
                    <div key={mod.id} className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl bg-white hover:bg-slate-50 transition">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700">{mod.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{mod.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLocalPrefs(prev => ({ ...prev, [mod.id]: !isVisible }))}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${isVisible ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      >
                        <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isVisible ? 'translate-x-2' : '-translate-x-2'}`} />
                      </button>
                    </div>
                  );
                })}
                {availableModules.length === 0 && (
                  <p className="text-sm text-slate-500 italic col-span-2">Nenhum módulo customizável disponível.</p>
                )}
              </div>
            </div>

          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {successMsg}
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-slate-100 flex justify-end shrink-0">
          <button 
            type="submit" 
            disabled={isLoading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Save size={18} />
            {isLoading ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}


