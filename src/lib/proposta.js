// Proposta comercial do Zela (menu Propostas do Portal do Dev). Monta só os dados;
// o PDF é desenhado em propostaPdf.js. Os valores usam as mesmas regras de
// planosZela.js e nada é gravado: a proposta é uma prévia gerada na hora.
import { ITEM_POR_ID } from './modulosCatalogo';
import {
  CICLO_POR_ID, itensValidos, extrasDoPacote, mensalidade, valorDoCiclo, descontoMensalidade, implantacaoBase, implantacaoFinal, CONFIG_PADRAO,
} from './planosZela';
import { linkWhatsapp } from './captacao';

export const SOBRE_ZELA = 'O Zela é uma plataforma de gestão e segurança escolar. Reúne em um só lugar a entrada e saída dos alunos com reconhecimento facial, a comunicação com as famílias, a rotina e o pedagógico, e o financeiro da escola. Cada escola tem seus dados isolados e o acesso é separado por perfil: recepção, gestão, professores e famílias.';

const dataBr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

// Texto de tela e de PDF não usa hífen: telefone sai só com números e espaços.
export const semHifen = (s) => String(s || '').replace(/\s*[-–—]\s*/g, ' ').replace(/\s+/g, ' ').trim();

function itemDaProposta(id) {
  const it = ITEM_POR_ID[id];
  return { id, nome: it.nome, grupo: it.grupo, resumo: it.resumo, inclui: (it.inclui || []).map(i => ({ nome: i.nome, desc: i.desc })) };
}

export function montarProposta({
  cliente, plano, ciclo, alunos, escolhidos = [], extras = [], precos, config = CONFIG_PADRAO,
  descontoMensal = {}, descontoImplantacao = {}, validadeDias = 15, emitidaEm = new Date(), contatos = {},
}) {
  const n = Math.max(Number(alunos) || 0, 0);
  if (!cliente?.nome?.trim()) return { erro: 'Informe a escola.' };
  if (!plano || !ciclo) return { erro: 'Escolha o plano e o ciclo.' };
  if (n < 1) return { erro: 'Informe a quantidade de alunos.' };

  const ehPacote = plano.modalidade === 'pacote';
  const extrasOk = ehPacote ? extrasDoPacote(plano, extras, precos) : [];
  const ids = itensValidos(ehPacote ? [...(plano.itens || []), ...extrasOk] : escolhidos);
  if (!ehPacote && ids.length === 0 && Number(plano.minimo_mensal || 0) === 0) return { erro: 'Escolha ao menos um módulo.' };

  const mensalCheia = mensalidade(plano, n, precos, ids, extrasOk);
  const dm = descontoMensalidade(mensalCheia, ciclo, { ...descontoMensal, tetoPercent: config.desconto_mensalidade_max_percent });
  if (dm.erro) return { erro: dm.erro };
  const implBase = implantacaoBase(plano, ciclo);
  const impl = implantacaoFinal(implBase, descontoImplantacao.tipo, descontoImplantacao.valor, config.desconto_implantacao_max_percent);
  if (impl.erro) return { erro: impl.erro };

  const meses = ciclo.meses ?? CICLO_POR_ID[ciclo.ciclo]?.meses ?? 1;
  const cicloPercent = Number(ciclo.desconto_percent || 0);
  const valorCicloCheio = valorDoCiclo(mensalCheia, { ...ciclo, desconto_percent: 0 });
  const validade = new Date(emitidaEm);
  validade.setDate(validade.getDate() + Math.max(Number(validadeDias) || 0, 1));

  const itens = ids.map(itemDaProposta);
  const vantagens = [];
  if (plano.descricao?.trim()) vantagens.push(plano.descricao.trim());
  if (itens.length > 0) vantagens.push(`${itens.length} ${itens.length === 1 ? 'módulo ou adicional incluído' : 'módulos e adicionais incluídos'} além do plano base.`);
  if (cicloPercent > 0) vantagens.push(`Desconto de ${cicloPercent} por cento na mensalidade pelo ciclo ${CICLO_POR_ID[ciclo.ciclo]?.label.toLowerCase() || ''}.`.replace(' .', '.'));
  if (impl.desconto > 0) vantagens.push('Desconto na implantação do sistema.');
  if (dm.desconto > 0) vantagens.push(dm.mesesDesconto >= meses ? 'Desconto especial na mensalidade durante todo o ciclo.' : `Desconto especial na mensalidade nos ${dm.mesesDesconto} primeiros meses.`);
  if (ehPacote && Number(plano.minimo_mensal) > 0) vantagens.push('Valor previsível: um pacote com os módulos já combinados.');
  vantagens.push('Plano base sempre incluso: cadastros, entrada e saída com reconhecimento facial, comunicados, calendário, contratos e financeiro.');

  const wa = linkWhatsapp(contatos.whatsapp);
  return {
    erro: null,
    cliente: { nome: cliente.nome.trim(), contato: cliente.contato?.trim() || '' },
    plano: { nome: plano.nome, modalidade: plano.modalidade },
    ciclo: { id: ciclo.ciclo, label: CICLO_POR_ID[ciclo.ciclo]?.label || ciclo.ciclo, meses, descontoPercent: cicloPercent },
    alunos: n,
    emitidaEm: dataBr(emitidaEm),
    validadeAte: dataBr(validade),
    sobre: SOBRE_ZELA,
    base: itemDaProposta('base'),
    itens,
    vantagens,
    valores: {
      mensalCheia,
      mensalComDesconto: dm.desconto > 0 ? dm.mensalComDesconto : null,
      descontoMensal: dm.desconto,
      mesesDesconto: dm.mesesDesconto,
      valorCicloCheio,
      valorCiclo: dm.valorCiclo,
      implantacaoBase: implBase,
      implantacaoDesconto: impl.desconto,
      implantacao: impl.final,
    },
    links: {
      aceitar: wa ? `${wa}?text=${encodeURIComponent(`Olá! Quero aceitar a proposta do Zela para ${cliente.nome.trim()}.`)}` : null,
      duvida: wa ? `${wa}?text=${encodeURIComponent(`Olá! Tenho uma dúvida sobre a proposta do Zela para ${cliente.nome.trim()}.`)}` : null,
    },
    contatos: { whatsapp: semHifen(contatos.whatsapp) },
  };
}
