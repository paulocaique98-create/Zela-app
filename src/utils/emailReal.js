// Checagem rápida de e-mail no front (UX). A validação definitiva (domínio
// descartável + MX) roda no servidor: supabase/functions/_shared/emailReal.ts.
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'throwawaymail.com', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'getnada.com',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com',
  'emailondeck.com', 'tempail.com', 'tempinbox.com', 'spamgourmet.com', 'moakt.com',
  'discard.email', 'burnermail.io', 'mailnesia.com', 'mytemp.email', 'inboxkitten.com',
  'teste.com', 'test.com', 'example.com', 'example.org',
]);

// Mantido igual a TYPO_DOMAINS de supabase/functions/_shared/emailReal.ts.
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.com.br': 'gmail.com', 'gnail.com': 'gmail.com', 'gmeil.com': 'gmail.com',
  'gamil.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmil.com': 'hotmail.com', 'homail.com': 'hotmail.com', 'hotmeil.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloook.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outluk.com': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'yaho.com.br': 'yahoo.com.br', 'yahoo.com.b': 'yahoo.com.br',
  'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com',
  'uol.com': 'uol.com.br', 'bol.com': 'bol.com.br', 'terra.com': 'terra.com.br',
};

/** Retorna mensagem de erro (string) ou null se o e-mail parece válido. */
export function erroEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  const m = EMAIL_RE.exec(email);
  if (!m || email.length > 254) return 'E-mail inválido. Confira se digitou corretamente.';
  if (DISPOSABLE.has(m[1])) return 'Use um e-mail real. E-mails temporários não são aceitos.';
  if (TYPO_DOMAINS[m[1]]) return `O domínio "${m[1]}" parece errado. Você quis dizer "${TYPO_DOMAINS[m[1]]}"?`;
  return null;
}
