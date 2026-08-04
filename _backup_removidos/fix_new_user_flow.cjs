const fs = require('fs');

let code = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');

// Add primaryUserId state
code = code.replace(
  'const [secondaryUserId, setSecondaryUserId] = useState(null);',
  'const [secondaryUserId, setSecondaryUserId] = useState(null);\n  const [primaryUserId, setPrimaryUserId] = useState(editingUser ? editingUser.id : null);'
);

// handleCloseModal reset
code = code.replace(
  "setIsLoading(false);",
  "setIsLoading(false);\n    setPrimaryUserId(editingUser ? editingUser.id : null);"
);

// Replace editingUser.id with primaryUserId for secondary user linking
code = code.replace(/linked_family_id:\s*editingUser\.id/g, 'linked_family_id: primaryUserId');
code = code.replace(/linked_family_id:\s*editingUser\?.id/g, 'linked_family_id: primaryUserId');

// Update UI conditions for disabled/locking secondary tab based on primaryUserId
code = code.replace(/disabled={!!editingUser}/g, 'disabled={!!primaryUserId}');
code = code.replace(/disabled={!editingUser}/g, 'disabled={!primaryUserId}');
code = code.replace(/title={!editingUser \? "Salve o titular primeiro" : ""}/g, 'title={!primaryUserId ? "Salve o titular primeiro" : ""}');
code = code.replace(/\{!editingUser \? 'opacity-50 cursor-not-allowed' : ''\}/g, '{!primaryUserId ? \'opacity-50 cursor-not-allowed\' : \'\'}');
code = code.replace(/\{!editingUser && \(/g, '{!primaryUserId && (');
code = code.replace(/\(\(!editingUser && activeTab === 'primary'\)/g, '((!primaryUserId && activeTab === \'primary\')');

// Remove setTimeout and set the primaryUserId when titular is created
const oldSuccessBlock = `          // Importante: Passamos a estar "editando" o usuário recém criado, 
          // para liberar a aba do secundário sem precisar reabrir o modal!
          // Isso requer fechar o modal, ou a prop editingUser vir do pai.
          // Para não complicar o estado do pai, vamos apenas fechar.
          setTimeout(() => onClose(), 2500);`;

const newSuccessBlock = `          setPrimaryUserId(newUser.id);`;

code = code.replace(oldSuccessBlock, newSuccessBlock);

fs.writeFileSync('src/components/AdminUserRegistration.jsx', code);
console.log('Fixed new user flow');
