import { createAsaasClient } from './asaas.ts';
import { criarClienteAsaas } from './financialContract.ts';

// WhatsApp pelas notificações nativas do Asaas (régua de cobrança, decisão D12 opção a).
// O Asaas manda e cobra o envio na conta da própria escola. Aqui só se liga ou desliga, em cada
// cliente, o campo whatsappEnabledForCustomer das notificações de cobrança criada, véspera e atraso,
// e se garante o celular (mobilePhone) do responsável. O responsável pode desligar (canal 'whatsapp'
// em billing_channel_prefs). O estado aplicado fica em asaas_whatsapp_sync.
export const EVENTOS_WHATSAPP = ['PAYMENT_CREATED', 'PAYMENT_DUEDATE_WARNING', 'PAYMENT_OVERDUE'];

// Celular brasileiro com DDD (11 dígitos, 9 depois do DDD). Fixo não recebe WhatsApp.
export function celularValido(bruto: string | null | undefined): string | null {
  let d = String(bruto || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return /^[1-9]{2}9\d{8}$/.test(d) ? d : null;
}

type Cliente = ReturnType<typeof createAsaasClient>;

// Aplica (desejado = true) ou retira (false) o WhatsApp nas notificações de UM cliente.
export async function aplicarNoCliente(asaas: Cliente, customerId: string, desejado: boolean, celular: string | null) {
  if (desejado && celular) await asaas.updateCustomer(customerId, { mobilePhone: celular });
  const lista = await asaas.listCustomerNotifications(customerId);
  const mudar = (lista.data || [])
    .filter((n) => !n.deleted && EVENTOS_WHATSAPP.includes(n.event) && (desejado ? n.enabled : true) && Boolean(n.whatsappEnabledForCustomer) !== desejado)
    .map((n) => ({ id: n.id as string, whatsappEnabledForCustomer: desejado }));
  if (mudar.length) await asaas.updateNotificationsBatch(customerId, mudar);
}

// deno-lint-ignore no-explicit-any
type Admin = any;

// Sincroniza os clientes de uma escola (ou só os de uma família). Incremental: pula quem já está
// no estado desejado com o mesmo telefone. `limite` protege o tempo da função; `pendentes` diz se
// ainda há o que fazer. Erro de um cliente não derruba os outros.
export async function sincronizarEscola(admin: Admin, schoolId: string, opcoes: { familyId?: string; limite?: number } = {}) {
  const limite = opcoes.limite ?? 40;
  const { data: regra } = await admin.from('billing_rules').select('whatsapp_asaas').eq('school_id', schoolId).maybeSingle();
  const ligado = regra?.whatsapp_asaas === true;

  let q = admin.from('financial_contracts')
    .select('gateway_customer_id, financial_guardian_id')
    .eq('school_id', schoolId).eq('status', 'active').not('gateway_customer_id', 'is', null);
  if (opcoes.familyId) q = q.eq('financial_guardian_id', opcoes.familyId);
  const { data: contratos, error } = await q.limit(2000);
  if (error) throw error;

  const porCliente = new Map<string, string>();
  for (const c of contratos || []) if (!porCliente.has(c.gateway_customer_id)) porCliente.set(c.gateway_customer_id, c.financial_guardian_id);
  const familias = Array.from(new Set(porCliente.values()));
  if (!porCliente.size) return { aplicados: 0, falhas: 0, pendentes: 0 };

  const [usuarios, prefs, estados] = await Promise.all([
    admin.from('users').select('id, phone').in('id', familias),
    admin.from('billing_channel_prefs').select('user_id').in('user_id', familias).eq('canal', 'whatsapp').eq('optou_sair', true),
    admin.from('asaas_whatsapp_sync').select('customer_id, aplicado, telefone').eq('school_id', schoolId),
  ]);
  const fone = new Map((usuarios.data || []).map((u: { id: string; phone: string | null }) => [u.id, celularValido(u.phone)]));
  const saiu = new Set((prefs.data || []).map((p: { user_id: string }) => p.user_id));
  const feito = new Map((estados.data || []).map((e: { customer_id: string; aplicado: boolean; telefone: string | null }) => [e.customer_id, e]));

  // Só mexe no Asaas de quem precisa: ligado com celular e sem opt out, ou com algo aplicado antes que deve sair.
  // Responsável sem celular válido nunca fica "desejado", então não recebe WhatsApp.
  const fila: Array<{ customerId: string; familyId: string; desejado: boolean; celular: string | null }> = [];
  for (const [customerId, familyId] of porCliente) {
    const celular = (fone.get(familyId) as string | null) ?? null;
    const desejado = ligado && !saiu.has(familyId) && celular !== null;
    const antes = feito.get(customerId);
    const precisa = antes ? (antes.aplicado !== desejado || (desejado && antes.telefone !== celular)) : desejado;
    if (precisa) fila.push({ customerId, familyId, desejado, celular });
  }
  if (!fila.length) return { aplicados: 0, falhas: 0, pendentes: 0 };

  const asaas = await criarClienteAsaas(admin, schoolId, createAsaasClient) as Cliente;
  let aplicados = 0; let falhas = 0;
  for (const item of fila.slice(0, limite)) {
    let erro: string | null = null;
    try {
      await aplicarNoCliente(asaas, item.customerId, item.desejado, item.celular);
      aplicados++;
    } catch (e) {
      erro = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      falhas++;
    }
    await admin.from('asaas_whatsapp_sync').upsert({
      school_id: schoolId, customer_id: item.customerId, family_id: item.familyId,
      aplicado: erro === null ? item.desejado : (feito.get(item.customerId)?.aplicado ?? false),
      telefone: item.celular, erro, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'school_id,customer_id' });
  }
  return { aplicados, falhas, pendentes: Math.max(0, fila.length - limite) };
}
