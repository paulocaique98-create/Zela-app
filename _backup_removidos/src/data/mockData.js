export const initialUsers = [
  { id: 'u1', email: 'admin.sensekids@gmail.com', password: 'admin', role: 'admin', name: 'Administrador' },
  { id: 'u2', email: 'familia@demo.com', password: 'demo', role: 'family', name: 'Família Souza', phone: '(11) 99999-9999' }
];

export const initialStudents = [
  { 
    id: 's1', 
    name: 'Ana Beatriz Souza', 
    familyId: 'u2', 
    status: 'idle', // idle | incoming | in_school | leaving | left | absent
    contractedHours: 6,
    todayRecord: { entry: '07:55', exit: null }
  }
];

export const mockHistory = [
  { date: '01/07', entry: '07:55', exit: '13:55', hours: 6, status: 'ok' },
  { date: '02/07', entry: '08:05', exit: '14:20', hours: 6.25, status: 'overtime' },
  { date: '03/07', entry: '07:50', exit: '13:50', hours: 6, status: 'ok' },
  { date: '04/07', entry: '08:10', exit: '15:10', hours: 7, status: 'overtime' },
  { date: '05/07', entry: '07:58', exit: '13:45', hours: 5.8, status: 'ok' },
];

export const initialAuthorized = [
  { id: 'a1', name: 'Marcos Souza', relation: 'Pai', hasPhoto: true, status: 'approved', emergencyOrder: 1 },
  { id: 'a2', name: 'Sônia Souza', relation: 'Avó', hasPhoto: false, status: 'pending', emergencyOrder: 2 },
  { id: 'a3', name: 'Carlos Silva', relation: 'Tio', hasPhoto: false, status: 'approved', temporaryUntil: '07/07/2026' }
];
