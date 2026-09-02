import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Plus, Trash2, CheckCircle2, Users, Baby, Clock, KeyRound, X, UserMinus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SETORES_CHAT } from '../lib/constants';
import { useSchoolConfig } from '../lib/schoolConfig';
import { applyExtraHoursToTime } from '../utils/attendanceUtils';
import ConfirmModal from './ConfirmModal';

const DEPARTAMENTOS_CHAT = SETORES_CHAT.filter(s => s.value !== 'suporte_zela');

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

// Horas adicionais por aluno, por dia da semana (students.extra_hours) --
// desloca o ciclo/tolerância de check-out naquele dia específico. Só o
// admin PRINCIPAL da escola (ou developer) pode configurar -- protegido
// também no banco (trigger protect_student_extra_hours), então mesmo que
// a UI falhasse em esconder o campo pra outro role, a escrita seria
// bloqueada. Chaves em português sem acento, mesma convenção da coluna.
const DIAS_EXTRA_HORAS = [
  { key: 'segunda', label: 'Segunda' },
  { key: 'terca', label: 'Terça' },
  { key: 'quarta', label: 'Quarta' },
  { key: 'quinta', label: 'Quinta' },
  { key: 'sexta', label: 'Sexta' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];
const MAX_HORAS_EXTRA_DIA = 4;

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
  extra_hours: {},
});

// ──────────────────────────────────────────────────────────
// Sub-componente: card de aluno
// ──────────────────────────────────────────────────────────
function StudentCard({ student, index, onChange, onRemove, canRemove, turmas, canManageExtraHours = false }) {
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

  // Achado real ("não consigo clicar no checkbox"): usar só
  // `Object.keys(extra_hours).length > 0` como estado do checkbox quebra o
  // primeiro clique -- marcar a caixa num aluno sem nenhum dia configurado
  // ainda grava extra_hours: {} de novo (continua vazio), e o checkbox
  // volta sozinho pra desmarcado antes da área expandir. Precisa de um
  // estado PRÓPRIO pra "quero configurar", independente de já ter algum
  // dia preenchido. Inicializa marcado se o aluno já tiver horas extras
  // salvas (edição), senão desmarcado.
  const [showExtraHours, setShowExtraHours] = useState(Object.keys(student.extra_hours || {}).length > 0);

  const setExtraHoursEnabled = (enabled) => {
    setShowExtraHours(enabled);
    if (!enabled) onChange(student.id, { extra_hours: {} });
  };

  const setExtraHoursForDay = (dayKey, value) => {
    const parsed = value === '' ? undefined : Math.min(MAX_HORAS_EXTRA_DIA, Math.max(0, Number(value)));
    const next = { ...student.extra_hours };
    if (parsed === undefined || parsed === 0) {
      delete next[dayKey];
    } else {
      next[dayKey] = parsed;
    }
    onChange(student.id, { extra_hours: next });
  };

  // Horário efetivo do dia (ciclo contratado + extra) só pro resumo visual
  // -- não recalcula nada real, é só o mesmo horário de saída já escolhido
  // (custom_exit ou o fim do período selecionado) deslocado pra exibição.
  const baseExitTime = student.is_custom_period ? student.custom_exit : (student.periodo || '').split(' às ')[1];

  const inputCls = 'w-full p-2.5 bg-white border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm';
  const labelCls = 'block text-[10px] font-bold text-on-surface-variant uppercase mb-1 tracking-wide';

  return (
    <div className="p-4 bg-surface-container-low border border-outline-variant rounded-zela-lg space-y-3">
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
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
            {turmas.map(t => (
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
        <div className="grid grid-cols-2 gap-3 p-3 bg-primary/10 border border-primary/20 rounded-zela-md animate-in fade-in duration-200">
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

      {/* Horas adicionais por dia da semana -- só admin principal/developer */}
      {canManageExtraHours && (
        <div className="pt-3 border-t border-outline-variant">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showExtraHours}
              onChange={e => setExtraHoursEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="text-xs font-bold text-on-surface">Horas adicionais</span>
          </label>

          {showExtraHours && (
            <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-zela-md space-y-1.5 animate-in fade-in duration-200">
              {DIAS_EXTRA_HORAS.map(dia => {
                const valor = student.extra_hours?.[dia.key] || 0;
                const efetivo = valor > 0 && baseExitTime ? applyExtraHoursToTime(baseExitTime, valor) : null;
                return (
                  <div key={dia.key} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-on-surface-variant shrink-0">{dia.label}</span>
                    <input
                      type="number"
                      min="0"
                      max={MAX_HORAS_EXTRA_DIA}
                      step="0.5"
                      value={valor || ''}
                      onChange={e => setExtraHoursForDay(dia.key, e.target.value)}
                      placeholder="0"
                      className="w-16 p-1.5 bg-white border border-outline-variant rounded-md text-xs text-center focus:ring-2 focus:ring-primary outline-none"
                    />
                    <span className="text-[11px] text-on-surface-variant/70">h</span>
                    {efetivo && (
                      <span className="text-[11px] text-primary font-medium">
                        (ciclo {baseExitTime} + {valor}h = saída {efetivo})
                      </span>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-on-surface-variant/60 pt-1">Máximo {MAX_HORAS_EXTRA_DIA}h/dia, em intervalos de 30min. Afeta a tolerância de check-out e a cobrança automática de hora extra nesse dia.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



// ──────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────
export default function AdminUserRegistration({ currentUser, editingUser, initialData, forceModal, onClose, onSaved }) {
  const { turmas: schoolTurmas, terminology } = useSchoolConfig(currentUser?.school_id);
  const [guardianType, setGuardianType] = useState('Responsável'); // 'Responsável' | 'Responsável Financeiro'
  const [resetSent, setResetSent] = useState(false);

  // initialData pré-preenche o formulário de CRIAÇÃO (não edição) — usado pelo
  // atalho "Criar acesso de login" a partir de um Funcionário já cadastrado,
  // pra não precisar redigitar nome/telefone/e-mail.
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
    departamento: '',
    chat_visibilidade_total: false,
    turmas: [],
    ...initialData,
  });

  const [students, setStudents] = useState([emptyStudent()]);

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Estados para 2º Responsável
  const [secondGuardian, setSecondGuardian] = useState(null);
  const [isAddingSecondGuardian, setIsAddingSecondGuardian] = useState(false);
  const [secondGuardianForm, setSecondGuardianForm] = useState({
    name: '', email: '', password: '', phone: '', doc_number: '', relationship: 'Pai'
  });
  const [secondGuardianLoading, setSecondGuardianLoading] = useState(false);

  useEffect(() => {
    async function loadSecondGuardian() {
      if (editingUser && editingUser.role === 'family') {
        setSecondGuardian(null);
        setIsAddingSecondGuardian(false);
        const studentIds = editingUser.students?.map(s => s.id) || [];
        if (studentIds.length === 0) return;
        
        const { data, error } = await supabase
          .from('student_guardians')
          .select(`
            guardian_id,
            relationship,
            users (name, email, phone)
          `)
          .in('student_id', studentIds)
          .eq('is_primary', false)
          .limit(1);

        if (!error && data && data.length > 0) {
          const sg = data[0];
          // Trata caso a query retorne array em users (se não tiver foreign key mapeada com 1:1 exata pelo postgrest)
          const u = Array.isArray(sg.users) ? sg.users[0] : sg.users;
          if (u) {
            setSecondGuardian({
              id: sg.guardian_id,
              name: u.name,
              email: u.email,
              phone: u.phone,
              relationship: sg.relationship
            });
          }
        }
      }
    }
    loadSecondGuardian();
  }, [editingUser]);

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
        departamento: editingUser.departamento || '',
        chat_visibilidade_total: editingUser.chat_visibilidade_total || false,
        turmas: editingUser.turmas || [],
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
            extra_hours: s.extra_hours || {},
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

  const handleRemoveStudent = (id) => {
    setStudents(students.filter(s => s.id !== id));
  };

  const handleCreateSecondGuardian = async () => {
    try {
      setSecondGuardianLoading(true);
      const studentIds = students.map(s => s.id).filter(id => typeof id === 'string');
      if (studentIds.length === 0) {
        throw new Error('Salve os alunos primeiro (Finalizar Cadastro/Alterações) antes de adicionar o 2º Responsável.');
      }
      
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://orafqopnomdrvwlvxrkz.supabase.co';
      
      const response = await fetch(`${supabaseUrl}/functions/v1/create-family-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...secondGuardianForm,
          school_id: currentUser.school_id,
          student_ids: studentIds,
          is_financial: false
        })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao criar 2º Responsável');
      
      setSecondGuardian({
        id: result.user.id,
        name: secondGuardianForm.name,
        email: secondGuardianForm.email,
        phone: secondGuardianForm.phone,
        relationship: secondGuardianForm.relationship
      });
      setIsAddingSecondGuardian(false);
      setSuccessMsg('2º Responsável criado com sucesso!');
      
      // Limpa a msg após 5s
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setSecondGuardianLoading(false);
    }
  };

  const [confirmSecondGuardianAction, setConfirmSecondGuardianAction] = useState(null); // 'remove' | 'delete' | null

  const performRemoveSecondGuardian = async () => {
    try {
      setSecondGuardianLoading(true);
      const studentIds = students.map(s => s.id).filter(id => typeof id === 'string');
      if (studentIds.length === 0) return;
      
      const { error } = await supabase
        .from('student_guardians')
        .delete()
        .eq('guardian_id', secondGuardian.id)
        .in('student_id', studentIds);
        
      if (error) {
        console.error('Erro ao remover vínculo:', error);
        throw error;
      }
      
      setSecondGuardian(null);
      setSuccessMsg('2º Responsável desvinculado com sucesso!');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Catch erro remover vínculo:', err);
      setErrorMsg('Erro ao remover vínculo: ' + err.message);
      setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setSecondGuardianLoading(false);
      setConfirmSecondGuardianAction(null);
    }
  };

  const performDeleteSecondGuardian = async () => {
    setSecondGuardianLoading(true);
    try {
      const studentIds = students.map(s => s.id).filter(id => typeof id === 'string');
      // 1. Remover vínculo primeiro
      if (studentIds.length > 0) {
        const { error: linkError } = await supabase
          .from('student_guardians')
          .delete()
          .eq('guardian_id', secondGuardian.id)
          .in('student_id', studentIds);
        
        if (linkError) throw new Error(linkError.message);
      }
      
      // 2. Deletar usuário via Edge Function (igual ao delete-user existente)
      const { error: deleteError } = await supabase.functions.invoke('delete-user', {
        body: { userId: secondGuardian.id }
      });
      
      if (deleteError) throw new Error(deleteError.message);
      
      setSecondGuardian(null);
      console.log('2º Responsável excluído com sucesso');
      setSuccessMsg('2º Responsável excluído permanentemente!');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Erro ao excluir 2º Responsável:', err);
      setErrorMsg('Erro: ' + err.message);
      setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setSecondGuardianLoading(false);
      setConfirmSecondGuardianAction(null);
    }
  };

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
          ...(formData.role === 'admin' ? {
            departamento: formData.departamento || null,
            ...(currentUser.is_primary_admin ? { chat_visibilidade_total: formData.chat_visibilidade_total } : {}),
          } : {}),
          ...(formData.role === 'teacher' ? { turmas: formData.turmas } : {}),
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
              // extra_hours só é alterado de verdade pra quem vê o campo na UI
              // (admin principal/developer) -- pra qualquer outro role, s.extra_hours
              // nunca diverge do que foi carregado, então isso é um no-op seguro
              // mesmo que a trigger de proteção do banco recuse a mudança.
              extra_hours: s.extra_hours || {},
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
        // 1. Criar usuário de forma segura via Edge Function
        const extraFields = {
          phone: formData.phone1,
          phone2: formData.phone2 || null,
          doc_type: formData.doc_type || null,
          doc_number: formData.doc_number || null,
          profession: formData.profession || null,
          civil_status: formData.civil_status || null,
          guardian_type: guardianType,
          ...(formData.role === 'admin' ? {
            departamento: formData.departamento || null,
            ...(currentUser.is_primary_admin ? { chat_visibilidade_total: formData.chat_visibilidade_total } : {}),
          } : {}),
          ...(formData.role === 'teacher' ? { turmas: formData.turmas } : {}),
        };

        const { data: newUser, error: funcError } = await supabase.functions.invoke('create-admin-user', {
          body: {
            email: formData.email.trim().toLowerCase(),
            password: formData.password,
            name: formData.name,
            role: formData.role,
            school_id: currentUser.school_id,
            extra_fields: extraFields
          }
        });

        if (funcError || !newUser || newUser.error) {
          const errMsg = (funcError?.message || newUser?.error || 'Erro ao criar usuário');
          if (errMsg.includes('already registered')) throw new Error('Este e-mail já está em uso.');
          throw new Error(errMsg);
        }


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
                // Só envia extra_hours se de fato tiver algo -- pra quem não vê o
                // campo (não é admin principal/developer), fica de fora do insert
                // e a coluna cai no default '{}' do banco, sem depender de RLS.
                ...(s.extra_hours && Object.keys(s.extra_hours).length > 0 ? { extra_hours: s.extra_hours } : {}),

              };
            });

          if (studentsToInsert.length > 0) {
            const { error: studErr } = await supabase.from('students').insert(studentsToInsert);
            // Se o erro for de coluna inexistente, tenta sem os campos extras
            if (studErr) {
              if (studErr.message?.includes('column') || studErr.message?.includes('schema')) {
                console.warn('[Cadastro] Campos extras de alunos não salvos (migration pendente):', studErr.message);
                const baseSt = studentsToInsert.map(({ birth_date: _bd, turno: _t, periodo: _p, extra_hours: _eh, ...rest }) => rest);
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
      <label className="block text-xs font-semibold text-on-surface mb-1">{label}{required && ' *'}</label>
      {node}
    </div>
  );

  const inputCls = 'w-full p-3 bg-surface-container-low border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary outline-none text-sm font-medium';

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── SEÇÃO 1: TIPO DE CONTA ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-on-surface-variant/70 uppercase tracking-wider border-b border-outline-variant pb-2">
          1. Tipo de Conta
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Perfil do Usuário', true,
            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className={inputCls}>
              <option value="family">Responsáveis</option>
              <option value="admin">Administrador (Equipe)</option>
              <option value="teacher">Professor</option>
            </select>
          )}

          {formData.role === 'family' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1">Tipo de Responsável *</label>
              <div className="flex gap-2">
                {['Responsável', 'Responsável Financeiro'].map(t => (
                  <button key={t} type="button"
                    onClick={() => setGuardianType(t)}
                    className={`flex-1 py-3 px-3 rounded-zela-md text-xs font-bold border-2 transition-all ${guardianType === t ? 'bg-primary text-white border-indigo-600' : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formData.role === 'admin' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1">Departamento (Chat) *</label>
              <select required value={formData.departamento} onChange={e => setFormData({ ...formData, departamento: e.target.value })} className={inputCls}>
                <option value="">Selecionar...</option>
                {DEPARTAMENTOS_CHAT.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {formData.role === 'teacher' && (
          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1">{terminology.class}(s) que leciona *</label>
            <div className="flex flex-wrap gap-2">
              {schoolTurmas.map(t => {
                const isSelected = formData.turmas.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      turmas: isSelected ? formData.turmas.filter(x => x !== t) : [...formData.turmas, t],
                    })}
                    className={`px-3 py-1.5 rounded-zela-md text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-primary border-indigo-600 text-white'
                        : 'bg-white border-outline-variant text-on-surface-variant hover:border-indigo-300'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {formData.turmas.length === 0 && (
              <p className="text-[11px] text-amber-600 font-semibold mt-1.5">Selecione ao menos uma turma.</p>
            )}
          </div>
        )}

        {formData.role === 'admin' && currentUser.is_primary_admin && (
          <label className="flex items-center gap-2 cursor-pointer bg-primary/10 border border-primary/10 rounded-zela-md p-3">
            <input
              type="checkbox"
              checked={formData.chat_visibilidade_total}
              onChange={e => setFormData({ ...formData, chat_visibilidade_total: e.target.checked })}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-xs font-bold text-primary">Visualiza e responde o chat de todos os departamentos</span>
          </label>
        )}
      </div>

      {/* ── SEÇÃO 2: DADOS DO RESPONSÁVEL ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-on-surface-variant/70 uppercase tracking-wider border-b border-outline-variant pb-2 flex items-center gap-2">
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
              <label className="block text-xs font-semibold text-on-surface mb-1 flex items-center gap-1">
                <KeyRound size={12} className="text-on-surface-variant/70" /> Senha de Acesso
              </label>
              <button
                type="button"
                onClick={handleSendResetEmail}
                disabled={isLoading || resetSent}
                className="w-full py-3 px-4 border border-primary/20 text-primary hover:bg-primary/10 font-bold rounded-zela-md text-xs transition flex items-center justify-center gap-2"
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
          <h3 className="text-sm font-bold text-on-surface-variant/70 uppercase tracking-wider border-b border-outline-variant pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2"><Clock size={14} /> 3. Alunos Vinculados</span>
            <button type="button" onClick={handleAddStudent}
              className="text-primary hover:text-indigo-800 flex items-center gap-1 text-xs font-bold bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition">
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
                turmas={schoolTurmas}
                canManageExtraHours={currentUser?.role === 'developer' || currentUser?.is_primary_admin === true}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── SEÇÃO 4: 2º RESPONSÁVEL (Apenas Edição) ── */}
      {editingUser && formData.role === 'family' && (
        <div className="space-y-4 pt-4 border-t border-outline-variant">
          <h3 className="text-sm font-bold text-on-surface-variant/70 uppercase tracking-wider flex items-center gap-2">
            <Users size={14} /> 4. 2º Responsável (Opcional)
          </h3>
          
          {secondGuardian ? (
            <div className="p-4 bg-surface-container-low border border-outline-variant rounded-zela-lg flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-on-surface">{secondGuardian.name}</h4>
                  <span className="text-[10px] uppercase tracking-wider font-bold bg-indigo-100 text-primary px-2 py-0.5 rounded-md">
                    2º Responsável
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">{secondGuardian.email} • {secondGuardian.relationship}</p>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setConfirmSecondGuardianAction('remove')}
                  disabled={secondGuardianLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-on-surface-variant border border-slate-300 rounded-lg hover:bg-surface-container-low transition disabled:opacity-50"
                >
                  <UserMinus size={14} /> Remover Vínculo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSecondGuardianAction('delete')}
                  disabled={secondGuardianLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                >
                  <Trash2 size={14} /> Excluir 2º Responsável
                </button>
              </div>
            </div>
          ) : isAddingSecondGuardian ? (
            <div className="p-4 bg-surface-container-low border border-outline-variant rounded-zela-lg space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field('Nome Completo', true, <input type="text" value={secondGuardianForm.name} onChange={e => setSecondGuardianForm({...secondGuardianForm, name: e.target.value})} className={inputCls} placeholder="Nome do 2º Responsável" />)}
                {field('E-mail Principal', true, <input type="email" value={secondGuardianForm.email} onChange={e => setSecondGuardianForm({...secondGuardianForm, email: e.target.value})} className={inputCls} placeholder="email@exemplo.com" />)}
                {field('Senha Provisória', true, <input type="text" minLength={6} value={secondGuardianForm.password} onChange={e => setSecondGuardianForm({...secondGuardianForm, password: e.target.value})} className={inputCls} placeholder="Mínimo 6 caracteres" />)}
                {field('Telefone', false, <input type="text" value={secondGuardianForm.phone} onChange={e => setSecondGuardianForm({...secondGuardianForm, phone: e.target.value})} className={inputCls} placeholder="(00) 00000-0000" />)}
                {field('CPF (Usado no Autoatendimento)', false, <input type="text" value={secondGuardianForm.doc_number} onChange={e => setSecondGuardianForm({...secondGuardianForm, doc_number: e.target.value})} className={inputCls} placeholder="000.000.000-00" />)}
                {field('Grau de Parentesco', true, 
                  <select value={secondGuardianForm.relationship} onChange={e => setSecondGuardianForm({...secondGuardianForm, relationship: e.target.value})} className={inputCls}>
                    <option value="Pai">Pai</option>
                    <option value="Mãe">Mãe</option>
                    <option value="Padrasto">Padrasto</option>
                    <option value="Madrasta">Madrasta</option>
                    <option value="Avô">Avô</option>
                    <option value="Avó">Avó</option>
                    <option value="Outro">Outro</option>
                  </select>
                )}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setIsAddingSecondGuardian(false)} className="px-4 py-2 border border-outline-variant text-on-surface-variant font-bold rounded-lg hover:bg-surface-container text-xs transition">
                  Cancelar
                </button>
                <button type="button" onClick={handleCreateSecondGuardian} disabled={secondGuardianLoading || !secondGuardianForm.name || !secondGuardianForm.email || !secondGuardianForm.password || secondGuardianForm.password.length < 6} className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-container disabled:opacity-50 text-xs transition">
                  {secondGuardianLoading ? 'Salvando...' : 'Salvar 2º Responsável'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingSecondGuardian(true)}
              className="w-full py-4 border-2 border-dashed border-outline-variant rounded-zela-lg text-on-surface-variant font-bold hover:bg-surface-container-low hover:border-indigo-300 hover:text-primary transition flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Cadastrar 2º Responsável
            </button>
          )}
        </div>
      )}

      {/* ── SUBMIT ── */}
      <div className="pt-4 border-t border-outline-variant flex justify-end gap-3">
        {editingUser && (
          <button type="button" onClick={onClose} className="px-6 py-3 border border-outline-variant text-on-surface-variant font-bold rounded-zela-md hover:bg-surface-container-low transition text-sm">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={isLoading}
          className="bg-primary text-white font-bold px-8 py-3.5 rounded-zela-md hover:bg-primary-container transition shadow-md disabled:opacity-70 flex items-center gap-2">
          {isLoading ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Finalizar Cadastro'}
        </button>
      </div>
    </form>
  );

  const secondGuardianConfirmModal = confirmSecondGuardianAction && (
    <ConfirmModal
      title={confirmSecondGuardianAction === 'delete' ? 'Excluir 2º Responsável' : 'Remover vínculo'}
      message={
        confirmSecondGuardianAction === 'delete'
          ? `ATENÇÃO: Isso excluirá permanentemente a conta de ${secondGuardian?.name}. Esta ação não pode ser desfeita.`
          : `Remover o vínculo de ${secondGuardian?.name} com os alunos desta família? O usuário continuará existindo no sistema e poderá ser vinculado a outra família futuramente.`
      }
      danger={confirmSecondGuardianAction === 'delete'}
      isLoading={secondGuardianLoading}
      onConfirm={confirmSecondGuardianAction === 'delete' ? performDeleteSecondGuardian : performRemoveSecondGuardian}
      onCancel={() => setConfirmSecondGuardianAction(null)}
    />
  );

  if (editingUser || forceModal) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-white rounded-zela-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-outline-variant bg-surface-container-low shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
                <UserPlus size={22} />
              </div>
              <div>
                <h2 className="font-bold text-on-surface text-lg">{editingUser ? 'Editar Cadastro do Usuário' : 'Criar Acesso de Login'}</h2>
                <p className="text-xs text-on-surface-variant/70">{editingUser ? 'Atualize as informações do perfil e alunos vinculados' : 'Complete os dados abaixo para criar o acesso ao sistema'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg transition text-on-surface-variant">
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-6 overflow-y-auto flex-1">
            {successMsg && (
              <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-zela-md border border-green-200 flex items-center gap-2 font-medium">
                <CheckCircle2 size={20} /> {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-zela-md border border-red-200 font-medium">{errorMsg}</div>
            )}

            {formContent}
          </div>
        </div>
        {secondGuardianConfirmModal}
      </div>,
      document.body
    );
  }

  return (
    <div className="h-full flex flex-col bg-white p-5 md:p-8 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8 shrink-0">
        <div className="bg-indigo-100 p-3 rounded-zela-md text-primary"><UserPlus size={24} /></div>
        <div>
          <h2 className="text-h3 text-on-surface">Cadastro de Novo Usuário</h2>
          <p className="text-small text-on-surface-variant">Crie perfis para novas Famílias ou Administradores.</p>
        </div>
      </div>

      {/* Scrollable content wrapper */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-6">
        {/* Feedback */}
        {successMsg && (
          <div className="p-4 bg-green-50 text-green-700 rounded-zela-md border border-green-200 flex items-center gap-2 font-medium">
            <CheckCircle2 size={20} /> {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="p-4 bg-red-50 text-red-600 rounded-zela-md border border-red-200 font-medium">{errorMsg}</div>
        )}

        {formContent}
      </div>
      {secondGuardianConfirmModal}
    </div>
  );
}
