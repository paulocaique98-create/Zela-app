// CPF e CNPJ (30/09/2026): formatação enquanto digita e conferência dos
// dígitos verificadores. Usado nos dados legais da escola (CNPJ e CPF do
// responsável legal).

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

// "12345678909" → "123.456.789-09"
export function formatarCpf(valor) {
  const d = somenteDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

// "11222333000181" → "11.222.333/0001-81"
export function formatarCnpj(valor) {
  const d = somenteDigitos(valor).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/\/(\d{4})(\d{1,2})$/, '/$1-$2');
}

function digitoCpf(base) {
  const soma = base.split('').reduce((s, n, i) => s + Number(n) * (base.length + 1 - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  return digitoCpf(d.slice(0, 9)) === Number(d[9]) && digitoCpf(d.slice(0, 10)) === Number(d[10]);
}

function digitoCnpj(base) {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split('').reduce((s, n, i) => s + Number(n) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  return digitoCnpj(d.slice(0, 12)) === Number(d[12]) && digitoCnpj(d.slice(0, 13)) === Number(d[13]);
}
