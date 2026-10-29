// Sugestões de conciliação do extrato bancário (PLANO_EXPANSAO_GESTAO.md, item 9).
// Funções puras: só sugerem. Quem dá a baixa é a tela, pela Edge Function existente.

const DIA = 86400000;
const diasEntre = (a, b) => Math.abs(new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / DIA;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Entrada → cobrança em aberto de mesmo valor, vencimento até 20 dias do crédito (mais próxima primeiro).
export function sugerirCobrancas(linha, cobrancasAbertas) {
  if (linha.valor_cents <= 0) return [];
  return cobrancasAbertas
    .filter(c => c.amount_cents === linha.valor_cents && (!linha.data || diasEntre(c.due_date, linha.data) <= 20))
    .sort((a, b) => diasEntre(a.due_date, linha.data) - diasEntre(b.due_date, linha.data));
}

// Saída → despesa aberta de mesmo valor, vencimento ±3 dias. Fornecedor citado na descrição vem primeiro.
export function sugerirDespesas(linha, despesasAbertas, janelaDias = 3) {
  if (linha.valor_cents >= 0) return [];
  const valor = Math.abs(linha.valor_cents);
  const texto = norm(linha.descricao);
  const nomeCitado = (d) => {
    const nome = norm(d.suppliers?.name || d.supplier_name);
    return nome.length >= 3 && texto.includes(nome);
  };
  return despesasAbertas
    .filter(d => d.amount_cents === valor && diasEntre(d.due_date, linha.data) <= janelaDias)
    .sort((a, b) => (nomeCitado(b) - nomeCitado(a)) || (diasEntre(a.due_date, linha.data) - diasEntre(b.due_date, linha.data)));
}

// Repasse do Asaas: um crédito que soma várias cobranças pagas, já descontada a taxa.
// Procura o subconjunto de cobranças (pagas pelo gateway nos dias anteriores ao crédito, ainda sem linha)
// cuja soma bruta fique entre o crédito e o crédito mais a taxa máxima (padrão 6%).
// Devolve a melhor combinação (menor diferença, depois menos cobranças) ou null.
export function sugerirRepasse(linha, cobrancasPagas, { janelaDias = 10, taxaMax = 0.06, maxItens = 8, maxCandidatas = 18 } = {}) {
  if (linha.valor_cents <= 0) return null;
  const alvo = linha.valor_cents;
  const teto = Math.floor(alvo * (1 + taxaMax));
  const cands = cobrancasPagas
    .filter(c => c.paid_at && c.amount_cents <= teto)
    .filter(c => {
      const dias = (new Date(`${linha.data}T12:00:00Z`) - new Date(c.paid_at)) / DIA;
      return dias >= -1 && dias <= janelaDias;
    })
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, maxCandidatas);

  let melhor = null;
  const busca = (i, soma, escolhidas) => {
    if (soma > teto) return;
    if (soma >= alvo && escolhidas.length >= 2) {
      const dif = soma - alvo;
      if (!melhor || dif < melhor.diferenca_cents || (dif === melhor.diferenca_cents && escolhidas.length < melhor.cobrancas.length)) {
        melhor = { cobrancas: escolhidas.slice(), bruto_cents: soma, taxa_cents: dif, diferenca_cents: dif };
      }
    }
    if (escolhidas.length >= maxItens) return;
    for (let j = i; j < cands.length; j++) {
      escolhidas.push(cands[j]);
      busca(j + 1, soma + cands[j].amount_cents, escolhidas);
      escolhidas.pop();
    }
  };
  busca(0, 0, []);
  return melhor;
}

// Saldo conciliado: último saldo informado pelo banco, ou null se não veio no arquivo.
export function saldoDoExtrato(extrato) {
  if (!extrato?.balance || !extrato.balance.date) return null;
  return { data: extrato.balance.date, saldo_cents: extrato.balance.cents };
}

// Linhas do arquivo que ainda não existem no banco (mesmo FITID da conta = já importada).
export function separarNovas(linhasArquivo, fitidsExistentes) {
  const ja = new Set(fitidsExistentes);
  const vistos = new Set();
  const novas = [];
  for (const l of linhasArquivo) {
    if (ja.has(l.id) || vistos.has(l.id)) continue;
    vistos.add(l.id);
    novas.push(l);
  }
  return novas;
}

export const STATUS_LINHA = { pendente: 'Pendente', conciliada: 'Conciliada', ignorada: 'Ignorada' };
