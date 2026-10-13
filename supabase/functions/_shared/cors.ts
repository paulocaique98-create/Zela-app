// CORS compartilhado por todas as edge functions do Zela.
// Access-Control-Allow-Origin só aceita UM valor por resposta (não uma lista), então
// refletimos o Origin da requisição apenas se ele estiver na allowlist — em vez do
// '*' anterior, que permitia qualquer site do mundo chamar functions que lidam com
// dados sensíveis (criação/exclusão de usuário, push notifications, biometria).
const ALLOWED_ORIGINS = [
  'https://sensekids.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
];

// Origens extras (ex.: app nativo Capacitor: https://localhost no Android,
// capacitor://localhost no iOS) vêm do secret EXTRA_ALLOWED_ORIGINS, separadas
// por vírgula. Assim a produção só as aceita quando o secret for definido lá,
// na hora do release do app. Nunca '*'.
const EXTRA_ORIGINS = (Deno.env.get('EXTRA_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter((o) => o && o !== '*');

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = [...ALLOWED_ORIGINS, ...EXTRA_ORIGINS];
  const allowOrigin = allowed.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}
