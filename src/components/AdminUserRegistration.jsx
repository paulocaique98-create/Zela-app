import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Plus, Trash2, CheckCircle2, Users, Baby, Clock, KeyRound, X } from 'lucide-react';
import { supabase, supabaseAuthHelper } from '../lib/supabase';
import { TURMAS } from './AdminDailyPresence';

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

      {/* Turma + Ciclo + Turno */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Turma</label>
          <select value={student.turma} onChange={e => set('turma', e.target.value)} className={inputCls}>
            <option value="">Selecionar...</option>
            {TURMAS.filter(t => t !== 'Todas as Turmas').map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Ciclo (Horas/Dia) *</label>
          <select required value={student.ciclo} onChange={e => set('ciclo', e.target.value)} className={inputCls}>
            <option value="">Selecionar...</option>
            {CICLOS.map(c => <option key={c} value={c}>{c}h/dia</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Turno *</label>
          <select required value={student.turno} onChange={e => set('turno', e.target.value)}
            disabled={!student.ciclo} className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}>
            <option value="">{student.ciclo ? 'Selecionar...' : '← Primeiro o Ciclo'}</option>
            {turnos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Período */}
      <div>
        <label className={labelCls}>Período *</label>
        <select required value={student.is_custom_period ? '__custom__' : student.periodo}
          onChange={e => set('periodo', e.target.value)}
          disabled={!student.turno}
          className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}>
          <option value="">{student.turno ? 'Selecionar...' : '← Primeiro o Turno'}</option>
          {periodos.map(p => <option key={p} value={p}>{p}</option>)}
          {student.turno && <option value="__custom__">✏️ Personalizar Horário</option>}
        </select>
      </div>

      {/* Horário personalizado */}
      {student.is_custom_period && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl animate-in fade-in duration-200">
          <div>
            <label className={labelCls}>Entrada Personalizada *</label>
            <input type="time" required value={student.custom_entry}
              onChange={e => set('custom_entry', e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Saída Personalizada *</label>
            <input type="time" required value={student.custom_exit}
              onChange={e => set('custom_exit', e.target.value)}
              className={inputCls} />
          </div>
        </div>
      )}
    </div>
  );
}



// ──────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────
export default function AdminUserRegistration({ currentUser, editingUser, onClose, onSaved }) {
  const [guardianType, setGuardianType] = useState('Responsável'); // 'Responsável' | 'Responsável Financeiro'
  const [resetSent, setResetSent] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone1: '',
    phone2: '',
    doc_type: 'CPF',
    doc_number: '',
    profession: '',
    civil_status: '',
    role: 'family',
  });

  const [students, setStudents] = useState([emptyStudent()]);

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (editingUser) {
      setFormData({
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

      setGuardianType(editingUser.guardian_type || 'Responsável');

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
    }
  }, [editingUser]);

  const handleSendResetEmail = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (resetError) throw resetError;
      setResetSent(true);
      setTimeout(() => setResetSent(false), 3000);
    } catch (e) {
      setErrorMsg(e.message || 'Erro ao enviar e-mail de redefinição.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Handlers de alunos ──
  const handleAddStudent = () => setStudents(prev => [...prev, emptyStudent()]);

  const handleRemoveStudent = (id) => setStudents(prev => prev.filter(s => s.id !== id));

  const handleStudentChange = (id, patch) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingUser) {
        // 1. Atualizar usuário na tabela users
        const { error: userError } = await supabase
          .from('users')
          .update({
            name: formData.name,
            email: formData.email.trim().toLowerCase(),
            phone: formData.phone1,
            role: formData.role,
          })
          .eq('id', editingUser.id);

        if (userError) {
          if (userError.code === '23505') throw new Error('Este e-mail já está em uso por outro usuário.');
          throw userError;
        }

        // 2. Atualizar campos extras
        const extraFields = {
          phone2: formData.phone2 || null,
          doc_type: formData.doc_type || null,
          doc_number: formData.doc_number || null,
          profession: formData.profession || null,
          civil_status: formData.civil_status || null,
          guardian_type: guardianType,
        };
        await supabase.from('users').update(extraFields).eq('id', editingUser.id);

        // 3. Atualizar alunos vinculados (apenas se for família)
        if (formData.role === 'family') {
          const existingStudentIds = (editingUser.students || []).map(s => s.id);
          const currentStudentIds = students.map(s => s.id);

          // 3a. Deletar alunos que foram removidos do formulário
          const removedStudentIds = existingStudentIds.filter(id => !currentStudentIds.includes(id));
          if (removedStudentIds.length > 0) {
            const { error: delErr } = await supabase.from('students').delete().in('id', removedStudentIds);
            if (delErr) throw delErr;
          }

          // 3b. Atualizar ou inserir alunos atuais
          for (const s of students) {
            if (!s.name.trim()) continue;

            const periodStr = s.is_custom_period
              ? `${s.custom_entry} às ${s.custom_exit}`
              : s.periodo;

            const studentData = {
              name: s.name,
              contracted_hours: s.ciclo ? parseFloat(s.ciclo) : 6,
              turma: s.turma || null,
              family_id: editingUser.id,
              school_id: currentUser.school_id,
              birth_date: s.birth_date || null,
              turno: s.turno || null,
              periodo: periodStr || null,
            };

            const isExisting = typeof s.id === 'string';
            if (isExisting) {
              const { error: updErr } = await supabase.from('students').update(studentData).eq('id', s.id);
              if (updErr) throw updErr;
            } else {
              const { error: insErr } = await supabase.from('students').insert([{
                ...studentData,
                status: 'idle'
              }]);
              if (insErr) throw insErr;
            }
          }

          // 3c. Atualizar titular na lista de autorizados
          const titularAuth = (editingUser.authorized || []).find(ap => ap.relation?.includes('(Titular)'));
          if (titularAuth) {
            await supabase.from('authorized_persons')
              .update({
                name: formData.name,
                relation: `${guardianType} (Titular)`
              })
              .eq('id', titularAuth.id);
          }
        }

        setSuccessMsg('Cadastro atualizado com sucesso!');
        if (onSaved) {
          onSaved({
            ...editingUser,
            name: formData.name,
            email: formData.email,
            phone: formData.phone1,
            phone2: formData.phone2,
            doc_type: formData.doc_type,
            doc_number: formData.doc_number,
            profession: formData.profession,
            civil_status: formData.civil_status,
            role: formData.role,
            guardian_type: guardianType,
            students: formData.role === 'family' ? students.filter(s => s.name.trim() !== '').map(s => ({
              id: s.id,
              name: s.name,
              turma: s.turma,
              contracted_hours: s.ciclo ? parseFloat(s.ciclo) : 6,
              turno: s.turno,
              periodo: s.is_custom_period ? `${s.custom_entry} às ${s.custom_exit}` : s.periodo,
              birth_date: s.birth_date
            })) : []
          });
        }
        setTimeout(() => {
          if (onClose) onClose();
        }, 1500);

      } else {
        // 1. Criar usuário no Supabase Auth
        const { data: authData, error: authError } = await supabaseAuthHelper.auth.signUp({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              role: formData.role,
              school_id: currentUser.school_id,
            }
          }
        });
        if (authError) throw authError;

        const authUser = authData.user;
        if (!authUser) throw new Error('Erro ao criar usuário no sistema de autenticação.');

        // 2. Inserir na tabela users (campos base que sempre existem)
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert([{
            id: authUser.id,
            name: formData.name,
            email: formData.email.trim().toLowerCase(),
            phone: formData.phone1,
            role: formData.role,
            school_id: currentUser.school_id,
          }])
          .select()
          .single();

        if (userError) {
          if (userError.code === '23505') throw new Error('Este e-mail já está em uso.');
          throw userError;
        }

        // 2b. Atualiza os campos extras (phone2, doc, civil_status etc.) via UPDATE separado.
        // Se as colunas ainda não existirem no banco, o erro é silenciado (não tranca o cadastro).
        const extraFields = {
          phone2: formData.phone2 || null,
          doc_type: formData.doc_type || null,
          doc_number: formData.doc_number || null,
          profession: formData.profession || null,
          civil_status: formData.civil_status || null,
          guardian_type: guardianType,
        };
        // Tenta atualizar — ignora erros de coluna inexistente
        await supabase.from('users').update(extraFields).eq('id', newUser.id).then(
          ({ error: extErr }) => {
            if (extErr) console.warn('[Cadastro] Campos extras não salvos (migration pendente):', extErr.message);
          }
        );

        // 3. Inserir alunos vinculados (apenas para família)
        if (formData.role === 'family') {
          const studentsToInsert = students
            .filter(s => s.name.trim() !== '')
            .map(s => {
              const periodStr = s.is_custom_period
                ? `${s.custom_entry} às ${s.custom_exit}`
                : s.periodo;
              // Campos base garantidos
              return {
                name: s.name,
                contracted_hours: s.ciclo ? parseFloat(s.ciclo) : 6,
                turma: s.turma || null,
                family_id: newUser.id,
                status: 'idle',
                school_id: currentUser.school_id,
                // Campos extras (ignorados pelo Supabase se coluna não existir)
                ...(s.birth_date ? { birth_date: s.birth_date } : {}),
                ...(s.turno ? { turno: s.turno } : {}),
                ...(periodStr ? { periodo: periodStr } : {}),
                // Ficha Médica como JSONB
                ...(s.medical ? { medical_data: s.medical } : {}),
              };
            });

          if (studentsToInsert.length > 0) {
            const { error: studErr } = await supabase.from('students').insert(studentsToInsert);
            // Se o erro for de coluna inexistente, tenta sem os campos extras
            if (studErr) {
              if (studErr.message?.includes('column') || studErr.message?.includes('schema')) {
                console.warn('[Cadastro] Campos extras de alunos não salvos (migration pendente):', studErr.message);
                const baseSt = studentsToInsert.map(({ birth_date, turno, periodo, medical_data, ...rest }) => rest);
                const { error: studErr2 } = await supabase.from('students').insert(baseSt);
                if (studErr2) throw studErr2;
              } else {
                throw studErr;
              }
            }
          }

          // 4. Adicionar o titular como autorizado
          await supabase.from('authorized_persons').insert([{
            family_id: newUser.id,
            name: newUser.name,
            relation: `${guardianType} (Titular)`,
            has_photo: false,
            status: 'approved',
            emergency_order: 1,
            school_id: currentUser.school_id,
          }]);
        }

        setSuccessMsg('Cadastro realizado com sucesso!');
        setFormData({ name: '', email: '', password: '', phone1: '', phone2: '', doc_type: 'CPF', doc_number: '', profession: '', civil_status: '', role: 'family' });
        setStudents([emptyStudent()]);
        setGuardianType('Responsável');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Ocorreu um erro ao cadastrar o usuário.');
    } finally {
      setIsLoading(false);
    }
  };

  const field = (label, required, node) => (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}{required && ' *'}</label>
      {node}
    </div>
  );

  const inputCls = 'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium';

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── SEÇÃO 1: TIPO DE CONTA ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
          1. Tipo de Conta
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Perfil do Usuário', true,
            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className={inputCls}>
              <option value="family">Família / Responsáveis</option>
              <option value="admin">Administrador (Equipe)</option>
            </select>
          )}

          {formData.role === 'family' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Responsável *</label>
              <div className="flex gap-2">
                {['Responsável', 'Responsável Financeiro'].map(t => (
                  <button key={t} type="button"
                    onClick={() => setGuardianType(t)}
                    className={`flex-1 py-3 px-3 rounded-xl text-xs font-bold border-2 transition-all ${guardianType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SEÇÃO 2: DADOS DO RESPONSÁVEL ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
          <Users size={14} /> 2. Dados do Responsável
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Nome Completo', true,
            <input type="text" required value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className={inputCls} placeholder="Nome completo" />
          )}
          {field('E-mail Principal', true,
            <input type="email" required value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className={inputCls} placeholder="email@exemplo.com" />
          )}
          {editingUser ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <KeyRound size={12} className="text-slate-400" /> Senha de Acesso
              </label>
              <button
                type="button"
                onClick={handleSendResetEmail}
                disabled={isLoading || resetSent}
                className="w-full py-3 px-4 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
              >
                {resetSent ? 'E-mail de Redefinição Enviado!' : 'Enviar E-mail de Redefinição'}
              </button>
            </div>
          ) : (
            field('Senha Provisória', true,
              <input type="text" required minLength={4} value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className={inputCls} placeholder="Mínimo 4 caracteres" />
            )
          )}
        </div>

        {/* Documento */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {field('Tipo de Documento', false,
            <select value={formData.doc_type} onChange={e => setFormData({ ...formData, doc_type: e.target.value })} className={inputCls}>
              {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {field('Número do Documento', false,
            <input type="text" value={formData.doc_number}
              onChange={e => setFormData({ ...formData, doc_number: e.target.value })}
              className={inputCls} placeholder="000.000.000-00" />
          )}
          {field('Estado Civil', false,
            <select value={formData.civil_status} onChange={e => setFormData({ ...formData, civil_status: e.target.value })} className={inputCls}>
              <option value="">Selecionar...</option>
              {ESTADO_CIVIL.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>

        {/* Telefone + Profissão */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {field('Telefone 1', false,
            <input type="tel" value={formData.phone1}
              onChange={e => setFormData({ ...formData, phone1: e.target.value })}
              className={inputCls} placeholder="(11) 90000-0000" />
          )}
          {field('Telefone 2', false,
            <input type="tel" value={formData.phone2}
              onChange={e => setFormData({ ...formData, phone2: e.target.value })}
              className={inputCls} placeholder="(11) 90000-0000" />
          )}
          {field('Profissão', false,
            <input type="text" value={formData.profession}
              onChange={e => setFormData({ ...formData, profession: e.target.value })}
              className={inputCls} placeholder="Ex: Engenheira" />
          )}
        </div>
      </div>

      {/* ── SEÇÃO 3: ALUNOS VINCULADOS ── */}
      {formData.role === 'family' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2"><Clock size={14} /> 3. Alunos Vinculados</span>
            <button type="button" onClick={handleAddStudent}
              className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">
              <Plus size={13} /> Adicionar Aluno
            </button>
          </h3>

          <div className="space-y-4">
            {students.map((student, idx) => (
              <StudentCard
                key={student.id}
                student={student}
                index={idx}
                onChange={handleStudentChange}
                onRemove={handleRemoveStudent}
                canRemove={students.length > 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── SUBMIT ── */}
      <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
        {editingUser && (
          <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition text-sm">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={isLoading}
          className="bg-indigo-600 text-white font-bold px-8 py-3.5 rounded-xl hover:bg-indigo-700 transition shadow-md disabled:opacity-70 flex items-center gap-2">
          {isLoading ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Finalizar Cadastro'}
        </button>
      </div>
    </form>
  );

  if (editingUser) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
                <UserPlus size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-lg">Editar Cadastro do Usuário</h2>
                <p className="text-xs text-slate-400">Atualize as informações do perfil e alunos vinculados</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg transition text-slate-500">
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-6 overflow-y-auto flex-1">
            {successMsg && (
              <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center gap-2 font-medium">
                <CheckCircle2 size={20} /> {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 font-medium">{errorMsg}</div>
            )}

            {formContent}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600"><UserPlus size={24} /></div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Cadastro de Novo Usuário</h2>
          <p className="text-sm text-slate-500">Crie perfis para novas Famílias ou Administradores.</p>
        </div>
      </div>

      {/* Feedback */}
      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center gap-2 font-medium">
          <CheckCircle2 size={20} /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 font-medium">{errorMsg}</div>
      )}

      {formContent}
    </div>
  );
}
