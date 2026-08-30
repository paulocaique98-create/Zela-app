// Cliente HTTP compartilhado do Asaas — usado por qualquer Edge Function que
// precise falar com o gateway financeiro. Endpoints e formatos confirmados
// direto na documentação oficial na Fase 3 (FASE_3_AUDITORIA_ASAAS.md) —
// nada aqui foi inventado.
//
// Multi-tenant (Opção A, decidida pelo usuário): cada escola tem sua
// PRÓPRIA chave Asaas — por isso `createAsaasClient(apiKey)` recebe a
// chave já resolvida pra escola certa (via get_school_gateway_secret() no
// banco) em vez de ler um secret global único. Nunca mais um
// `Deno.env.get('ASAAS_API_KEY')` fixo aqui dentro.
//
// Ambiente: por padrão sandbox (api-sandbox.asaas.com). Só muda pra produção
// se ASAAS_API_BASE_URL for setado explicitamente como secret — nunca por
// engano, sempre por decisão consciente numa fase futura de deploy. Esse é
// o único valor que continua global (sandbox/produção é uma decisão de
// ambiente de deploy, não por escola).

const DEFAULT_BASE_URL = 'https://api-sandbox.asaas.com';

function getBaseUrl(): string {
  return Deno.env.get('ASAAS_API_BASE_URL') || DEFAULT_BASE_URL;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
}

export interface AsaasPayment {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  value: number;
  dueDate: string;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export interface AsaasBoletoIdentification {
  identificationField: string;
  nossoNumero: string;
  barCode: string;
}

export interface AsaasSubscription {
  id: string;
  status: string;
  nextDueDate: string;
}

// Fábrica: recebe a chave JÁ RESOLVIDA pra escola certa e devolve um objeto
// com todas as chamadas amarradas a essa chave — quem usa não precisa
// repassar a chave em toda chamada individual.
export function createAsaasClient(apiKey: string) {
  async function asaasFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Zela-App',
        ...(options.headers || {}),
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.errors?.[0]?.description || body?.message || `Asaas respondeu ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  return {
    createCustomer(input: { name: string; cpfCnpj: string; email?: string; mobilePhone?: string; externalReference?: string }): Promise<AsaasCustomer> {
      return asaasFetch('/v3/customers', { method: 'POST', body: JSON.stringify(input) });
    },

    createPayment(input: {
      customer: string;
      billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
      value: number;
      dueDate: string;
      description?: string;
      externalReference?: string;
    }): Promise<AsaasPayment> {
      return asaasFetch('/v3/payments', { method: 'POST', body: JSON.stringify(input) });
    },

    getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
      return asaasFetch(`/v3/payments/${paymentId}/pixQrCode`, { method: 'GET' });
    },

    getBoletoIdentificationField(paymentId: string): Promise<AsaasBoletoIdentification> {
      return asaasFetch(`/v3/payments/${paymentId}/identificationField`, { method: 'GET' });
    },

    createSubscription(input: {
      customer: string;
      billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
      value: number;
      nextDueDate: string;
      cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
      description?: string;
      externalReference?: string;
    }): Promise<AsaasSubscription> {
      return asaasFetch('/v3/subscriptions', { method: 'POST', body: JSON.stringify(input) });
    },

    // Chamada leve só pra validar que a chave é válida (usada por
    // set-school-gateway-key antes de gravar no Vault).
    ping(): Promise<unknown> {
      return asaasFetch('/v3/customers?limit=1', { method: 'GET' });
    },
  };
}
