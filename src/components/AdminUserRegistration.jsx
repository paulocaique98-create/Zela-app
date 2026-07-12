import React, { useState } from 'react';
import { UserPlus, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { supabase, supabaseAuthHelper } from '../lib/supabase';
import { TURMAS } from './AdminDailyPresence';

export default function AdminUserRegistration({ currentUser }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'family'
  });
  
  const [students, setStudents] = useState([
    { id: 1, name: '', contracted_hours: 6, turma: '' }
  ]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleAddStudent = () => {
    setStudents([...students, { id: Date.now(), name: '', contracted_hours: 6 }]);
  };

  const handleRemoveStudent = (id) => {
    if (students.length > 1) {
      setStudents(students.filter(s => s.id !== id));
    }
  };

  const handleStudentChange = (id, field, value) => {
    setStudents(students.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Criar o Usuário no Supabase Auth usando o cliente helper
      const { data: authData, error: authError } = await supabaseAuthHelper.auth.signUp({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            role: formData.role,
            school_id: currentUser.school_id
          }
        }
      });

      if (authError) throw authError;

      const authUser = authData.user;
      if (!authUser) throw new Error('Erro ao criar usuário no sistema de autenticação.');

      // 2. Criar o Usuário no banco (tabela users pública) com o ID da Auth
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([{
          id: authUser.id,
          name: formData.name,
          email: formData.email.trim().toLowerCase(),
          password: '', // Não salvar senha em texto plano no banco
          phone: formData.phone,
          role: formData.role,
          school_id: currentUser.school_id
        }])
        .select()
        .single();

      if (userError) {
        if (userError.code === '23505') throw new Error('Este e-mail já está em uso.');
        throw userError;
      }

      // 2. Criar os Estudantes vinculados a esta Família
      if (formData.role === 'family') {
        const studentsToInsert = students
          .filter(s => s.name.trim() !== '')
          .map(s => ({
            name: s.name,
            contracted_hours: parseFloat(s.contracted_hours),
            turma: s.turma || null,
            family_id: newUser.id,
            status: 'idle',
            school_id: currentUser.school_id
          }));

        if (studentsToInsert.length > 0) {
          const { error: studentsError } = await supabase
            .from('students')
            .insert(studentsToInsert);
          
          if (studentsError) throw studentsError;
        }

        // 3. Adicionar o próprio titular da conta como primeira Pessoa Autorizada
        const { error: authError } = await supabase
          .from('authorized_persons')
          .insert([{
            family_id: newUser.id,
            name: newUser.name, // Nome que o administrador digitou no cadastro
            relation: 'Responsável (Titular)',
            has_photo: false,
            status: 'approved',
            emergency_order: 1,
            school_id: currentUser.school_id
          }]);

        if (authError) throw authError;
      }

      setSuccessMsg('Usuário e estudantes cadastrados com sucesso!');
      
      // Reset form
      setFormData({ name: '', email: '', password: '', phone: '', role: 'family' });
      setStudents([{ id: Date.now(), name: '', contracted_hours: 0, turma: '' }]);
      
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Ocorreu um erro ao cadastrar o usuário.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600">
          <UserPlus size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Cadastro de Novo Usuário</h2>
          <p className="text-sm text-slate-500">Crie perfis para novas Famílias ou Administradores.</p>
        </div>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center gap-2 font-medium">
          <CheckCircle2 size={20} /> {successMsg}
        </div>
      )}
      
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 font-medium">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* DADOS DA CONTA */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">1. Dados da Conta</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Perfil</label>
              <select 
                value={formData.role} 
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
              >
                <option value="family">Família / Responsáveis</option>
                <option value="admin">Administrador (Equipe)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo / Identificação</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Ex: Família Silva" />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail de Acesso</label>
              <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="email@exemplo.com" />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Senha Provisória</label>
              <input type="text" required minLength={4} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Senha de acesso" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone (Opcional)</label>
              <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="(11) 90000-0000" />
            </div>
          </div>
        </div>

        {/* ALUNOS VINCULADOS */}
        {formData.role === 'family' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex justify-between items-center">
              <span>2. Alunos Vinculados</span>
              <button type="button" onClick={handleAddStudent} className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-bold bg-indigo-50 px-2 py-1 rounded-md">
                <Plus size={14}/> Adicionar Aluno
              </button>
            </h3>
            
            <div className="space-y-3">
              {students.map((student, index) => (
                <div key={student.id} className="flex flex-col md:flex-row gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl relative group">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome do Aluno {index + 1}</label>
                    <input type="text" required value={student.name} onChange={e => handleStudentChange(student.id, 'name', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Nome completo do aluno" />
                  </div>
                  <div className="w-full md:w-40">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Turma</label>
                    <select
                      value={student.turma}
                      onChange={e => handleStudentChange(student.id, 'turma', e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    >
                      <option value="">Selecionar...</option>
                      {TURMAS.filter(t => t !== 'Todas').map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full md:w-36">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Plano de Horas/Dia</label>
                    <div className="flex items-center gap-2">
                      <input type="number" required min="1" max="12" step="0.5" value={student.contracted_hours} onChange={e => handleStudentChange(student.id, 'contracted_hours', e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                      {students.length > 1 && (
                         <button type="button" onClick={() => handleRemoveStudent(student.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Remover aluno">
                           <Trash2 size={18}/>
                         </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button type="submit" disabled={isLoading} className="bg-indigo-600 text-white font-bold px-8 py-3.5 rounded-xl hover:bg-indigo-700 transition shadow-md disabled:opacity-70 flex items-center gap-2">
            {isLoading ? 'Salvando...' : 'Finalizar Cadastro'}
          </button>
        </div>
      </form>
    </div>
  );
}
