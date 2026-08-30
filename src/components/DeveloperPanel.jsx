import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Search, Plus, Edit2, Power, X, Trash2, AlertTriangle } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function DeveloperPanel() {
  const [schools, setSchools] = useState([]);
  const [confirmDeleteSchool, setConfirmDeleteSchool] = useState(null); // { id, name, code }
  const [isDeletingSchool, setIsDeletingSchool] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    email: '',
    phone: '',
    address: '',
    plan: 'basic',
    is_active: true,
    notes: ''
  });
  const [adminData, setAdminData] = useState({ name: '', email: '', password: '' });
  const [saveError, setSaveError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const defaultFeatures = {
    cadastros: true,
    gerenciamento: true,
    formularios: false,
    checkin: true,
    calendario: false,
    comunicados: false,
    mural: false,
    cardapio: false,
    diario: false,
    chat: false,
    relatorios_pedagogicos: false,
    configuracoes: true,
    financeiro: false
  };

  const [featuresEnabled, setFeaturesEnabled] = useState(defaultFeatures);

  const defaultLimits = { autorizados_por_responsavel: 2, autorizados_transporte: 1 };
  const [limits, setLimits] = useState(defaultLimits);



  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('school_code', { ascending: true });

      if (error) throw error;
      setSchools(data || []);
    } catch (err) {
      console.error('Erro ao buscar escolas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (school = null) => {
    if (school) {
      setEditingSchool(school);
      setFormData({
        name: school.name || '',
        cnpj: school.cnpj || '',
        email: school.email || '',
        phone: school.phone || '',
        address: school.address || '',
        plan: school.plan || 'basic',
        is_active: school.is_active,
        notes: school.notes || ''
      });
      setFeaturesEnabled({ ...defaultFeatures, ...school.features_enabled });
      setLimits({ ...defaultLimits, ...school.limits });
    } else {
      setEditingSchool(null);
      setFormData({
        name: '', cnpj: '', email: '', phone: '', address: '', plan: 'basic', is_active: true, notes: ''
      });
      setFeaturesEnabled(defaultFeatures);
      setLimits(defaultLimits);
      setAdminData({ name: '', email: '', password: '' });
      setSaveError('');
      setSuccessMsg('');
    }
    setIsModalOpen(true);
  };

  const generateSchoolCode = async () => {
    try {
      // Get the highest ZLxxx code
      const { data, error } = await supabase
        .from('schools')
        .select('school_code')
        .like('school_code', 'ZL%')
        .order('school_code', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNum = 1;
      if (data && data.length > 0) {
        const lastCode = data[0].school_code;
        const lastNum = parseInt(lastCode.substring(2));
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }

      return `ZL${nextNum.toString().padStart(3, '0')}`;
    } catch (err) {
      console.error('Erro ao gerar código:', err);
      return `ZL${Math.floor(Math.random() * 900) + 100}`;
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSuccessMsg('');
    try {
      if (editingSchool) {
        // Update apenas dados da escola
        const { error } = await supabase
          .from('schools')
          .update({ ...formData, features_enabled: featuresEnabled, limits })
          .eq('id', editingSchool.id);

        if (error) throw error;
      } else {
        // 1. Validar dados do administrador
        if (!adminData.name.trim() || !adminData.email.trim() || !adminData.password.trim()) {
          setSaveError('Preencha o nome, e-mail e senha do responsável da escola.');
          return;
        }
        if (adminData.password.length < 6) {
          setSaveError('A senha do responsável deve ter no mínimo 6 caracteres.');
          return;
        }

        // 2. Criar a escola
        const schoolCode = await generateSchoolCode();
        const { data: newSchool, error: schoolError } = await supabase
          .from('schools')
          .insert([{ ...formData, school_code: schoolCode, features_enabled: featuresEnabled, limits }])
          .select()
          .single();

        if (schoolError) throw schoolError;

        // 3. Criar o usuário admin de forma segura via Edge Function
        const { data: newUser, error: funcError } = await supabase.functions.invoke('create-admin-user', {
          body: {
            email: adminData.email.trim().toLowerCase(),
            password: adminData.password,
            name: adminData.name.trim(),
            role: 'admin',
            school_id: newSchool.id,
            extra_fields: { is_primary_admin: true, chat_visibilidade_total: true }
          }
        });

        if (funcError || !newUser || newUser.error) {
          const errMsg = (funcError?.message || newUser?.error || 'Erro ao criar admin');
          if (errMsg.includes('already registered')) throw new Error('Este e-mail de administrador já está em uso.');
          throw new Error(errMsg);
        }
      }
      setSuccessMsg('Escola criada com sucesso!');
      fetchSchools();
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMsg('');
      }, 2000);
    } catch (err) {
      console.error('Erro ao salvar escola:', err);
      setSaveError(err.message || 'Erro ao salvar dados da escola.');
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      const { error } = await supabase
        .from('schools')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      fetchSchools();
    } catch (err) {
      console.error('Erro ao alterar status:', err);
    }
  };

  const handleDeleteSchool = (id, name, code) => setConfirmDeleteSchool({ id, name, code });

  const confirmDeleteSchoolAction = async () => {
    const { id, name } = confirmDeleteSchool;
    setIsDeletingSchool(true);
    try {
      // Chama a função especial RPC para apagar os logins (auth.users) e depois a escola.
      const { error } = await supabase.rpc('delete_school_and_users', { target_school_id: id });
      if (error) throw error;

      fetchSchools();
      alert(`Escola ${name} excluída com sucesso.`);
    } catch (err) {
      console.error(err);
      alert(`Erro ao excluir escola: ${err.message}`);
    } finally {
      setIsDeletingSchool(false);
      setConfirmDeleteSchool(null);
    }
  };

  const filteredSchools = schools.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.school_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.cnpj && s.cnpj.includes(searchTerm))
  );

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-surface-container-low p-4 rounded-zela-md border border-outline-variant shrink-0 mb-4">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, código ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary transition text-sm"
          />
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-white font-bold py-2 px-6 rounded-zela-md transition shadow-md whitespace-nowrap text-sm"
        >
          <Plus size={16} /> Cadastrar Escola
        </button>
      </div>

      {/* Body: Cards (mobile) / Table (desktop) + Global Logo Config */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-zela-lg shadow-sm border border-outline-variant py-12 text-center text-on-surface-variant">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
            Carregando tenants...
          </div>
        ) : filteredSchools.length === 0 ? (
          <div className="bg-white rounded-zela-lg shadow-sm border border-outline-variant py-12 text-center text-on-surface-variant">
            Nenhuma escola encontrada.
          </div>
        ) : (
          <>
            {/* CARDS — mobile/tablet: nenhuma coluna escondida atrás de scroll horizontal */}
            <div className="md:hidden space-y-3">
              {filteredSchools.map((school) => (
                <div key={school.id} className={`bg-white rounded-zela-lg shadow-sm border border-outline-variant p-4 ${!school.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded-md text-xs border border-primary/10">
                        {school.school_code}
                      </span>
                      <p className="font-bold text-on-surface mt-2">{school.name}</p>
                      <p className="text-xs text-on-surface-variant truncate">{school.cnpj || 'Sem CNPJ'} • {school.email}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${school.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${school.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      {school.is_active ? 'Ativa' : 'Suspensa'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-outline-variant/60">
                    <span className={`text-xs font-black uppercase px-2 py-1 rounded-md border ${school.plan === 'pro' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
                      {school.plan}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleOpenModal(school)} className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition" title="Editar escola">
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => toggleStatus(school.id, school.is_active)}
                        className={`p-2 rounded-lg transition ${school.is_active ? 'text-on-surface-variant/70 hover:text-amber-600 hover:bg-amber-50' : 'text-on-surface-variant/70 hover:text-green-600 hover:bg-green-50'}`}
                        title={school.is_active ? 'Suspender acesso' : 'Reativar acesso'}
                      >
                        <Power size={18} />
                      </button>
                      <button onClick={() => handleDeleteSchool(school.id, school.name, school.school_code)} className="p-2 text-on-surface-variant/70 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Excluir escola permanentemente">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* TABELA — desktop */}
            <div className="hidden md:block bg-white rounded-zela-lg shadow-sm border border-outline-variant overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant text-xs uppercase tracking-wider font-bold">
                      <th className="px-6 py-4">Código</th>
                      <th className="px-6 py-4">Escola / Empresa</th>
                      <th className="px-6 py-4">Plano</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {filteredSchools.map((school) => (
                      <tr key={school.id} className={`hover:bg-surface-container-low transition ${!school.is_active ? 'opacity-60 bg-surface-container-low' : ''}`}>
                        <td className="px-6 py-4">
                          <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded-md text-sm border border-primary/10">
                            {school.school_code}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-on-surface">{school.name}</p>
                          <p className="text-xs text-on-surface-variant">{school.cnpj || 'Sem CNPJ'} • {school.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-black uppercase px-2 py-1 rounded-md border ${school.plan === 'pro' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                              'bg-surface-container text-on-surface-variant border-outline-variant'
                            }`}>
                            {school.plan}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${school.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${school.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {school.is_active ? 'Ativa' : 'Suspensa'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenModal(school)}
                              className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                              title="Editar escola"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => toggleStatus(school.id, school.is_active)}
                              className={`p-2 rounded-lg transition ${school.is_active
                                  ? 'text-on-surface-variant/70 hover:text-amber-600 hover:bg-amber-50'
                                  : 'text-on-surface-variant/70 hover:text-green-600 hover:bg-green-50'
                                }`}
                              title={school.is_active ? "Suspender acesso" : "Reativar acesso"}
                            >
                              <Power size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteSchool(school.id, school.name, school.school_code)}
                              className="p-2 text-on-surface-variant/70 hover:text-red-600 hover:bg-red-50 rounded-lg transition ml-2"
                              title="Excluir escola permanentemente"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white sm:rounded-zela-xl shadow-2xl w-full h-full sm:w-full sm:h-auto sm:max-w-2xl overflow-hidden sm:max-h-[90vh] flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low shrink-0">
              <h3 className="font-bold text-on-surface text-lg flex items-center gap-2">
                <Building2 size={20} className="text-primary" />
                {editingSchool ? `Editar ${editingSchool.school_code}` : 'Nova Escola Contratante'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant/70 hover:text-on-surface-variant p-2"><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Razão Social / Nome da Escola</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">CNPJ</label>
                  <input type="text" value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: e.target.value })} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary" placeholder="00.000.000/0000-00" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">E-mail da Escola</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => {
                      const newEmail = e.target.value;
                      setFormData({ ...formData, email: newEmail });
                      // Auto-preenche o email de login do admin se ainda não foi editado manualmente
                      if (!editingSchool && (adminData.email === '' || adminData.email === formData.email)) {
                        setAdminData(prev => ({ ...prev, email: newEmail }));
                      }
                    }}
                    className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Telefone</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Plano Contratado</label>
                  <select value={formData.plan} onChange={e => setFormData({ ...formData, plan: e.target.value })} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-white">
                    <option value="basic">Basic (Portaria Simples)</option>
                    <option value="pro">Pro (Reconhecimento Facial)</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Endereço Completo</label>
                  <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Notas Internas da Zela</label>
                  <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary"></textarea>
                </div>

                {/* Responsável da escola — apenas no cadastro */}
                {!editingSchool && (
                  <div className="md:col-span-2">
                    <div className="border-t border-outline-variant pt-4 mt-2">
                      <p className="text-xs font-black text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                        <span className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-[10px]">1</span>
                        Responsável da Escola (Primeiro Acesso)
                      </p>
                      <p className="text-xs text-on-surface-variant mb-3">Este usuário terá o papel de <strong>Administrador</strong> e será o primeiro acesso da escola no sistema.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Nome do Responsável</label>
                          <input
                            type="text"
                            value={adminData.name}
                            onChange={e => setAdminData({ ...adminData, name: e.target.value })}
                            placeholder="Ex: Ana Paula Souza"
                            className="w-full p-2.5 border border-primary/20 bg-primary/10 rounded-zela-md focus:ring-2 focus:ring-primary focus:bg-white transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">E-mail de Login</label>
                          <input
                            type="email"
                            value={adminData.email}
                            onChange={e => setAdminData({ ...adminData, email: e.target.value })}
                            placeholder="admin@escola.com.br"
                            className="w-full p-2.5 border border-primary/20 bg-primary/10 rounded-zela-md focus:ring-2 focus:ring-primary focus:bg-white transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Senha de Acesso</label>
                          <input
                            type="password"
                            value={adminData.password}
                            onChange={e => setAdminData({ ...adminData, password: e.target.value })}
                            placeholder="Mínimo 6 caracteres"
                            className="w-full p-2.5 border border-primary/20 bg-primary/10 rounded-zela-md focus:ring-2 focus:ring-primary focus:bg-white transition"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* MÓDULOS CONTRATADOS */}
              <div className="mt-6 border-t border-outline-variant pt-6">
                <h4 className="text-sm font-bold text-on-surface mb-4">Módulos Contratados</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: 'cadastros', label: 'Cadastros', desc: 'Cadastro de usuários, comunicados e funcionários' },
                    { id: 'gerenciamento', label: 'Gerenciamento', desc: 'Gestão de usuários, alunos e funcionários' },
                    { id: 'formularios', label: 'Formulários', desc: 'Matrículas e fichas médicas' },
                    { id: 'checkin', label: 'Check-in/out', desc: 'Monitor, autoatendimento, presença e histórico' },
                    { id: 'calendario', label: 'Calendário Escolar', desc: 'Eventos e datas do ano letivo' },
                    { id: 'comunicados', label: 'Comunicados', desc: 'Envio e visualização de comunicados' },
                    { id: 'mural', label: 'Mural de Fotos', desc: 'Fotos por turma' },
                    { id: 'cardapio', label: 'Cardápio', desc: 'Cardápio semanal da escola' },
                    { id: 'diario', label: 'Diário', desc: 'Registro diário de refeições, sono e evacuação por aluno' },
                    { id: 'chat', label: 'Chat', desc: 'Chat interno por setor (Administrativo, Diretoria, Coordenação, Recepção e Suporte Zela)' },
                    { id: 'relatorios_pedagogicos', label: 'Módulo Pedagógico', desc: 'Portal do Professor: registros pedagógicos e relatórios de desenvolvimento' },
                    { id: 'configuracoes', label: 'Configurações', desc: 'Acesso às configurações do portal' },
                    { id: 'financeiro', label: 'Financeiro', desc: 'Contratos, cobranças e integração com gateway de pagamento (Asaas)' }
                  ].map(mod => (
                    <div key={mod.id} className="flex items-start gap-3 p-3 border border-outline-variant rounded-zela-md bg-white hover:bg-surface-container-low transition">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-on-surface">{mod.label}</p>
                        <p className="text-xs text-on-surface-variant/70 mt-0.5">{mod.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFeaturesEnabled(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${featuresEnabled[mod.id] ? 'bg-primary' : 'bg-slate-200'}`}
                      >
                        <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${featuresEnabled[mod.id] ? 'translate-x-2' : '-translate-x-2'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* LIMITES DE AUTORIZADOS (matrícula) */}
              <div className="mt-6 border-t border-outline-variant pt-6">
                <h4 className="text-sm font-bold text-on-surface mb-1">Limites de Autorizados (Matrícula)</h4>
                <p className="text-xs text-on-surface-variant/70 mb-4">Quantos autorizados de retirada cada responsável pode cadastrar no formulário de matrícula, e quantos autorizados exclusivos de transporte. Básico: 2 por responsável + 1 de transporte (total de 5, com os 2 responsáveis).</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Autorizados por Responsável</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={limits.autorizados_por_responsavel}
                      onChange={e => setLimits(prev => ({ ...prev, autorizados_por_responsavel: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Autorizados de Transporte</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={limits.autorizados_transporte}
                      onChange={e => setLimits(prev => ({ ...prev, autorizados_transporte: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-zela-md text-sm text-red-700 font-medium flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {saveError}
                </div>
              )}
              {successMsg && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-zela-md text-sm text-green-700 font-medium flex items-start gap-2">
                  {successMsg}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-outline-variant">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-on-surface-variant font-bold hover:bg-surface-container rounded-zela-md transition">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md shadow-md transition">
                  {editingSchool ? 'Salvar Alterações' : 'Criar Escola + Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteSchool && (
        <ConfirmModal
          title="Excluir escola"
          message={`ATENÇÃO: Você está prestes a excluir a escola ${confirmDeleteSchool.name} (${confirmDeleteSchool.code}). Isso apagará permanentemente todos os alunos, responsáveis e históricos vinculados a ela.`}
          requireText="CONFIRMAR"
          isLoading={isDeletingSchool}
          onConfirm={confirmDeleteSchoolAction}
          onCancel={() => setConfirmDeleteSchool(null)}
        />
      )}
    </div>
  );
}
