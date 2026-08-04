const fs = require('fs');

let code = fs.readFileSync('src/components/AdminUserRegistration.jsx', 'utf8');

// Replace .single() with .maybeSingle() in useEffect
code = code.replace(
  ".eq('linked_family_id', editingUser.id)\n          .single()",
  ".eq('linked_family_id', editingUser.id)\n          .maybeSingle()"
);

// Replace primary user error handling
const oldPrimaryError = `          if (funcError || !newUser || newUser.error) {
            const errMsg = (funcError?.message || newUser?.error || 'Erro ao criar usuário');
            if (errMsg.includes('already registered')) throw new Error('Este e-mail já está em uso.');
            throw new Error(errMsg);
          }`;

const newPrimaryError = `          if (funcError || !newUser || newUser.error) {
            let errMsg = 'Erro ao criar usuário titular.';
            if (funcError) {
              try {
                const errBody = typeof funcError.context?.json === 'function' 
                  ? await funcError.context.json() 
                  : funcError.context;
                errMsg = errBody?.error || errBody?.message || funcError.message;
              } catch(e) { errMsg = funcError.message; }
            } else if (newUser?.error) {
              errMsg = newUser.error;
            }
            if (errMsg?.includes?.('already registered')) throw new Error('Este e-mail já está em uso.');
            throw new Error(errMsg);
          }`;

code = code.replace(oldPrimaryError, newPrimaryError);

// Replace secondary user error handling
const oldSecondaryError = `          if (funcError || !newUser || newUser.error) throw new Error('Erro ao criar usuário secundário.');`;

const newSecondaryError = `          if (funcError || !newUser || newUser.error) {
            let errMsg = 'Erro ao criar usuário secundário.';
            if (funcError) {
              try {
                const errBody = typeof funcError.context?.json === 'function' 
                  ? await funcError.context.json() 
                  : funcError.context;
                errMsg = errBody?.error || errBody?.message || funcError.message;
              } catch(e) { errMsg = funcError.message; }
            } else if (newUser?.error) {
              errMsg = newUser.error;
            }
            if (errMsg?.includes?.('already registered')) throw new Error('Este e-mail já está em uso.');
            throw new Error(errMsg);
          }`;

code = code.replace(oldSecondaryError, newSecondaryError);

fs.writeFileSync('src/components/AdminUserRegistration.jsx', code);
console.log('Fixed supabase bugs');
