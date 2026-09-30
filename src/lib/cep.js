// Busca de endereço pelo CEP (30/09/2026). Usada em todos os formulários de
// endereço (escola, responsável e matrículas): o CEP vem primeiro e, com os
// 8 números, preenche rua, bairro, cidade e UF; a pessoa completa número e
// complemento. Serviços públicos e gratuitos, sem chave: ViaCEP (base dos
// Correios) e, se ele falhar, a BrasilAPI. Tudo continua editável à mão.

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export function somenteDigitosCep(valor) {
  return String(valor ?? '').replace(/\D/g, '').slice(0, 8);
}

// "29050335" → "29050-335" (enquanto digita, só formata o que já tem).
export function formatarCep(valor) {
  const d = somenteDigitosCep(valor);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function cepCompleto(valor) {
  return somenteDigitosCep(valor).length === 8;
}

const limpar = (v) => String(v ?? '').trim();

async function viaCep(cep, fetchImpl) {
  const res = await fetchImpl(`https://viacep.com.br/ws/${cep}/json/`);
  if (!res.ok) throw new Error('indisponivel');
  const d = await res.json();
  if (d?.erro) return null;
  // ibge: código do município, exigido na nota fiscal.
  return { rua: limpar(d.logradouro), bairro: limpar(d.bairro), cidade: limpar(d.localidade), uf: limpar(d.uf).toUpperCase(), ibge: limpar(d.ibge) };
}

async function brasilApi(cep, fetchImpl) {
  const res = await fetchImpl(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('indisponivel');
  const d = await res.json();
  return { rua: limpar(d.street), bairro: limpar(d.neighborhood), cidade: limpar(d.city), uf: limpar(d.state).toUpperCase(), ibge: '' };
}

// Resultado: { status: 'ok', endereco } | { status: 'nao_encontrado' } |
// { status: 'indisponivel' } | { status: 'incompleto' }.
export async function buscarCep(valor, fetchImpl = globalThis.fetch) {
  const cep = somenteDigitosCep(valor);
  if (cep.length !== 8) return { status: 'incompleto' };
  let naoEncontrado = false;
  for (const servico of [viaCep, brasilApi]) {
    try {
      const endereco = await servico(cep, fetchImpl);
      if (endereco && (endereco.cidade || endereco.rua)) return { status: 'ok', endereco };
      naoEncontrado = true;
    } catch {
      // tenta o próximo serviço
    }
  }
  return { status: naoEncontrado ? 'nao_encontrado' : 'indisponivel' };
}

// Junta o que veio do CEP com o que já estava digitado: só troca o que
// veio preenchido (CEP geral de cidade pequena não traz rua nem bairro, e aí
// o que a pessoa já digitou fica).
export function aplicarEndereco(atual, encontrado) {
  const novo = { ...atual };
  for (const campo of ['rua', 'bairro', 'cidade', 'uf']) {
    if (encontrado?.[campo]) novo[campo] = encontrado[campo];
  }
  return novo;
}

// Mesmo texto que o banco monta para a escola (public.montar_endereco).
export function montarEnderecoCompleto({ rua, numero, complemento, bairro, cidade, uf, cep }) {
  const t = (v) => String(v ?? '').trim();
  const linha1 = [t(rua), t(numero), t(complemento)].filter(Boolean).join(', ');
  const cidadeUf = [t(cidade), t(uf)].filter(Boolean).join('/');
  const linha2 = [t(bairro), cidadeUf].filter(Boolean).join(', ');
  return [linha1, linha2, t(cep) ? `CEP ${t(cep)}` : ''].filter(Boolean).join(' · ');
}
