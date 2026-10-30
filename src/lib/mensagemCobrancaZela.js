// Mensagem de WhatsApp com o link da 1ª cobrança do Zela Edu para a escola (envio manual).
// Leva só a 1ª parcela; a implantação já está dentro do link.
import { formatarData } from './planosZela';

export function formatarCnpj(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.length !== 14) return null;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// escola: { school_code, name, cnpj }. cobranca: { invoice_url, vencimento }. aVista: Anual à vista.
// Retorna { ok, mensagem, erro }. Bloqueia sem CNPJ válido ou sem link gerado.
export function gerarMensagemCobranca({ escola, cobranca, aVista = false }) {
  const cnpj = formatarCnpj(escola?.cnpj);
  if (!cnpj) return { ok: false, mensagem: '', erro: 'A escola não tem CNPJ válido cadastrado.' };
  if (!cobranca?.invoice_url) return { ok: false, mensagem: '', erro: 'A cobrança ainda não tem link de pagamento.' };
  const rotulo = aVista ? 'Parcela única' : 'Parcela 1';
  const mensagem = [
    'Segue abaixo o link para realizar o pagamento do pedido:',
    '',
    `${rotulo}: ${cobranca.invoice_url}`,
    `Vencimento: ${formatarData(cobranca.vencimento)}`,
    '',
    'Informações referente ao pedido:',
    `Codigo Negocio: ${escola.school_code}`,
    `Empresa: ${escola.name}`,
    `CPF_CNPJ: ${cnpj}`,
  ].join('\n');
  return { ok: true, mensagem, erro: null };
}
