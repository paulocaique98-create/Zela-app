const fs = require('fs');
let code = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');

// Chunk 1: State
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
  const [errorMsg, setErrorMsg] = useState('');

  const [linkedFamilyId, setLinkedFamilyId] = useState('');
  const [primaryFamilies, setPrimaryFamilies] = useState([]);`;

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
  const isSecondary = activeTab === 'secondary';

  const [students, setStudents] = useState([emptyStudent()]);

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');`;

code = code.replace(oldState, newState);

// Chunk 2: useEffect
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
      if (editingUser.linked_family_id) {
        setGuardianType('Responsável');
        setLinkedFamilyId(editingUser.linked_family_id);
      } else {
        setGuardianType(editingUser.guardian_type || 'Responsável Financeiro');
        setLinkedFamilyId('');
      }
    } else {
      setStudents([emptyStudent()]);
      setGuardianType('Responsável Financeiro');
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

// Chunk 3: fetchPrimaryFamilies remove
const oldFetch = `  useEffect(() => {
    // Busca famílias titulares para popular o dropdown
    const fetchPrimaryFamilies = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'family')
        .is('linked_family_id', null)
        .eq('school_id', currentUser.school_id)
        .order('name');
      if (data && !error) {
        setPrimaryFamilies(data);
      }
    };
    fetchPrimaryFamilies();
  }, [currentUser.school_id]);`;

code = code.replace(oldFetch, '');

// Chunk 4: isSecondary
const oldIsSecondary = `  const isSecondary = formData.role === 'family' && guardianType === 'Responsável';`;
code = code.replace(oldIsSecondary, '');


// Chunk 5: handleSubmit
// We need to change the editing logic.
// If activeTab === 'secondary' AND secondaryUserId is set => update secondary user.
// If activeTab === 'secondary' AND secondaryUserId is null => create secondary user.
// Let's replace the whole handleSubmit? It's huge. 
// Instead, let's just make the changes with targeted replacements.

fs.writeFileSync('src/components/AdminUserRegistration.jsx', code);
