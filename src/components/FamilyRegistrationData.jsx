import React, { useState, useEffect } from 'react';
import { User, MapPin, Camera, Save, CheckCircle2, Loader2, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Documentos solicitados
const DOCUMENTS = [
  { key: 'child_birth_cert', label: 'Certidão de Nascimento do Filho' },
  { key: 'rg', label: 'RG' },
  { key: 'cpf', label: 'CPF' },
  { key: 'residence_proof', label: 'Comprovante de Residência' },
  { key: 'health_plan', label: 'Cópia do Plano de Saúde ou Cartão do SUS' },
  { key: 'vaccine_card', label: 'Cópia do Cartão de Vacina' },
];

export default function FamilyRegistrationData({ currentUser }) {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', phone2: '', doc_type: '', doc_number: '', profession: '', civil_status: '', guardian_type: '',
    zip_code: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: ''
  });
  
  const [documents, setDocuments] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', currentUser.id)
          .single();
          
        if (data && !error) {
          setFormData({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            phone2: data.phone2 || '',
            doc_type: data.doc_type || '',
            doc_number: data.doc_number || '',
            profession: data.profession || '',
            civil_status: data.civil_status || '',
            guardian_type: data.guardian_type || '',
            zip_code: data.zip_code || '',
            street: data.street || '',
            number: data.number || '',
            complement: data.complement || '',
            neighborhood: data.neighborhood || '',
            city: data.city || '',
            state: data.state || ''
          });
          setDocuments(data.documents || {});
        }
      } catch (err) {
        console.error('Erro ao buscar dados cadastrais:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, [currentUser.id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name,
          phone: formData.phone,
          phone2: formData.phone2,
          doc_type: formData.doc_type,
          doc_number: formData.doc_number,
          profession: formData.profession,
          civil_status: formData.civil_status,
          zip_code: formData.zip_code,
          street: formData.street,
          number: formData.number,
          complement: formData.complement,
          neighborhood: formData.neighborhood,
          city: formData.city,
          state: formData.state,
          documents: documents
        })
        .eq('id', currentUser.id);
        
      if (error) throw error;
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar dados:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDocumentCapture = (docKey, e) => {
    const file = e.target.files[0];
    if (file) {
      // Aqui idealmente faria o upload para o Supabase Storage.
      // Por enquanto, vamos simular que o arquivo foi selecionado.
      setDocuments(prev => ({
        ...prev,
        [docKey]: {
          name: file.name,
          status: 'uploaded',
          // url: url_do_storage
        }
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const inputCls = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
  const labelCls = "block text-xs font-semibold text-slate-700 mb-1";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
      <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600">
              <User size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Dados Cadastrais</h2>
              <p className="text-sm text-slate-500">Mantenha suas informações e documentos atualizados.</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="hidden md:flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : (saveSuccess ? <CheckCircle2 size={18} /> : <Save size={18} />)}
            {saveSuccess ? 'Salvo!' : 'Salvar'}
          </button>
        </div>

        <div className="space-y-8">
          {/* Informações Pessoais */}
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
              <User size={16} /> 1. Informações Pessoais
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Nome Completo</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input type="email" name="email" value={formData.email} disabled className={`${inputCls} opacity-70 cursor-not-allowed`} title="E-mail não pode ser alterado por aqui" />
              </div>
              <div>
                <label className={labelCls}>Telefone 1</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Telefone 2</label>
                <input type="tel" name="phone2" value={formData.phone2} onChange={handleChange} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Profissão</label>
                <input type="text" name="profession" value={formData.profession} onChange={handleChange} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tipo de Documento</label>
                <select name="doc_type" value={formData.doc_type} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
                  <option value="CPF">CPF</option>
                  <option value="RG">RG</option>
                  <option value="CNH">CNH</option>
                  <option value="Passaporte">Passaporte</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Número do Documento</label>
                <input type="text" name="doc_number" value={formData.doc_number} onChange={handleChange} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Estado Civil</label>
                <select name="civil_status" value={formData.civil_status} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
                  <option value="Solteiro(a)">Solteiro(a)</option>
                  <option value="Casado(a)">Casado(a)</option>
                  <option value="Separado(a)">Separado(a)</option>
                  <option value="Divorciado(a)">Divorciado(a)</option>
                  <option value="Viúvo(a)">Viúvo(a)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
              <MapPin size={16} /> 2. Endereço Completo
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>CEP</label>
                <input type="text" name="zip_code" value={formData.zip_code} onChange={handleChange} className={inputCls} placeholder="00000-000" />
              </div>
              <div className="sm:col-span-4">
                <label className={labelCls}>Rua / Logradouro</label>
                <input type="text" name="street" value={formData.street} onChange={handleChange} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Número</label>
                <input type="text" name="number" value={formData.number} onChange={handleChange} className={inputCls} />
              </div>
              <div className="sm:col-span-4">
                <label className={labelCls}>Complemento</label>
                <input type="text" name="complement" value={formData.complement} onChange={handleChange} className={inputCls} placeholder="Apto, Bloco, etc." />
              </div>
              <div className="sm:col-span-3">
                <label className={labelCls}>Bairro</label>
                <input type="text" name="neighborhood" value={formData.neighborhood} onChange={handleChange} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Cidade</label>
                <input type="text" name="city" value={formData.city} onChange={handleChange} className={inputCls} />
              </div>
              <div className="sm:col-span-1">
                <label className={labelCls}>UF</label>
                <input type="text" name="state" value={formData.state} onChange={handleChange} className={inputCls} placeholder="SP" maxLength={2} />
              </div>
            </div>
          </div>

          {/* Documentos */}
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
              <FileText size={16} /> 3. Envio de Documentos
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Clique no botão da câmera para tirar uma foto ou enviar o arquivo correspondente a cada documento.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DOCUMENTS.map((doc) => {
                const isUploaded = documents[doc.key]?.status === 'uploaded';
                return (
                  <div key={doc.key} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isUploaded ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {isUploaded ? <CheckCircle2 size={20} /> : <FileText size={20} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{doc.label}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                          {isUploaded ? 'Documento anexado' : 'Pendente'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        onChange={(e) => handleDocumentCapture(doc.key, e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <button type="button" className={`p-2.5 rounded-xl transition ${isUploaded ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>
                        <Camera size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Botão Salvar Mobile */}
        <div className="mt-8 md:hidden">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white px-5 py-3.5 rounded-xl font-bold hover:bg-indigo-700 transition"
          >
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : (saveSuccess ? <CheckCircle2 size={20} /> : <Save size={20} />)}
            {saveSuccess ? 'Salvo com sucesso!' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
