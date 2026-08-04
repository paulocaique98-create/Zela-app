import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Plus, Trash2, CheckCircle2, Users, Baby, Clock, KeyRound, X, GraduationCap } from 'lucide-react';
import { supabase, supabaseAuthHelper } from '../lib/supabase';
import { TURMAS } from '../lib/constants';

// ──────────────────────────────────────────────────────────
// Dados de Ciclo / Turno / Período
// ──────────────────────────────────────────────────────────
const CICLOS = [6, 8, 10]; // horas contratadas

const TURNOS_POR_CICLO = {
  6: ['Matutino', 'Vespertino'],
  8: ['Matutino', 'Vespertino'],
  10: ['Matutino', 'Vespertino'],
};

const PERIODOS_POR_CICLO_TURNO = {
  6: {
    Matutino: ['07:00 às 13:00'],
    Vespertino: ['13:00 às 19:00'],
  },
  8: {
    Matutino: ['07:00 às 15:00'],
    Vespertino: ['11:00 às 19:00', '13:00 às 19:00'],
  },
  10: {
    Matutino: ['07:00 às 17:00', '09:00 às 19:00'],
  },
};

const DOC_TYPES = ['CPF', 'RG', 'CNH', 'Passaporte'];
const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Separado(a)', 'Divorciado(a)', 'Viúvo(a)'];

// ──────────────────────────────────────────────────────────
// Estado inicial de um aluno em branco
// ──────────────────────────────────────────────────────────
const emptyStudent = () => ({
  id: Date.now() + Math.random(),
  name: '',
  birth_date: '',
  turma: '',
  ciclo: '',
  turno: '',
  periodo: '',
  custom_entry: '',
  custom_exit: '',
  is_custom_period: false,
});

// ──────────────────────────────────────────────────────────
// Sub-componente: card de aluno
// ──────────────────────────────────────────────────────────
function StudentCard({ student, index, onChange, onRemove, canRemove }) {
  const turnos = student.ciclo ? TURNOS_POR_CICLO[Number(student.ciclo)] || [] : [];
  const periodos = (student.ciclo && student.turno)
    ? PERIODOS_POR_CICLO_TURNO[Number(student.ciclo)]?.[student.turno] || []
    : [];

  const set = (field, value) => {
    let patch = { [field]: value };
    if (field === 'ciclo') patch = { ...patch, turno: '', periodo: '', is_custom_period: false, custom_entry: '', custom_exit: '' };
    if (field === 'turno') patch = { ...patch, periodo: '', is_custom_period: false, custom_entry: '', custom_exit: '' };
    if (field === 'periodo') patch = { ...patch, is_custom_period: value === '__custom__', custom_entry: '', custom_exit: '' };
    onChange(student.id, patch);
  };

  const inputCls = 'w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm';
  const labelCls = 'block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wide';

  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
          <Baby size={14} /> Aluno {index + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={() => onRemove(student.id)}
            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Nome + Data Nasc */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nome Completo *</label>
          <input type="text" required value={student.name}
            onChange={e => set('name', e.target.value)}
            className={inputCls} placeholder="Nome do aluno" />
        </div>
        <div>
          <label className={labelCls}>Data de Nascimento *</label>
          <input type="date" required value={student.birth_date}
            onChange={e => set('birth_date', e.target.value)}
            className={inputCls} />
        </div>
      </div>

      {/* Turma + Ciclo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Turma / Ano *</label>
          <select required value={student.turma} onChange={e => set('turma', e.target.value)} className={inputCls}>
            <option value="">Selecione...</option>
            {TURMAS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Ciclo Contratado *</label>
          <select required value={student.ciclo} onChange={e => set('ciclo', e.target.value)} className={inputCls}>
            <option value="">Selecione...</option>
            {CICLOS.map(c => <option key={c} value={c}>{c} Horas</option>)}
          </select>
        </div>
      </div>

      {/* Turno + Período */}
      {student.ciclo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Turno *</label>
            <select required value={student.turno} onChange={e => set('turno', e.target.value)} className={inputCls}>
              <option value="">Selecione...</option>
              {turnos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {student.turno && (
            <div>
              <label className={labelCls}>Período *</label>
              <select required value={student.periodo} onChange={e => set('periodo', e.target.value)} className={inputCls}>
                <option value="">Selecione o horário...</option>
                {periodos.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="__custom__">Outro (Personalizado)</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Horário Personalizado */}
      {student.is_custom_period && (
        <div className="grid grid-cols-2 gap-3 mt-2 p-3 bg-white rounded-xl border border-indigo-100">
          <div>
            <label className={labelCls}>Entrada *</label>
            <input type="time" required value={student.custom_entry}
              onChange={e => set('custom_entry', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Saída *</label>
            <input type="time" required value={student.custom_exit}
              onChange={e => set('custom_exit', e.target.value)} className={inputCls} />
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL (Modal de Cadastro)
// ──────────────────────────────────────────────────────────
export default function AdminUserRegistration({ currentUser, editingUser, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('primary'); // 'primary' | 'secondary'

  const defaultForm = {
    name: '', email: '', password: '', phone1: '', phone2: '', doc_type: 'CPF', doc_number: '', profession: '', civil_status: '', role: 'family'
  };

  const [primaryFormData, setPrimaryFormData] = useState(defaultForm);
  const [secondaryFormData, setSecondaryFormData] = useState(defaultForm);
  
  // Guardamos o ID do secundário, se existir, para fazer o UPDATE em vez de INSERT.
  const [secondaryUserId, setSecondaryUserId] = useState(null);
  const [primaryUserId, setPrimaryUserId] = useState(editingUser ? editingUser.id : null);

  // Computed state para facilitar a exibição
  const formData = activeTab === 'primary' ? primaryFormData : secondaryFormData;
  
  const setFormData = (updater) => {
    if (typeof updater === 'function') {
      activeTab === 'primary' ? setPrimaryFormData(updater) : setSecondaryFormData(updater);
    } else {
      activeTab === 'primary' ? setPrimaryFormData(updater) : setSecondaryFormData(updater);
    }
  };

  // Titular = 'Responsável Financeiro', Secundário = 'Responsável'
  const guardianType = activeTab === 'primary' ? 'Responsável Financeiro' : 'Responsável';

  const [students, setStudents] = useState([emptyStudent()]);
  const [resetSent, setResetSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleCloseModal = () => {
    setActiveTab('primary');
    setPrimaryFormData(defaultForm);
    setSecondaryFormData(defaultForm);
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(false);
    setPrimaryUserId(editingUser ? editingUser.id : null);
    onClose();
  };


  // Carrega os dados quando o modal abre (modo de edição)
  useEffect(() => {
    if (editingUser) {
      setPrimaryFormData({
        name: editingUser.name || '',
        email: editingUser.email || '',
        password: '',
        phone1: editingUser.phone || '',
        phone2: editingUser.phone2 || '',
        doc_type: editingUser.doc_type || 'CPF',
        doc_number: editingUser.doc_number || '',
        profession: editingUser.profession || '',
        civil_status: editingUser.civil_status || '',
        role: editingUser.role || 'family',
      });

      if (editingUser.role === 'family') {
        // Busca o usuário secundário cujo linked_family_id é o ID do titular (editingUser.id)
        supabase
          .from('users')
          .select('*')
          .eq('linked_family_id', editingUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setSecondaryUserId(data.id);
              setSecondaryFormData({
                name: data.name || '',
                email: data.email || '',
                password: '',
                phone1: data.phone || '',
                phone2: data.phone2 || '',
                doc_type: data.doc_type || 'CPF',
                doc_number: data.doc_number || '',
                profession: data.profession || '',
                civil_status: data.civil_status || '',
                role: 'family',
              });
            } else {
              setSecondaryUserId(null);
              setSecondaryFormData(defaultForm);
            }
          });
      }

      if (editingUser.students && editingUser.students.length > 0) {
        const loadedStudents = editingUser.students.map(s => {
          let custom_entry = '';
          let custom_exit = '';
          let is_custom_period = false;
          let periodo = s.periodo || '';

          const ciclo = s.contracted_hours ? String(s.contracted_hours) : '';
          const turno = s.turno || '';
          const predefinedPeriodos = (ciclo && turno) ? PERIODOS_POR_CICLO_TURNO[Number(ciclo)]?.[turno] || [] : [];

          if (periodo && !predefinedPeriodos.includes(periodo)) {
            is_custom_period = true;
            if (periodo.includes(' às ')) {
              const parts = periodo.split(' às ');
              custom_entry = parts[0];
              custom_exit = parts[1];
              periodo = '__custom__';
            }
          }

          return {
            id: s.id,
            name: s.name || '',
            birth_date: s.birth_date || '',
            turma: s.turma || '',
            ciclo: ciclo,
            turno: turno,
            periodo: periodo,
            custom_entry: custom_entry,
            custom_exit: custom_exit,
            is_custom_period: is_custom_period,
          };
        });
        setStudents(loadedStudents);
      } else {
        setStudents([emptyStudent()]);
      }
    } else {
      setStudents([emptyStudent()]);
      setPrimaryFormData(defaultForm);
      setSecondaryFormData(defaultForm);
      setSecondaryUserId(null);
      setActiveTab('primary');
    }
  }, [editingUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (activeTab === 'primary') {
        if (editingUser) {
          // 1. Atualizar usuário titular existente
          const { error: userError } = await supabase
            .from('users')
            .update({
              name: primaryFormData.name,
              email: primaryFormData.email.trim().toLowerCase(),
              phone: primaryFormData.phone1,
              role: primaryFormData.role,
              phone2: primaryFormData.phone2 || null,
              doc_type: primaryFormData.doc_type || null,
              doc_number: primaryFormData.doc_number || null,
              profession: primaryFormData.profession || null,
              civil_status: primaryFormData.civil_status || null,
              guardian_type: 'Responsável Financeiro',
              linked_family_id: null
            })
            .eq('id', editingUser.id);

          if (userError) {
            if (userError.code === '23505') throw new Error('Este e-mail já está em uso por outro usuário.');
            throw userError;
          }

          // Atualizar alunos vinculados (Apenas no titular)
          if (primaryFormData.role === 'family') {
            const existingStudentIds = (editingUser.students || []).map(s => s.id);
            const currentStudentIds = students.map(s => s.id);

            const removedStudentIds = existingStudentIds.filter(id => !currentStudentIds.includes(id));
            if (removedStudentIds.length > 0) {
              const { error: delErr } = await supabase.from('students').delete().in('id', removedStudentIds);
              if (delErr) throw delErr;
            }

            for (const s of students) {
              if (!s.name.trim()) continue;

              const periodStr = s.is_custom_period
                ? `${s.custom_entry} às ${s.custom_exit}`
                : s.periodo;

              const PERIODO_HORARIOS = {
                '07:00 às 13:00': { entry: '07:00:00', exit: '13:00:00' },
                '07:00 às 15:00': { entry: '07:00:00', exit: '15:00:00' },
                '07:00 às 17:00': { entry: '07:00:00', exit: '17:00:00' },
                '09:00 às 19:00': { entry: '09:00:00', exit: '19:00:00' },
                '11:00 às 19:00': { entry: '11:00:00', exit: '19:00:00' },
                '13:00 às 19:00': { entry: '13:00:00', exit: '19:00:00' },
              };

              let entryTime = null;
              let exitTime = null;

              if (s.is_custom_period && s.custom_entry && s.custom_exit) {
                entryTime = `${s.custom_entry}:00`;
                exitTime = `${s.custom_exit}:00`;
              } else if (s.periodo && PERIODO_HORARIOS[s.periodo]) {
                entryTime = PERIODO_HORARIOS[s.periodo].entry;
                exitTime = PERIODO_HORARIOS[s.periodo].exit;
              }

              const studentData = {
                name: s.name,
                contracted_hours: s.ciclo ? parseFloat(s.ciclo) : 6,
                turma: s.turma || null,
                family_id: editingUser.id,
                school_id: currentUser.school_id,
                birth_date: s.birth_date || null,
                turno: s.turno || null,
                periodo: periodStr || null,
                contracted_entry_time: entryTime,
                contracted_exit_time: exitTime,
              };

              const isExisting = typeof s.id === 'string';
              if (isExisting) {
                await supabase.from('students').update(studentData).eq('id', s.id);
              } else {
                await supabase.from('students').insert([{ ...studentData, status: 'idle' }]);
              }
            }

            // Atualizar titular na lista de autorizados
            const titularAuth = (editingUser.authorized || []).find(ap => ap.relation?.includes('(Titular)'));
            if (titularAuth) {
              await supabase.from('authorized_persons')
                .update({
                  name: primaryFormData.name,
                  relation: 'Responsável Financeiro (Titular)'
                })
                .eq('id', titularAuth.id);
            }
          }

          setSuccessMsg('Titular atualizado com sucesso!');
          if (onSaved) onSaved({ ...editingUser, name: primaryFormData.name });
          
        } else {
          // 2. Criar novo titular
          const extraFields = {
            phone: primaryFormData.phone1,
            phone2: primaryFormData.phone2 || null,
            doc_type: primaryFormData.doc_type || null,
            doc_number: primaryFormData.doc_number || null,
            profession: primaryFormData.profession || null,
            civil_status: primaryFormData.civil_status || null,
            guardian_type: 'Responsável Financeiro',
            linked_family_id: null
          };

          const { data: newUser, error: funcError } = await supabase.functions.invoke('create-admin-user', {
            body: {
              email: primaryFormData.email.trim().toLowerCase(),
              password: primaryFormData.password,
              name: primaryFormData.name,
              role: primaryFormData.role,
              school_id: currentUser.school_id,
              extra_fields: extraFields
            }
          });

          if (funcError || !newUser || newUser.error) {
            let errMsg = 'Erro ao criar usuário titular.';
            if (funcError) {
              try {
                const errBody = typeof funcError.context?.json === 'function' 
                  ? await funcError.context.json() 
                  : funcError.context;
                errMsg = errBody?.error || errBody?.message || funcError.message;
              } catch(e) { errMsg = funcError.message; }
            } else if (newUser?.error) {
              errMsg = newUser.error;
            }
            if (errMsg?.includes?.('already registered')) throw new Error('Este e-mail já está em uso.');
            throw new Error(errMsg);
          }

          let studentsToInsert = [];
          if (primaryFormData.role === 'family') {
            studentsToInsert = students
              .filter(s => s.name.trim() !== '')
              .map(s => {
                const periodStr = s.is_custom_period ? `${s.custom_entry} às ${s.custom_exit}` : s.periodo;
                return {
                  name: s.name,
                  contracted_hours: s.ciclo ? parseFloat(s.ciclo) : 6,
                  turma: s.turma || null,
                  family_id: newUser.id,
                  status: 'idle',
                  school_id: currentUser.school_id,
                  ...(s.birth_date ? { birth_date: s.birth_date } : {}),
                  ...(s.turno ? { turno: s.turno } : {}),
                  ...(periodStr ? { periodo: periodStr } : {}),
                };
              });

            if (studentsToInsert.length > 0) {
              await supabase.from('students').insert(studentsToInsert);
            }

            await supabase.from('authorized_persons').insert([{
              family_id: newUser.id,
              name: newUser.name,
              relation: 'Responsável Financeiro (Titular)',
              has_photo: false,
              emergency_order: 1,
              school_id: currentUser.school_id,
            }]);
          }

          setSuccessMsg('Titular criado com sucesso! Agora você pode criar um Responsável secundário se quiser.');
          // Chamar callback para atualizar lista no componente pai, mas sem fechar o modal
          if (onSaved) onSaved({ ...newUser, students: studentsToInsert || [] });
          
          setPrimaryUserId(newUser.id);
        }
      } else if (activeTab === 'secondary') {
        // 3. Salvar Secundário
        if (secondaryUserId) {
          // Update Secundário
          const { error: userError } = await supabase
            .from('users')
            .update({
              name: secondaryFormData.name,
              email: secondaryFormData.email.trim().toLowerCase(),
              phone: secondaryFormData.phone1,
              phone2: secondaryFormData.phone2 || null,
              doc_type: secondaryFormData.doc_type || null,
              doc_number: secondaryFormData.doc_number || null,
              profession: secondaryFormData.profession || null,
              civil_status: secondaryFormData.civil_status || null,
              guardian_type: 'Responsável'
            })
            .eq('id', secondaryUserId);

          if (userError) throw userError;
          setSuccessMsg('Secundário atualizado com sucesso!');
        } else {
          // Insert Secundário
          const extraFields = {
            phone: secondaryFormData.phone1,
            phone2: secondaryFormData.phone2 || null,
            doc_type: secondaryFormData.doc_type || null,
            doc_number: secondaryFormData.doc_number || null,
            profession: secondaryFormData.profession || null,
            civil_status: secondaryFormData.civil_status || null,
            guardian_type: 'Responsável',
            linked_family_id: primaryUserId
          };

          const { data: newUser, error: funcError } = await supabase.functions.invoke('create-admin-user', {
            body: {
              email: secondaryFormData.email.trim().toLowerCase(),
              password: secondaryFormData.password,
              name: secondaryFormData.name,
              role: 'family',
              school_id: currentUser.school_id,
              extra_fields: extraFields
            }
          });

          if (funcError || !newUser || newUser.error) {
            let errMsg = 'Erro ao criar usuário secundário.';
            if (funcError) {
              try {
                const errBody = typeof funcError.context?.json === 'function' 
                  ? await funcError.context.json() 
                  : funcError.context;
                errMsg = errBody?.error || errBody?.message || funcError.message;
              } catch(e) { errMsg = funcError.message; }
            } else if (newUser?.error) {
              errMsg = newUser.error;
            }
            if (errMsg?.includes?.('already registered')) throw new Error('Este e-mail já está em uso.');
            throw new Error(errMsg);
          }
          
          setSecondaryUserId(newUser.id);
          setSuccessMsg('Secundário criado com sucesso!');
          if (onSaved) onSaved({ ...editingUser }); // Re-fetch na listagem
        }
      }

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Ocorreu um erro ao salvar os dados.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUser || !editingUser.email) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(editingUser.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err) {
      alert('Erro ao enviar e-mail de redefinição.');
    }
  };

  const inputCls = 'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium';

  const field = (label, required, content) => (
    <div className="flex flex-col space-y-1.5">
      <label className="text-xs font-semibold text-slate-700">{label} {required && <span className="text-red-500">*</span>}</label>
      {content}
    </div>
  );

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── SEÇÃO 1: TIPO DE CONTA ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
          1. Tipo de Conta
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {activeTab === 'primary' && field('Perfil do Usuário', true,
            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className={inputCls} disabled={!!primaryUserId}>
              <option value="family">Família / Responsáveis</option>
              <option value="admin">Administrador (Equipe)</option>
            </select>
          )}

          {formData.role === 'family' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Responsável (Abas)</label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setActiveTab('primary')}
                  className={`flex-1 py-3 px-3 rounded-xl text-xs font-bold border-2 transition-all ${activeTab === 'primary' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                  Responsável Financeiro
                </button>
                <button type="button"
                  disabled={!primaryUserId} // Desabilita aba secundária se for novo cadastro
                  title={!primaryUserId ? "Salve o titular primeiro" : ""}
                  onClick={() => setActiveTab('secondary')}
                  className={`flex-1 py-3 px-3 rounded-xl text-xs font-bold border-2 transition-all ${activeTab === 'secondary' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'} ${!primaryUserId ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Responsável
                </button>
              </div>
              {!primaryUserId && (
                <p className="text-[10px] text-amber-600 mt-2 font-medium bg-amber-50 p-2 rounded-lg border border-amber-100">
                  ⚠️ Cadastre o Responsável Financeiro primeiro. Após salvar, reabra a edição para adicionar o segundo responsável.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SEÇÃO 2: DADOS DO RESPONSÁVEL ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Users size={16}/> 2. Dados do {guardianType}
          </h3>
          {activeTab === 'primary' && editingUser && (
            <button type="button" onClick={handleResetPassword} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-indigo-100">
              <KeyRound size={12} /> {resetSent ? 'E-mail Enviado!' : 'Redefinir Senha'}
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('Nome Completo', true, <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="Ex: João da Silva"/>)}
          {field('E-mail (Login)', true, <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className={inputCls} placeholder="joao@email.com" />)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('Telefone (Principal)', true, <input type="text" required value={formData.phone1} onChange={e => setFormData({ ...formData, phone1: e.target.value })} className={inputCls} placeholder="(11) 99999-9999" />)}
          {field('Telefone (Secundário)', false, <input type="text" value={formData.phone2} onChange={e => setFormData({ ...formData, phone2: e.target.value })} className={inputCls} placeholder="(11) 88888-8888" />)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {field('Tipo de Documento', true, (
            <select value={formData.doc_type} onChange={e => setFormData({ ...formData, doc_type: e.target.value })} className={inputCls}>
              {DOC_TYPES.map(dt => <option key={dt} value={dt}>{dt}</option>)}
            </select>
          ))}
          <div className="md:col-span-2">
            {field('Número do Documento', true, <input type="text" required value={formData.doc_number} onChange={e => setFormData({ ...formData, doc_number: e.target.value })} className={inputCls} placeholder="000.000.000-00" />)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('Profissão', false, <input type="text" value={formData.profession} onChange={e => setFormData({ ...formData, profession: e.target.value })} className={inputCls} placeholder="Engenheiro" />)}
          {field('Estado Civil', true, (
            <select required value={formData.civil_status} onChange={e => setFormData({ ...formData, civil_status: e.target.value })} className={inputCls}>
              <option value="">Selecione...</option>
              {ESTADO_CIVIL.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
        </div>

        {((!primaryUserId && activeTab === 'primary') || (activeTab === 'secondary' && !secondaryUserId)) && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
            {field('Senha Temporária', true, <input type="password" required value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className={inputCls} placeholder="Defina uma senha inicial" minLength={6} />)}
            <p className="text-[10px] text-amber-600 mt-2">No primeiro acesso, a família poderá alterar a senha pelo aplicativo.</p>
          </div>
        )}
      </div>

      {/* ── SEÇÃO ALUNOS ── */}
      {formData.role === 'family' && activeTab === 'primary' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
            <GraduationCap size={16}/> 3. Alunos Vinculados
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Adicione os alunos pertencentes a este Responsável Financeiro.
          </p>

          <div className="space-y-4">
            {students.map((student, index) => (
              <StudentCard
                key={student.id}
                student={student}
                index={index}
                canRemove={students.length > 1}
                onChange={(id, patch) => {
                  setStudents(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
                }}
                onRemove={(id) => {
                  setStudents(prev => prev.filter(s => s.id !== id));
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStudents(prev => [...prev, emptyStudent()])}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-sm w-full justify-center hover:bg-indigo-100 transition-colors"
          >
            <Plus size={16} /> Adicionar mais um Aluno
          </button>
        </div>
      )}

      {formData.role === 'family' && activeTab === 'secondary' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
            <GraduationCap size={16}/> 3. Alunos Vinculados
          </h3>
          <div className="p-4 bg-purple-50 text-purple-700 text-xs font-medium rounded-xl border border-purple-100 italic">
            O responsável secundário herda automaticamente os mesmos alunos do Responsável Financeiro. Não é necessário vinculá-los novamente.
          </div>
        </div>
      )}

      {/* ── MENSAGENS E BOTÕES ── */}
      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 text-sm font-bold rounded-xl border border-red-100">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-green-50 text-green-700 text-sm font-bold rounded-xl flex items-center gap-2 border border-green-100">
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button type="button" onClick={handleCloseModal}
          className="px-6 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">
          Cancelar
        </button>
        <button type="submit" disabled={isLoading}
          className="px-8 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 rounded-xl transition flex items-center gap-2">
          {isLoading ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Salvando...</>
          ) : (
            <><UserPlus size={18} /> Salvar {guardianType}</>
          )}
        </button>
      </div>

    </form>
  );

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col scale-in-center">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <UserPlus size={24} className="text-indigo-600"/>
              {editingUser ? 'Editar Cadastro' : 'Novo Cadastro'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {editingUser ? 'Atualize as informações do usuário' : 'Cadastre um novo titular e seus alunos'}
            </p>
          </div>
          <button type="button" onClick={handleCloseModal} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 md:px-8">
          {formContent}
        </div>
      </div>
    </div>,
    document.body
  );
}
