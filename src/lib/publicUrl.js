// Endereço público do Zela para links que SAEM do aparelho (e-mail de
// redefinição de senha, convite, link de matrícula copiado pelo Admin).
// Antes usava window.location.origin: num link de pré-visualização da
// Vercel, ou dentro do app nativo (onde vira capacitor://localhost), o link
// gerado apontava para o lugar errado. Configurável por VITE_PUBLIC_APP_URL;
// sem a variável, continua o comportamento de antes.
export function publicAppUrl(path = '/') {
  const base = (import.meta.env.VITE_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
