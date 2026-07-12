import React, { useState, useEffect } from 'react';
import { supabase, supabaseAuthHelper } from '../lib/supabase';
import { Building2, Search, Plus, Edit2, Power, ShieldAlert, X, Trash2, AlertTriangle } from 'lucide-react';

export default function DeveloperPanel({ currentUser, onUpdateGlobalLogo }) {
  const [schools, setSchools] = useState([]);
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

  const [zelaGlobalLogo, setZelaGlobalLogo] = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');

  // Carrega a logo global do banco ao montar o painel
  useEffect(() => {
    const fetchLogo = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'global_logo')
        .maybeSingle();
      if (data) setZelaGlobalLogo(data.value);
    };
    fetchLogo();
  }, []);

  const handleSaveGlobalLogo = async () => {
    setLogoSaving(true);
    setLogoMsg('');
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'global_logo', value: zelaGlobalLogo || '' }, { onConflict: 'key' });
      if (error) throw error;
      setLogoMsg('Logo salva com sucesso!');
      if (onUpdateGlobalLogo) onUpdateGlobalLogo(); // Atualiza o header reativamente
    } catch (e) {
      setLogoMsg('Erro ao salvar: ' + e.message);
    } finally {
      setLogoSaving(false);
      setTimeout(() => setLogoMsg(''), 3000);
    }
  };

  const handleGlobalFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setZelaGlobalLogo(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

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
    } else {
      setEditingSchool(null);
      setFormData({
        name: '', cnpj: '', email: '', phone: '', address: '', plan: 'basic', is_active: true, notes: ''
      });
      setAdminData({ name: '', email: '', password: '' });
      setSaveError('');
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
    try {
      if (editingSchool) {
        // Update apenas dados da escola
        const { error } = await supabase
          .from('schools')
          .update(formData)
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
          .insert([{ ...formData, school_code: schoolCode }])
          .select()
          .single();

        if (schoolError) throw schoolError;

        // 3. Criar o usuário admin no Supabase Auth usando o helper
        const { data: authData, error: authError } = await supabaseAuthHelper.auth.signUp({
          email: adminData.email.trim().toLowerCase(),
          password: adminData.password,
          options: {
            data: {
              name: adminData.name.trim(),
              role: 'admin',
              school_id: newSchool.id
            }
          }
        });

        if (authError) throw authError;

        const authUser = authData.user;
        if (!authUser) throw new Error('Erro ao criar usuário admin no sistema de autenticação.');

        // 4. Criar o usuário admin na tabela pública com o ID da Auth
        const { error: userError } = await supabase
          .from('users')
          .insert([{
            id: authUser.id,
            name: adminData.name.trim(),
            email: adminData.email.trim().toLowerCase(),
            password: '', // Não salvar em texto plano
            role: 'admin',
            school_id: newSchool.id
          }]);

        if (userError) {
          // Escola criada mas user falhou — reportar
          if (userError.code === '23505') throw new Error('Este e-mail já está em uso. Escola criada, mas o usuário admin não foi criado.');
          throw userError;
        }
      }

      setIsModalOpen(false);
      fetchSchools();
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

  const handleDeleteSchool = async (id, name, code) => {
    const confirmMsg = `ATENÇÃO: Você está prestes a excluir a escola ${name} (${code}).\n\nIsso apagará permanentemente todos os alunos, responsáveis, totens e históricos vinculados a ela.\n\nDigite CONFIRMAR para prosseguir:`;
    if (prompt(confirmMsg) !== 'CONFIRMAR') {
      return;
    }

    try {
      // Chama a função especial RPC para apagar os logins (auth.users) e depois a escola.
      const { error } = await supabase.rpc('delete_school_and_users', { target_school_id: id });
      if (error) throw error;

      fetchSchools();
      alert(`Escola ${name} excluída com sucesso.`);
    } catch (err) {
      console.error(err);
      alert(`Erro ao excluir escola: ${err.message}`);
    }
  };

  const filteredSchools = schools.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.school_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.cnpj && s.cnpj.includes(searchTerm))
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert className="text-indigo-400 h-8 w-8" />
            <h1 className="text-3xl font-black tracking-tight">Zela Master Control</h1>
          </div>
          <p className="text-slate-400 font-medium max-w-xl">
            Painel de administração exclusivo da desenvolvedora. Gerencie tenants, ative novos clientes e monitore a infraestrutura.
          </p>
        </div>
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
          <Building2 size={300} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome, código ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-sm"
          />
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition shadow-md whitespace-nowrap"
        >
          <Plus size={18} /> Cadastrar Escola
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Escola / Empresa</th>
                <th className="px-6 py-4">Plano</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                    Carregando tenants...
                  </td>
                </tr>
              ) : filteredSchools.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    Nenhuma escola encontrada.
                  </td>
                </tr>
              ) : (
                filteredSchools.map((school) => (
                  <tr key={school.id} className={`hover:bg-slate-50 transition ${!school.is_active ? 'opacity-60 bg-slate-50' : ''}`}>
                    <td className="px-6 py-4">
                      <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md text-sm border border-indigo-100">
                        {school.school_code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-800">{school.name}</p>
                      <p className="text-xs text-slate-500">{school.cnpj || 'Sem CNPJ'} • {school.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-black uppercase px-2 py-1 rounded-md border ${school.plan === 'pro' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
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
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Editar escola"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => toggleStatus(school.id, school.is_active)}
                          className={`p-2 rounded-lg transition ${school.is_active
                              ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                              : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                          title={school.is_active ? "Suspender acesso" : "Reativar acesso"}
                        >
                          <Power size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteSchool(school.id, school.name, school.school_code)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition ml-2"
                          title="Excluir escola permanentemente"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Building2 size={20} className="text-indigo-600" />
                {editingSchool ? `Editar ${editingSchool.school_code}` : 'Nova Escola Contratante'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Razão Social / Nome da Escola</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CNPJ</label>
                  <input type="text" value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500" placeholder="00.000.000/0000-00" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail da Escola</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Plano Contratado</label>
                  <select value={formData.plan} onChange={e => setFormData({ ...formData, plan: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="basic">Basic (Portaria Simples)</option>
                    <option value="pro">Pro (Reconhecimento Facial)</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Endereço Completo</label>
                  <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas Internas da Zela</label>
                  <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"></textarea>
                </div>

                {/* Responsável da escola — apenas no cadastro */}
                {!editingSchool && (
                  <div className="md:col-span-2">
                    <div className="border-t border-slate-100 pt-4 mt-2">
                      <p className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-1 flex items-center gap-2">
                        <span className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-[10px]">1</span>
                        Responsável da Escola (Primeiro Acesso)
                      </p>
                      <p className="text-xs text-slate-500 mb-3">Este usuário terá o papel de <strong>Administrador</strong> e será o primeiro acesso da escola no sistema.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome do Responsável</label>
                          <input
                            type="text"
                            value={adminData.name}
                            onChange={e => setAdminData({ ...adminData, name: e.target.value })}
                            placeholder="Ex: Ana Paula Souza"
                            className="w-full p-2.5 border border-indigo-200 bg-indigo-50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail de Login</label>
                          <input
                            type="email"
                            value={adminData.email}
                            onChange={e => setAdminData({ ...adminData, email: e.target.value })}
                            placeholder="admin@escola.com.br"
                            className="w-full p-2.5 border border-indigo-200 bg-indigo-50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Senha de Acesso</label>
                          <input
                            type="password"
                            value={adminData.password}
                            onChange={e => setAdminData({ ...adminData, password: e.target.value })}
                            placeholder="Mínimo 6 caracteres"
                            className="w-full p-2.5 border border-indigo-200 bg-indigo-50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {saveError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {saveError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition">
                  {editingSchool ? 'Salvar Alterações' : 'Criar Escola + Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL LOGO CONFIG */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-2">
            {zelaGlobalLogo ? (
              <img src={zelaGlobalLogo} alt="Global Logo" className="w-full h-full object-contain" />
            ) : (
              <ShieldAlert className="text-slate-400" size={32} />
            )}
          </div>
          <div className="flex-1 w-full space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Logo Global (Zela Portal)</h3>
            <p className="text-xs text-slate-500">Selecione uma imagem (PNG, JPG) para alterar a logo no cabeçalho do sistema.</p>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleGlobalFileChange}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-xs file:font-bold
                  file:bg-indigo-50 file:text-indigo-700
                  hover:file:bg-indigo-100 cursor-pointer"
              />
              {zelaGlobalLogo && (
                <button
                  onClick={() => setZelaGlobalLogo('')}
                  className="px-3 text-red-500 text-xs font-bold hover:bg-red-50 rounded-xl transition h-9"
                >
                  Remover
                </button>
              )}
              <button
                onClick={handleSaveGlobalLogo}
                disabled={logoSaving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-lg transition text-xs whitespace-nowrap h-9"
              >
                {logoSaving ? 'Salvando...' : 'Salvar Logo'}
              </button>
            </div>
            {logoMsg && (
              <p className={`text-xs font-medium mt-1 ${logoMsg.startsWith('Erro') ? 'text-red-600' : 'text-green-600'}`}>{logoMsg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
