// Validação de "e-mail real" no servidor (a checagem do front é só UX).
//   1. formato válido;
//   2. domínio não descartável (mailinator etc.);
//   3. domínio existe e recebe e-mail (registro MX, ou A como fallback RFC 5321),
//      via DNS-over-HTTPS. Falha de rede/DNS (timeout, 5xx) NÃO bloqueia —
//      só NXDOMAIN / sem MX bloqueia, pra uma queda do resolvedor não impedir
//      cadastros legítimos.
//
// Não prova que a caixa existe (isso exigiria confirmação por código).

const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i

export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'throwawaymail.com', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'getnada.com',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com',
  'emailondeck.com', 'tempail.com', 'tempinbox.com', 'spamgourmet.com', 'moakt.com',
  'discard.email', 'burnermail.io', 'mailnesia.com', 'mytemp.email', 'inboxkitten.com',
  'teste.com', 'test.com', 'example.com', 'example.org', 'email.com.br.teste',
])

// Erros de digitação comuns em provedores populares. Esses domínios "errados"
// muitas vezes existem e têm MX (typosquatting), então só a checagem de DNS não pega.
export const TYPO_DOMAINS: Record<string, string> = {
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
}

export type EmailCheck = { ok: true; email: string } | { ok: false; error: string }

async function dohHasRecords(domain: string, type: 'MX' | 'A'): Promise<boolean | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      { headers: { accept: 'application/dns-json' }, signal: ctrl.signal },
    )
    clearTimeout(t)
    if (!res.ok) return null
    const json = await res.json()
    if (json.Status === 3) return false // NXDOMAIN
    if (json.Status !== 0) return null // SERVFAIL etc. — inconclusivo
    return Array.isArray(json.Answer) && json.Answer.some((a: { type: number }) => a.type === (type === 'MX' ? 15 : 1))
  } catch {
    return null
  }
}

export async function verificarEmailReal(raw: unknown): Promise<EmailCheck> {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (email.length > 254) return { ok: false, error: 'E-mail inválido.' }
  const m = EMAIL_RE.exec(email)
  if (!m) return { ok: false, error: 'E-mail inválido. Confira se digitou corretamente.' }
  const domain = m[1]
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, error: 'Use um e-mail real. E-mails temporários não são aceitos.' }
  }
  if (TYPO_DOMAINS[domain]) {
    return { ok: false, error: `O domínio "${domain}" parece errado. Você quis dizer "${TYPO_DOMAINS[domain]}"?` }
  }
  const mx = await dohHasRecords(domain, 'MX')
  if (mx === true) return { ok: true, email }
  if (mx === false) {
    const a = await dohHasRecords(domain, 'A')
    if (a === false) return { ok: false, error: `O domínio "${domain}" não recebe e-mails. Confira o endereço.` }
    // MX ausente mas A existe (ou inconclusivo): RFC aceita entrega no A.
    return { ok: true, email }
  }
  return { ok: true, email } // DNS inconclusivo — não bloqueia
}
