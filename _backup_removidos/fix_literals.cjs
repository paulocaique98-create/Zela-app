const fs = require('fs');
let code1 = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');
code1 = code1.split('\\\\\\`').join('`');
code1 = code1.split('\\\\\\$').join('$');
code1 = code1.split('\\`').join('`');
code1 = code1.split('\\$').join('$');
fs.writeFileSync('src/components/AdminUserRegistration.jsx', code1);

let code2 = fs.readFileSync('src/components/AdminUserManagement.jsx', 'utf8');
code2 = code2.split('\\\\\\`').join('`');
code2 = code2.split('\\\\\\$').join('$');
code2 = code2.split('\\`').join('`');
code2 = code2.split('\\$').join('$');
fs.writeFileSync('src/components/AdminUserManagement.jsx', code2);
console.log('Fixed literals');
