const fs = require('fs');
let code = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');

// The corrupted block at the top
const corruptedHeader = `      {/* ── SEÇÃO ALUNOS ── */}
      {formData.role === 'family' && activeTab === 'primary' && (
        <div className="space-y-4">
      </div>
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

if (code.startsWith(corruptedHeader)) {
  code = code.substring(corruptedHeader.length);
}

// Now let's fix the actual students section in the code properly.
const studentsSectionStart = code.indexOf('      {/* ── SEÇÃO ALUNOS ── */}');
const messagesAndButtonsIndex = code.indexOf('      {/* ── MENSAGENS E BOTÕES ── */}', studentsSectionStart);
if (studentsSectionStart !== -1 && messagesAndButtonsIndex !== -1) {
  const oldStudentsSection = code.substring(studentsSectionStart, messagesAndButtonsIndex);
  
  if (!oldStudentsSection.includes("activeTab === 'primary'")) {
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
  }
}

fs.writeFileSync('src/components/AdminUserRegistration.jsx', code);
