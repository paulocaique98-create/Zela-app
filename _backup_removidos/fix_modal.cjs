const fs = require('fs');
let code = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');

// 1. Add handleCloseModal
const handleCloseModal = `
  const handleCloseModal = () => {
    setActiveTab('primary');
    setPrimaryFormData(defaultForm);
    setSecondaryFormData(defaultForm);
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(false);
    onClose();
  };
`;

code = code.replace(
  "  const [errorMsg, setErrorMsg] = useState('');",
  "  const [errorMsg, setErrorMsg] = useState('');\n" + handleCloseModal
);

// 2. Replace onClose with handleCloseModal in the Cancelar button and remove disabled
code = code.replace(
  `        <button type="button" onClick={onClose} disabled={isLoading}`,
  `        <button type="button" onClick={handleCloseModal}`
);

// 3. Replace onClose with handleCloseModal in the X button and add type="button"
code = code.replace(
  `          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">`,
  `          <button type="button" onClick={handleCloseModal} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">`
);

// Write back
fs.writeFileSync('src/components/AdminUserRegistration.jsx', code);
console.log('Fixed buttons');
