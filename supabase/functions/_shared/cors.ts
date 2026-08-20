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

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}
