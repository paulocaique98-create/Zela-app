import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Plus, Edit2, X, Trash2, AlertTriangle, MoreVertical } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

// Modelo 04 (tabela densa estilo painel enterprise) validado com o usuário
// (proposta com 5 layouts, 18/09) -- tabela clássica de admin no desktop
// (cabeçalho fixo, toggle de Ativa/Suspensa direto na linha, menu "⋯" pra
// Editar/Excluir), cards no celular/tablet (tabela não cabe). O modal
// antigo continua existindo só pra CRIAR/EDITAR (formulário grande demais
// pra caber inline). Também migra a tela pra paleta escura do Portal do Dev
// (dev-*), que até então só o menu lateral e a tela de Logs usavam -- essa
// tela ainda estava na paleta clara do app das famílias/escolas, destoando
// do resto do portal.
const AVATAR_PALETTE = ['#818cf8', '#f59e0b', '#34d399', '#fb7185', '#60a5fa', '#c084fc'];
const initials = (name) => (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function DeveloperPanel() {
  const [schools, setSchools] = useState([]);
  const [confirmDeleteSchool, setConfirmDeleteSchool] = useState(null); // { id, name, code }
  const [isDeletingSchool, setIsDeletingSchool] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);

  // Menu "⋯" (Editar/Excluir) aberto na linha/card de qual escola.
  const [openMenuId, setOpenMenuId] = useState(null);

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

  // Flexibilidade de Método Pedagógico — Fase 2 (UI). Ficam FORA de
  // formData de propósito: são só estado de edição da UI (turmas como
  // texto separado por vírgula, label de turma personalizado), nunca
  // devem ser espalhados direto num insert/update do Supabase (colunas
  // reais são pedagogical_method/custom_config/turmas).
  const [pedagogicalMethod, setPedagogicalMethod] = useState('tradicional');
  const [turmasInput, setTurmasInput] = useState('');
  const [customClassLabel, setCustomClassLabel] = useState('');

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
    financeiro: false,
    materias: false,
    frequencia: false
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
      setPedagogicalMethod(school.pedagogical_method || 'tradicional');
      setTurmasInput((school.turmas || []).join(', '));
      setCustomClassLabel(school.custom_config?.terminology?.class || '');
    } else {
      setEditingSchool(null);
      setFormData({
        name: '', cnpj: '', email: '', phone: '', address: '', plan: 'basic', is_active: true, notes: ''
      });
      setFeaturesEnabled(defaultFeatures);
      setLimits(defaultLimits);
      setAdminData({ name: '', email: '', password: '' });
      setPedagogicalMethod('tradicional');
      setTurmasInput('');
      setCustomClassLabel('');
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
      // Turmas: texto "Nido, Kids I, Kids II" -> array, aparadas e sem
      // itens vazios (vírgula sobrando não vira turma "").
      const turmas = turmasInput.split(',').map(t => t.trim()).filter(Boolean);
      const custom_config = customClassLabel.trim()
        ? { terminology: { class: customClassLabel.trim() } }
        : {};
      const pedagogicalFields = { pedagogical_method: pedagogicalMethod, turmas, custom_config };

      if (editingSchool) {
        // Update apenas dados da escola
        const { error } = await supabase
          .from('schools')
          .update({ ...formData, features_enabled: featuresEnabled, limits, ...pedagogicalFields })
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
          .insert([{ ...formData, school_code: schoolCode, features_enabled: featuresEnabled, limits, ...pedagogicalFields }])
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

  // Fecha o menu "⋯" ao clicar fora dele. Checagem por atributo (não por
  // ref) de propósito: a tabela (desktop) e os cards (celular/tablet)
  // ficam os dois montados no DOM ao mesmo tempo (só escondidos por CSS
  // via hidden/md:hidden) -- uma ref única acabava apontando pro dropdown
  // escondido do outro layout, fechando o menu antes do clique em
  // Editar/Excluir registrar.
  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-schools-menu]')) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  return (
    <div className="h-full flex flex-col bg-dev-surface rounded-zela-xl border border-dev-border shadow-sm overflow-hidden">
      {/* Título "Gestão de Escolas" e ícone removidos (o Header do app já
          mostra o nome da tela dinamicamente); só a descrição, direto. */}
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-dev-border shrink-0 flex-wrap">
        <p className="text-dev-text-muted text-small hidden sm:block">{schools.length} escola(s) cadastrada(s)</p>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 bg-dev-primary hover:brightness-110 text-dev-bg font-bold py-2.5 px-4 rounded-zela-md transition shadow-md whitespace-nowrap text-sm shrink-0 ml-auto"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Cadastrar Escola</span>
        </button>
      </div>

      {/* Lista de escolas */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none p-4 sm:p-5">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-dev-text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dev-primary" />
          </div>
        ) : schools.length === 0 ? (
          <div className="h-full flex items-center justify-center text-dev-text-muted text-sm">Nenhuma escola cadastrada.</div>
        ) : (
          <>
            {/* Tabela — desktop */}
            <table className="hidden md:table w-full border-collapse bg-dev-surface border border-dev-border rounded-zela-md overflow-hidden">
              <thead>
                <tr className="bg-dev-surface-high text-left text-[9.5px] font-bold uppercase tracking-wide text-dev-text-muted">
                  <th className="px-4 py-3">Escola</th>
                  <th className="px-4 py-3">Plano</th>
                  <th className="px-4 py-3">Ativa</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school, i) => (
                  <tr key={school.id} className={`border-t border-dev-border hover:bg-dev-primary-container/10 transition ${!school.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0"
                          style={{ background: `${AVATAR_PALETTE[i % AVATAR_PALETTE.length]}22`, color: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                        >
                          {initials(school.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-dev-text truncate">{school.name}</p>
                          <p className="text-[11px] text-dev-text-muted truncate">
                            <span className="font-mono font-bold text-dev-primary bg-dev-primary-container px-1.5 py-0.5 rounded-md mr-1.5">{school.school_code}</span>
                            {school.cnpj || school.email || 'Sem CNPJ'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border ${school.plan === 'pro' ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' : 'bg-dev-surface-high text-dev-text-muted border-dev-border'}`}>
                        {school.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleStatus(school.id, school.is_active)}
                        title={school.is_active ? 'Suspender acesso' : 'Reativar acesso'}
                        className={`relative w-9 h-5 rounded-full transition-colors ${school.is_active ? 'bg-dev-primary' : 'bg-dev-surface-high'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${school.is_active ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      <button
                        data-schools-menu
                        onClick={() => setOpenMenuId(openMenuId === school.id ? null : school.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high transition ml-auto"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenuId === school.id && (
                        <div data-schools-menu className="absolute right-4 top-full mt-1 w-40 bg-dev-surface border border-dev-border rounded-zela-md shadow-lg z-20 py-1">
                          <button
                            onClick={() => { handleOpenModal(school); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-dev-text hover:bg-dev-surface-high transition text-left"
                          >
                            <Edit2 size={13} /> Editar
                          </button>
                          <button
                            onClick={() => { handleDeleteSchool(school.id, school.name, school.school_code); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-error hover:bg-error/10 transition text-left"
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Cards — celular/tablet */}
            <div className="md:hidden flex flex-col gap-2.5">
              {schools.map((school, i) => (
                <div key={school.id} className={`bg-dev-surface border border-dev-border rounded-zela-md p-3.5 relative ${!school.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0"
                        style={{ background: `${AVATAR_PALETTE[i % AVATAR_PALETTE.length]}22`, color: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                      >
                        {initials(school.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-dev-text truncate">{school.name}</p>
                        <span className="font-mono font-bold text-dev-primary bg-dev-primary-container px-1.5 py-0.5 rounded-md text-[10px]">{school.school_code}</span>
                      </div>
                    </div>
                    <button
                      data-schools-menu
                      onClick={() => setOpenMenuId(openMenuId === school.id ? null : school.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high transition shrink-0"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === school.id && (
                      <div data-schools-menu className="absolute right-3 top-12 w-40 bg-dev-surface border border-dev-border rounded-zela-md shadow-lg z-20 py-1">
                        <button
                          onClick={() => { handleOpenModal(school); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-dev-text hover:bg-dev-surface-high transition text-left"
                        >
                          <Edit2 size={13} /> Editar
                        </button>
                        <button
                          onClick={() => { handleDeleteSchool(school.id, school.name, school.school_code); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-error hover:bg-error/10 transition text-left"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-dashed border-dev-border">
                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border ${school.plan === 'pro' ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' : 'bg-dev-surface-high text-dev-text-muted border-dev-border'}`}>
                      {school.plan}
                    </span>
                    <button
                      onClick={() => toggleStatus(school.id, school.is_active)}
                      title={school.is_active ? 'Suspender acesso' : 'Reativar acesso'}
                      className={`relative w-9 h-5 rounded-full transition-colors ${school.is_active ? 'bg-dev-primary' : 'bg-dev-surface-high'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${school.is_active ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal form (criar/editar) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-dev-surface sm:rounded-zela-xl border border-dev-border shadow-2xl w-full h-full sm:w-full sm:h-auto sm:max-w-2xl overflow-hidden sm:max-h-[90vh] flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-dev-border flex justify-between items-center bg-dev-bg shrink-0">
              <h3 className="font-bold text-dev-text text-lg flex items-center gap-2">
                <Building2 size={20} className="text-dev-primary" />
                {editingSchool ? `Editar ${editingSchool.school_code}` : 'Nova Escola Contratante'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-dev-text-muted hover:text-dev-text p-2"><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto scrollbar-none text-dev-text">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Razão Social / Nome da Escola</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">CNPJ</label>
                  <input type="text" value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: e.target.value })} className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none" placeholder="00.000.000/0000-00" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">E-mail da Escola</label>
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
                    className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Telefone</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Plano Contratado</label>
                  <select value={formData.plan} onChange={e => setFormData({ ...formData, plan: e.target.value })} className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none">
                    <option value="basic">Basic (Portaria Simples)</option>
                    <option value="pro">Pro (Reconhecimento Facial)</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Endereço Completo</label>
                  <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Notas Internas da Zela</label>
                  <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none"></textarea>
                </div>

                {/* Método pedagógico — só developer edita (protect_school_pedagogical_columns_trigger) */}
                <div className="md:col-span-2 border-t border-dev-border pt-4 mt-2">
                  <p className="text-xs font-black text-dev-primary uppercase tracking-wider mb-3">Método Pedagógico</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Método</label>
                      <select value={pedagogicalMethod} onChange={e => setPedagogicalMethod(e.target.value)} className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none">
                        <option value="tradicional">Tradicional</option>
                        <option value="montessori">Montessori</option>
                        <option value="personalizado">Personalizado</option>
                      </select>
                    </div>
                    {pedagogicalMethod === 'personalizado' && (
                      <div>
                        <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Nome para "Turma"</label>
                        <input
                          type="text"
                          value={customClassLabel}
                          onChange={e => setCustomClassLabel(e.target.value)}
                          placeholder="Ex: Agrupamento, Ambiente..."
                          className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none"
                        />
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Turmas / Agrupamentos (separados por vírgula)</label>
                      <input
                        type="text"
                        value={turmasInput}
                        onChange={e => setTurmasInput(e.target.value)}
                        placeholder="Ex: Nido, Kids I, Kids II"
                        className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none"
                      />
                      <p className="text-[11px] text-dev-text-muted mt-1">
                        Vazio = a escola usa a lista padrão do sistema até alguém configurar isso aqui.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Responsável da escola — apenas no cadastro */}
                {!editingSchool && (
                  <div className="md:col-span-2">
                    <div className="border-t border-dev-border pt-4 mt-2">
                      <p className="text-xs font-black text-dev-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                        <span className="w-5 h-5 bg-dev-primary-container rounded-full flex items-center justify-center text-[10px]">1</span>
                        Responsável da Escola (Primeiro Acesso)
                      </p>
                      <p className="text-xs text-dev-text-muted mb-3">Este usuário terá o papel de <strong>Administrador</strong> e será o primeiro acesso da escola no sistema.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Nome do Responsável</label>
                          <input
                            type="text"
                            value={adminData.name}
                            onChange={e => setAdminData({ ...adminData, name: e.target.value })}
                            placeholder="Ex: Ana Paula Souza"
                            className="w-full p-2.5 bg-dev-primary-container border border-dev-primary/30 rounded-zela-md focus:ring-2 focus:ring-dev-primary focus:bg-dev-bg outline-none transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">E-mail de Login</label>
                          <input
                            type="email"
                            value={adminData.email}
                            onChange={e => setAdminData({ ...adminData, email: e.target.value })}
                            placeholder="admin@escola.com.br"
                            className="w-full p-2.5 bg-dev-primary-container border border-dev-primary/30 rounded-zela-md focus:ring-2 focus:ring-dev-primary focus:bg-dev-bg outline-none transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Senha de Acesso</label>
                          <input
                            type="password"
                            value={adminData.password}
                            onChange={e => setAdminData({ ...adminData, password: e.target.value })}
                            placeholder="Mínimo 6 caracteres"
                            className="w-full p-2.5 bg-dev-primary-container border border-dev-primary/30 rounded-zela-md focus:ring-2 focus:ring-dev-primary focus:bg-dev-bg outline-none transition"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* MÓDULOS CONTRATADOS */}
              <div className="mt-6 border-t border-dev-border pt-6">
                <h4 className="text-sm font-bold text-dev-text mb-4">Módulos Contratados</h4>
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
                    { id: 'financeiro', label: 'Financeiro', desc: 'Contratos, cobranças e integração com gateway de pagamento (Asaas)' },
                    { id: 'materias', label: 'Matérias/Disciplinas', desc: 'Cadastro de matérias (ou áreas de conhecimento) e associação com turmas' },
                    { id: 'frequencia', label: 'Frequência', desc: 'Chamada letiva por turma/dia, independente do Módulo Pedagógico (Relatórios)' }
                  ].map(mod => (
                    <div key={mod.id} className="flex items-start gap-3 p-3 border border-dev-border rounded-zela-md bg-dev-bg hover:bg-dev-surface-high transition">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-dev-text">{mod.label}</p>
                        <p className="text-xs text-dev-text-muted mt-0.5">{mod.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFeaturesEnabled(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${featuresEnabled[mod.id] ? 'bg-dev-primary' : 'bg-dev-surface-high'}`}
                      >
                        <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${featuresEnabled[mod.id] ? 'translate-x-2' : '-translate-x-2'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* LIMITES DE AUTORIZADOS (matrícula) */}
              <div className="mt-6 border-t border-dev-border pt-6">
                <h4 className="text-sm font-bold text-dev-text mb-1">Limites de Autorizados (Matrícula)</h4>
                <p className="text-xs text-dev-text-muted mb-4">Quantos autorizados de retirada cada responsável pode cadastrar no formulário de matrícula, e quantos autorizados exclusivos de transporte. Básico: 2 por responsável + 1 de transporte (total de 5, com os 2 responsáveis).</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Autorizados por Responsável</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={limits.autorizados_por_responsavel}
                      onChange={e => setLimits(prev => ({ ...prev, autorizados_por_responsavel: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-dev-text-muted uppercase mb-1">Autorizados de Transporte</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={limits.autorizados_transporte}
                      onChange={e => setLimits(prev => ({ ...prev, autorizados_transporte: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full p-2.5 bg-dev-bg border border-dev-border rounded-zela-md focus:ring-2 focus:ring-dev-primary outline-none"
                    />
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="mt-4 p-3 bg-error/10 border border-error/30 rounded-zela-md text-sm text-error font-medium flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {saveError}
                </div>
              )}
              {successMsg && (
                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-zela-md text-sm text-emerald-400 font-medium flex items-start gap-2">
                  {successMsg}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-dev-border">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-dev-text-muted font-bold hover:bg-dev-surface-high rounded-zela-md transition">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 bg-dev-primary hover:brightness-110 text-dev-bg font-bold rounded-zela-md shadow-md transition">
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
