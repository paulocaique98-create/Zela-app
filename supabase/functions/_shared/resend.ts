// Envio de e-mail via Resend, compartilhado por todas as edge functions.
// RESEND_API_KEY vem de um secret do Supabase (nunca do código-fonte).
//
// IMPORTANTE: enquanto o domínio da escola não estiver verificado no Resend,
// o remetente é o domínio de teste onboarding@resend.dev — nesse modo o
// Resend só entrega e-mails para o endereço dono da conta Resend, não para
// qualquer destinatário real. Depois que um domínio próprio for verificado,
// trocar RESEND_FROM_EMAIL (ou o valor default abaixo) para o remetente
// definitivo (ex: notificacoes@portal.com.br).
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY não configurado' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return { ok: false, error: `Resend respondeu ${res.status}: ${errBody}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
