const fs = require('fs');
let code = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');

// The line is: if (onSaved) onSaved({ ...newUser, students: studentsToInsert || [] });
// We need to move the declaration of studentsToInsert outside the block, or just change the line.
// We can change it to use a variable declared outside.

code = code.replace(
  `          if (primaryFormData.role === 'family') {
            const studentsToInsert = students
              .filter(s => s.name.trim() !== '')`,
  `          let studentsToInsert = [];
          if (primaryFormData.role === 'family') {
            studentsToInsert = students
              .filter(s => s.name.trim() !== '')`
);

fs.writeFileSync('src/components/AdminUserRegistration.jsx', code);
console.log('Fixed ReferenceError');
