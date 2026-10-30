// Nota fiscal de serviço (item 15). Funções puras da tela de configuração fiscal da escola.
// Não existe alíquota padrão: ISS vem vazio e só a escola, com a contabilidade, informa.

export const STATUS_NOTA = {
  SCHEDULED: { texto: 'Agendada', tom: 'neutro' },
  SYNCHRONIZED: { texto: 'Enviada à prefeitura', tom: 'neutro' },
  AUTHORIZED: { texto: 'Emitida', tom: 'ok' },
  PROCESSING_CANCELLATION: { texto: 'Cancelando', tom: 'alerta' },
  CANCELED: { texto: 'Cancelada', tom: 'neutro' },
  CANCELLATION_DENIED: { texto: 'Cancelamento negado', tom: 'alerta' },
  ERROR: { texto: 'Com erro', tom: 'alerta' },
};

export function rotuloDaNota(status) {
  return STATUS_NOTA[status] || { texto: 'Em andamento', tom: 'neutro' };
}

// "2,5" ou "2.5" vira 2.5; vazio vira null; fora de 0 a 100 ou texto inválido vira NaN.
export function lerPercentual(valor) {
  const t = String(valor ?? '').trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return NaN;
  const n = Number(t);
  return n >= 0 && n <= 100 ? n : NaN;
}

export function cepLimpo(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

// O que falta no cadastro da escola para a nota poder ser ligada (vive em schools).
export function pendenciasDaEscola(escola) {
  const falta = [];
  if (!/^[0-9]{7}$/.test(String(escola?.codigo_ibge ?? ''))) falta.push('código do município (IBGE)');
  if (!String(escola?.inscricao_municipal ?? '').trim()) falta.push('inscrição municipal');
  return falta;
}

export const CAMPOS_ALIQUOTA = [
  { chave: 'iss_percent', rotulo: 'ISS (%)', obrigatorio: true },
  { chave: 'pis_percent', rotulo: 'PIS (%)' },
  { chave: 'cofins_percent', rotulo: 'COFINS (%)' },
  { chave: 'csll_percent', rotulo: 'CSLL (%)' },
  { chave: 'inss_percent', rotulo: 'INSS (%)' },
  { chave: 'ir_percent', rotulo: 'IR (%)' },
];

// Converte o formulário (textos) no registro de school_fiscal_config. Lança Error em português.
export function montarConfigFiscal(form, { confirmar, ativar }) {
  const servicoId = String(form.municipal_service_id ?? '').trim();
  const servicoNome = String(form.municipal_service_name ?? '').trim();
  const out = {
    municipal_service_id: servicoId || null,
    municipal_service_name: servicoNome || null,
    observacoes: String(form.observacoes ?? '').trim() || null,
    retain_iss: form.retain_iss === true,
    emitir_avulsas: form.emitir_avulsas === true,
  };
  for (const c of CAMPOS_ALIQUOTA) {
    const n = lerPercentual(form[c.chave]);
    if (Number.isNaN(n)) throw new Error(`${c.rotulo}: use um número de 0 a 100, com até 2 casas.`);
    if (c.chave === 'iss_percent') out[c.chave] = n;
    else out[c.chave] = n ?? 0;
  }
  if ((confirmar || ativar) && (!servicoId || !servicoNome)) throw new Error('Escolha o serviço da nota na lista do município.');
  if ((confirmar || ativar) && out.iss_percent === null) throw new Error('Informe o ISS para confirmar. Em caso de dúvida, fale com a contabilidade.');
  return out;
}
