import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, Plus, Trash2, Baby, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TURMAS } from '../lib/constants';
import { navigateTo } from '../utils/navigate';

// Tela pública de autocadastro de Responsável — chega aqui por "/cadastro",
// sem estar logado (ver App.jsx, mesmo padrão de rota pública já usado por
// ResetPassword.jsx). Espelha os campos de Responsável + Alunos de
// AdminUserRegistration.jsx, mas só cria papel 'family' e a conta fica
// pendente até um admin aprovar (Edge Function self-register-family).

const CICLOS = [6, 8, 10];
const TURNOS_POR_CICLO = {
  6: ['Matutino', 'Vespertino'],
  8: ['Matutino', 'Vespertino'],
  10: ['Matutino', 'Vespertino'],
};
const PERIODOS_POR_CICLO_TURNO = {
  6: { Matutino: ['07:00 às 13:00'], Vespertino: ['13:00 às 19:00'] },
  8: { Matutino: ['07:00 às 15:00'], Vespertino: ['11:00 às 19:00', '13:00 às 19:00'] },
  10: { Matutino: ['07:00 às 17:00', '09:00 às 19:00'] },
};
const DOC_TYPES = ['CPF', 'RG', 'CNH', 'Passaporte'];
const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Separado(a)', 'Divorciado(a)', 'Viúvo(a)'];

const emptyStudent = () => ({
  id: Date.now() + Math.random(),
  name: '', birth_date: '', turma: '', ciclo: '', turno: '', periodo: '',
  custom_entry: '', custom_exit: '', is_custom_period: false,
});

const inputCls = 'w-full p-3 bg-surface-container-lowest border border-outline-variant/60 rounded-zela-md focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none text-sm font-medium transition-all';
const labelCls = 'block text-xs font-semibold text-on-surface mb-1';

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

  return (
    <div className="p-4 bg-surface-container-low border border-outline-variant rounded-zela-lg space-y-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nome Completo *</label>
          <input type="text" required value={student.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Nome do aluno" />
        </div>
        <div>
          <label className={labelCls}>Data de Nascimento *</label>
          <input type="date" required value={student.birth_date} onChange={e => set('birth_date', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Turma</label>
          <select value={student.turma} onChange={e => set('turma', e.target.value)} className={inputCls}>
            <option value="">Selecionar...</option>
            {TURMAS.filter(t => t !== 'Todas as Turmas').map(t => <option key={t} value={t}>{t}</option>)}
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
          <select required value={student.turno} onChange={e => set('turno', e.target.value)} disabled={!student.ciclo}
            className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}>
            <option value="">{student.ciclo ? 'Selecionar...' : '← Primeiro o Ciclo'}</option>
            {turnos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Período *</label>
        <select required value={student.is_custom_period ? '__custom__' : student.periodo} onChange={e => set('periodo', e.target.value)}
          disabled={!student.turno} className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}>
          <option value="">{student.turno ? 'Selecionar...' : '← Primeiro o Turno'}</option>
          {periodos.map(p => <option key={p} value={p}>{p}</option>)}
          {student.turno && <option value="__custom__">✏️ Personalizar Horário</option>}
        </select>
      </div>

      {student.is_custom_period && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-primary/10 border border-primary/20 rounded-zela-md">
          <div>
            <label className={labelCls}>Entrada *</label>
            <input type="time" required value={student.custom_entry} onChange={e => set('custom_entry', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Saída *</label>
            <input type="time" required value={student.custom_exit} onChange={e => set('custom_exit', e.target.value)} className={inputCls} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function SelfRegister() {
  const [schoolCode, setSchoolCode] = useState('');
  const [guardianType, setGuardianType] = useState('Responsável');
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', phone: '',
    doc_type: 'CPF', doc_number: '', profession: '', civil_status: '',
  });
  const [students, setStudents] = useState([emptyStudent()]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  const handleAddStudent = () => setStudents(prev => [...prev, emptyStudent()]);
  const handleRemoveStudent = (id) => setStudents(prev => prev.filter(s => s.id !== id));
  const handleStudentChange = (id, patch) => setStudents(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const studentsPayload = students.map(s => ({
        name: s.name,
        birth_date: s.birth_date,
        turma: s.turma || null,
        contracted_hours: s.ciclo ? parseFloat(s.ciclo) : 6,
        turno: s.turno || null,
        periodo: s.is_custom_period ? `${s.custom_entry} às ${s.custom_exit}` : (s.periodo || null),
      }));

      const { data, error } = await supabase.functions.invoke('self-register-family', {
        body: {
          school_code: schoolCode,
          name: formData.name,
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          phone: formData.phone,
          doc_type: formData.doc_type,
          doc_number: formData.doc_number,
          profession: formData.profession,
          civil_status: formData.civil_status,
          guardian_type: guardianType,
          students: studentsPayload,
        },
      });

      if (error || !data || data.error) {
        // supabase-js não anexa o corpo JSON da resposta em `data` quando a
        // Edge Function retorna status != 2xx — a mensagem real (ex: "Código
        // de escola inválido") vem em error.context (a Response bruta), não
        // em error.message (que é só um texto genérico do SDK).
        let serverMsg = data?.error;
        if (!serverMsg && error?.context && typeof error.context.json === 'function') {
          try {
            const body = await error.context.json();
            serverMsg = body?.error;
          } catch {
            // corpo não era JSON — segue com a mensagem genérica abaixo
          }
        }
        throw new Error(serverMsg || error?.message || 'Erro ao enviar cadastro.');
      }

      setDone(true);
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao enviar cadastro. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex w-full relative overflow-hidden bg-surface-container-lowest">
      <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-primary/5 blur-3xl pointer-events-none mix-blend-multiply" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-secondary/5 blur-3xl pointer-events-none mix-blend-multiply" />

      <div className="w-full flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-2xl flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary-container rounded-zela-lg flex items-center justify-center shadow-sm">
              <ShieldCheck className="text-white" size={20} />
            </div>
            <span className="text-h2 text-on-surface tracking-tight leading-none">Zela</span>
          </div>

          {done ? (
            <div className="bg-white border border-outline-variant rounded-zela-lg p-8 text-center flex flex-col items-center gap-4">
              <CheckCircle2 className="text-emerald-500" size={48} />
              <div>
                <h1 className="text-h2 text-on-surface mb-2">Cadastro enviado!</h1>
                <p className="text-body text-on-surface-variant">
                  Seu cadastro foi recebido e está aguardando aprovação da escola.
                  Você receberá acesso assim que for aprovado.
                </p>
              </div>
              <button type="button" onClick={() => navigateTo('/')} className="mt-2 text-small text-primary font-medium hover:underline underline-offset-4">
                Voltar para o login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h1 className="text-h1-mobile lg:text-display text-on-surface mb-1 tracking-tight">Novo cadastro</h1>
                  <p className="text-body text-on-surface-variant">Crie seu acesso de Responsável e vincule seus filhos.</p>
                </div>
                <button type="button" onClick={() => navigateTo('/')} className="flex items-center gap-1 text-small text-on-surface-variant hover:text-primary shrink-0">
                  <ArrowLeft size={16} /> Voltar
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-6 bg-white border border-outline-variant rounded-zela-lg p-6">
                {/* Código da escola */}
                <div>
                  <label className={labelCls}>Código da Escola *</label>
                  <input
                    type="text"
                    required
                    value={schoolCode}
                    onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                    className={inputCls}
                    placeholder="Ex: ZL001"
                  />
                  <p className="text-[11px] text-on-surface-variant/70 mt-1">Peça esse código à secretaria da escola.</p>
                </div>

                {/* Tipo de responsável */}
                <div>
                  <label className={labelCls}>Tipo de Responsável *</label>
                  <div className="flex gap-2">
                    {['Responsável', 'Responsável Financeiro'].map(t => (
                      <button key={t} type="button" onClick={() => setGuardianType(t)}
                        className={`flex-1 py-3 px-3 rounded-zela-md text-xs font-bold border-2 transition-all ${guardianType === t ? 'bg-primary text-white border-indigo-600' : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dados pessoais */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-on-surface-variant/70 uppercase tracking-wider border-b border-outline-variant pb-2">
                    Seus dados
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Nome Completo *</label>
                      <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="Nome completo" />
                    </div>
                    <div>
                      <label className={labelCls}>E-mail *</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={18} />
                        <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className={`${inputCls} pl-10`} placeholder="seu@email.com" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Senha *</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={18} />
                        <input type="password" required minLength={6} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className={`${inputCls} pl-10`} placeholder="Mínimo 6 caracteres" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Telefone</label>
                      <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className={inputCls} placeholder="(11) 90000-0000" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>Tipo de Documento</label>
                      <select value={formData.doc_type} onChange={e => setFormData({ ...formData, doc_type: e.target.value })} className={inputCls}>
                        {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Número do Documento</label>
                      <input type="text" value={formData.doc_number} onChange={e => setFormData({ ...formData, doc_number: e.target.value })} className={inputCls} placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <label className={labelCls}>Estado Civil</label>
                      <select value={formData.civil_status} onChange={e => setFormData({ ...formData, civil_status: e.target.value })} className={inputCls}>
                        <option value="">Selecionar...</option>
                        {ESTADO_CIVIL.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Profissão</label>
                    <input type="text" value={formData.profession} onChange={e => setFormData({ ...formData, profession: e.target.value })} className={inputCls} placeholder="Ex: Engenheira" />
                  </div>
                </div>

                {/* Alunos */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-on-surface-variant/70 uppercase tracking-wider border-b border-outline-variant pb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2"><Baby size={14} /> Alunos vinculados</span>
                    <button type="button" onClick={handleAddStudent}
                      className="text-primary hover:text-indigo-800 flex items-center gap-1 text-xs font-bold bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition">
                      <Plus size={13} /> Adicionar Aluno
                    </button>
                  </h3>
                  <div className="space-y-4">
                    {students.map((student, idx) => (
                      <StudentCard key={student.id} student={student} index={idx} onChange={handleStudentChange} onRemove={handleRemoveStudent} canRemove={students.length > 1} />
                    ))}
                  </div>
                </div>

                {errorMsg && <div className="p-3 bg-red-50 text-error text-small rounded-zela-md border border-red-100">{errorMsg}</div>}

                <button type="submit" disabled={isLoading}
                  className="w-full bg-primary hover:bg-primary-container text-white text-body font-bold py-3.5 rounded-zela-md shadow-md hover:shadow-lg transition-all disabled:opacity-70">
                  {isLoading ? 'Enviando...' : 'Enviar cadastro'}
                </button>
                <p className="text-[11px] text-on-surface-variant/70 text-center -mt-2">
                  Seu acesso será liberado após aprovação da escola.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
