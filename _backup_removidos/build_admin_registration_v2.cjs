const fs = require('fs');
let code = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');

const oldState = `  const [guardianType, setGuardianType] = useState('Responsável'); // 'Responsável' | 'Responsável Financeiro'
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
  const [errorMsg, setErrorMsg] = useState('');`;

const newState = `  const [resetSent, setResetSent] = useState(false);

  const defaultForm = {
    name: '', email: '', password: '', phone1: '', phone2: '', doc_type: 'CPF', doc_number: '', profession: '', civil_status: '', role: 'family'
  };

  const [activeTab, setActiveTab] = useState('primary'); // 'primary' | 'secondary'
  const [primaryFormData, setPrimaryFormData] = useState(defaultForm);
  const [secondaryFormData, setSecondaryFormData] = useState(defaultForm);
  const [secondaryUserId, setSecondaryUserId] = useState(null);

  const formData = activeTab === 'primary' ? primaryFormData : secondaryFormData;
  const setFormData = (updater) => {
    if (typeof updater === 'function') {
      activeTab === 'primary' ? setPrimaryFormData(updater) : setSecondaryFormData(updater);
    } else {
      activeTab === 'primary' ? setPrimaryFormData(updater) : setSecondaryFormData(updater);
    }
  };
  
  const guardianType = activeTab === 'primary' ? 'Responsável Financeiro' : 'Responsável';

  const [students, setStudents] = useState([emptyStudent()]);

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');`;

code = code.replace(oldState, newState);

const oldEffect = `  useEffect(() => {
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
  }, [editingUser]);`;

const newEffect = `  useEffect(() => {
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
        supabase
          .from('users')
          .select('*')
          .eq('linked_family_id', editingUser.id)
          .single()
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
  }, [editingUser]);`;

code = code.replace(oldEffect, newEffect);


const oldSubmit = code.substring(code.indexOf('  const handleSubmit = async (e) => {'), code.indexOf('  const inputCls =') - 2);

const newSubmit = `  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (activeTab === 'primary') {
        if (editingUser) {
          // 1. Atualizar usuário titular
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

          // Atualizar alunos vinculados
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
                ? \`\${s.custom_entry} às \${s.custom_exit}\`
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
                entryTime = \`\${s.custom_entry}:00\`;
                exitTime = \`\${s.custom_exit}:00\`;
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
          // Criar novo titular
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
            const errMsg = (funcError?.message || newUser?.error || 'Erro ao criar usuário');
            if (errMsg.includes('already registered')) throw new Error('Este e-mail já está em uso.');
            throw new Error(errMsg);
          }

          if (primaryFormData.role === 'family') {
            const studentsToInsert = students
              .filter(s => s.name.trim() !== '')
              .map(s => {
                const periodStr = s.is_custom_period ? \`\${s.custom_entry} às \${s.custom_exit}\` : s.periodo;
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

          setSuccessMsg('Cadastro realizado com sucesso!');
          if (onClose) setTimeout(() => onClose(), 1500);
        }
      } else if (activeTab === 'secondary') {
        // Salvar Secundário
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
            linked_family_id: editingUser.id
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

          if (funcError || !newUser || newUser.error) throw new Error('Erro ao criar usuário secundário.');
          
          setSecondaryUserId(newUser.id);
          setSuccessMsg('Secundário criado com sucesso!');
        }
      }

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Ocorreu um erro ao salvar os dados.');
    } finally {
      setIsLoading(false);
    }
  };
`;
code = code.replace(oldSubmit, newSubmit);

const oldFormContent = code.substring(code.indexOf('  const formContent = ('), code.indexOf('      {/* ── SEÇÃO 2: DADOS DO RESPONSÁVEL ── */}'));

const newFormContent = `  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── SEÇÃO 1: TIPO DE CONTA ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
          1. Tipo de Conta
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {activeTab === 'primary' && field('Perfil do Usuário', true,
            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className={inputCls} disabled={!!editingUser}>
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
                  className={\`flex-1 py-3 px-3 rounded-xl text-xs font-bold border-2 transition-all \${activeTab === 'primary' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'}\`}>
                  Responsável Financeiro
                </button>
                <button type="button"
                  disabled={!editingUser} // Desabilita aba secundária se for novo cadastro
                  title={!editingUser ? "Salve o titular primeiro" : ""}
                  onClick={() => setActiveTab('secondary')}
                  className={\`flex-1 py-3 px-3 rounded-xl text-xs font-bold border-2 transition-all \${activeTab === 'secondary' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'} \${!editingUser ? 'opacity-50 cursor-not-allowed' : ''}\`}>
                  Responsável
                </button>
              </div>
              {!editingUser && (
                <p className="text-[10px] text-amber-600 mt-2 font-medium bg-amber-50 p-2 rounded-lg border border-amber-100">
                  ⚠️ Cadastre o Responsável Financeiro primeiro. Após salvar, edite o cadastro para adicionar o segundo responsável.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

`;
code = code.replace(oldFormContent, newFormContent);

const oldStudentsSection = code.substring(code.indexOf('      {/* ── SEÇÃO ALUNOS ── */}'), code.indexOf('      {/* ── MENSAGENS E BOTÕES ── */}'));
const newStudentsSection = `      {/* ── SEÇÃO ALUNOS ── */}
      {formData.role === 'family' && activeTab === 'primary' && (
        <div className="space-y-4">
` + oldStudentsSection.substring(oldStudentsSection.indexOf('          <h3 className="text-sm font-bold'), oldStudentsSection.lastIndexOf('      </div>')) + `      </div>
      )}

      {formData.role === 'family' && activeTab === 'secondary' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
            <GraduationCap size={14} /> 3. Alunos Vinculados
          </h3>
          <div className="p-4 bg-purple-50 text-purple-700 text-xs font-medium rounded-xl border border-purple-100 italic">
            O responsável secundário herda automaticamente os mesmos alunos do Responsável Financeiro. Não é necessário vinculá-los novamente.
          </div>
        </div>
      )}

`;
code = code.replace(oldStudentsSection, newStudentsSection);

fs.writeFileSync('src/components/AdminUserRegistration.jsx', code);
