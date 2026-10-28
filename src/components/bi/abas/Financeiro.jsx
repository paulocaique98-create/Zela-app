import React, { useEffect, useMemo, useState } from 'react';
import { Notice, SecondaryButton, EmptyState } from '../../GestaoShared';
import BiKpi from '../BiKpi';
import BiCartaoGrafico from '../BiCartaoGrafico';
import Colunas from '../charts/Colunas';
import Linha from '../charts/Linha';
import BarrasH from '../charts/BarrasH';
import { useBiQuery } from '../../../hooks/useBiQuery';
import { formatarMoeda, formatarNumero, formatarPercentual, calcularVariacao, rotuloMes } from '../../../lib/bi/formatos';
import {
  CORES_CATEGORICAS, CORES_SEQUENCIAIS, COR_OUTRAS, COR_POSITIVO, COR_NEGATIVO, COR_ZERO, atualizarMapaCores, corDaEntidade,
} from '../../../lib/bi/coresEntidade';
import { baixarCsvGrafico, baixarXlsxAba } from '../../../lib/bi/exportar';

const FORMAS = { pix: 'Pix', boleto: 'Boleto', credit_card: 'Cartão', link: 'Link', cash: 'Dinheiro', transfer: 'Transferência', other: 'Outra' };
const reais = (c) => formatarMoeda(c);
const reaisCurto = (c) => (c === null || c === undefined ? '' : `R$ ${formatarNumero(c / 100)}`);
const numBR = (c) => (c / 100).toFixed(2).replace('.', ',');

export default function Financeiro({ periodo, comparado, turmas, chaveCache, exportRef, atualizacao, onAtualizado, onDrill }) {
  const params = { p_inicio: periodo.inicio, p_fim: periodo.fim, p_turmas: turmas.length ? turmas : null };
  const q = useBiQuery('bi_financeiro', params, { chave: chaveCache + atualizacao });
  const qComp = useBiQuery('bi_financeiro', { ...params, p_inicio: comparado?.inicio, p_fim: comparado?.fim }, { chave: chaveCache + atualizacao, habilitado: !!comparado });
  const [ocultas, setOcultas] = useState(new Set());
  const alternar = (id) => setOcultas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const d = q.dados;
  useEffect(() => { if (q.atualizadoEm) onAtualizado(q.atualizadoEm); }, [q.atualizadoEm, onAtualizado]);
  const k = d?.kpis;
  const kc = comparado ? qComp.dados?.kpis : null;

  const mensal = useMemo(() => (d?.mensal || []).map(m => ({ ...m, rotulo: rotuloMes(m.mes) })), [d]);
  const envelhecimento = useMemo(() => (d?.envelhecimento || []).map((e, i) => ({ nome: e.faixa, valor: e.valor_cents, quantidade: e.quantidade, cor: CORES_SEQUENCIAIS[i] })), [d]);
  const formas = useMemo(() => {
    const itens = d?.formas_pagamento || [];
    const mapa = atualizarMapaCores(itens.map(f => FORMAS[f.forma] || f.forma));
    return itens.map(f => { const nome = FORMAS[f.forma] || f.forma; return { nome, valor: f.valor_cents, quantidade: f.quantidade, cor: corDaEntidade(mapa, nome) }; });
  }, [d]);
  const categorias = useMemo(() => (d?.despesas_categorias || []).map(c => ({
    nome: c.categoria, valor: c.valor_cents, cor: c.categoria === 'Outras' ? COR_OUTRAS : CORES_CATEGORICAS[0],
  })), [d]);
  const atrasos = d?.maiores_atrasos || [];

  const seriesMensal = [{ id: 'previsto_cents', label: 'Previsto', cor: CORES_CATEGORICAS[0] }, { id: 'recebido_cents', label: 'Recebido', cor: CORES_CATEGORICAS[1] }];
  const seriesInad = [{ id: 'inadimplencia_pct', label: 'Inadimplência', cor: CORES_CATEGORICAS[1] }];
  const seriesRes = [{ id: 'resultado_cents', label: 'Resultado', cor: CORES_CATEGORICAS[0] }];

  const csvMensal = [{ label: 'Mês', value: 'rotulo' }, { label: 'Previsto (R$)', value: r => numBR(r.previsto_cents) }, { label: 'Recebido (R$)', value: r => numBR(r.recebido_cents) }];
  const csvInad = [{ label: 'Mês', value: 'rotulo' }, { label: 'Inadimplência (%)', value: r => r.inadimplencia_pct ?? '' }];
  const csvRes = [{ label: 'Mês', value: 'rotulo' }, { label: 'Recebido (R$)', value: r => numBR(r.recebido_cents) }, { label: 'Despesas (R$)', value: r => numBR(r.despesas_cents) }, { label: 'Resultado (R$)', value: r => numBR(r.resultado_cents) }];
  const csvValor = (rotulo) => [{ label: rotulo, value: 'nome' }, { label: 'Valor (R$)', value: r => numBR(r.valor) }];
  const csvAtrasos = [{ label: 'Aluno', value: 'aluno' }, { label: 'Turma', value: 'turma' }, { label: 'Valor em atraso (R$)', value: r => numBR(r.valor_cents) }, { label: 'Cobranças', value: 'quantidade' }, { label: 'Maior atraso (dias)', value: 'dias_max' }];

  useEffect(() => {
    if (!d) return undefined;
    exportRef.current = () => baixarXlsxAba('painel_financeiro', [
      { titulo: 'Previsto x recebido', linhas: mensal, colunas: csvMensal },
      { titulo: 'Inadimplência por mês', linhas: mensal, colunas: csvInad },
      { titulo: 'Envelhecimento do atraso', linhas: envelhecimento, colunas: csvValor('Faixa (dias)') },
      { titulo: 'Forma de pagamento', linhas: formas, colunas: csvValor('Forma') },
      { titulo: 'Despesas por categoria', linhas: categorias, colunas: csvValor('Categoria') },
      { titulo: 'Resultado mensal', linhas: mensal, colunas: csvRes },
      { titulo: 'Maiores atrasos', linhas: atrasos, colunas: csvAtrasos },
    ]);
    return () => { exportRef.current = null; };
  }, [d, mensal, envelhecimento, formas, categorias, atrasos, exportRef]);

  if (q.erro) return <Notice type="error">Não foi possível carregar o financeiro. Use Atualizar para tentar de novo.</Notice>;

  const carregando = q.carregando && !d;
  const v = (a, b, opc) => (kc ? calcularVariacao(a, b, opc) : null);
  const val = (x) => (carregando ? '·' : x);
  const vazioMensal = !carregando && mensal.every(m => !m.previsto_cents && !m.despesas_cents);
  const colValor = [{ label: 'Item', primary: true, render: r => r.nome }, { label: 'Valor', align: 'right', render: r => reais(r.valor) }];
  const colMensalRes = [{ label: 'Mês', primary: true, render: r => r.rotulo }, { label: 'Resultado', align: 'right', render: r => reais(r.resultado_cents) }];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BiKpi label="Previsto" value={val(reais(k?.previsto_cents))} variacao={v(k?.previsto_cents, kc?.previsto_cents)} onClick={() => onDrill('financeiro_previsto')} />
        <BiKpi label="Recebido" value={val(reais(k?.recebido_cents))} variacao={v(k?.recebido_cents, kc?.recebido_cents)} onClick={() => onDrill('financeiro_recebido')} />
        <BiKpi label="Taxa de recebimento" value={val(formatarPercentual(k?.taxa_recebimento_pct))} variacao={v(k?.taxa_recebimento_pct, kc?.taxa_recebimento_pct)} />
        <BiKpi
          label="Em atraso" value={val(reais(k?.atraso_cents))} hint={carregando ? undefined : `${formatarNumero(k?.atraso_qtd)} cobranças`}
          variacao={v(k?.atraso_cents, kc?.atraso_cents, { maisEhMelhor: false })} tone={k?.atraso_cents > 0 ? 'warn' : 'default'} onClick={() => onDrill('financeiro_atraso')}
        />
        <BiKpi label="Ticket médio" value={val(reais(k?.ticket_medio_cents))} variacao={v(k?.ticket_medio_cents, kc?.ticket_medio_cents)} />
        <BiKpi label="Despesas pagas" value={val(reais(k?.despesas_pagas_cents))} hint="Não filtra por turma" variacao={v(k?.despesas_pagas_cents, kc?.despesas_pagas_cents, { maisEhMelhor: false })} />
        <BiKpi label="Resultado" value={val(reais(k?.resultado_cents))} hint="Recebido menos despesas" variacao={v(k?.resultado_cents, kc?.resultado_cents)} className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <BiCartaoGrafico
          titulo="Previsto x recebido por mês" carregando={carregando} vazio={vazioMensal}
          legenda={seriesMensal.map(s => ({ ...s, oculta: ocultas.has(s.id) }))} onAlternarSerie={alternar}
          tabela={{ columns: [{ label: 'Mês', primary: true, render: r => r.rotulo }, { label: 'Previsto', align: 'right', render: r => reais(r.previsto_cents) }, { label: 'Recebido', align: 'right', render: r => reais(r.recebido_cents) }], rows: mensal, rowKey: r => r.mes }}
          onBaixar={() => baixarCsvGrafico('previsto_recebido', mensal, csvMensal)}
          regra="Previsto = cobranças com vencimento no mês, sem canceladas. Recebido = as pagas."
          ariaLabel="Colunas de valor previsto e recebido por mês"
        >
          <Colunas dados={mensal} series={seriesMensal} ocultas={ocultas} formatar={reais} formatarEixo={reaisCurto} />
        </BiCartaoGrafico>

        <BiCartaoGrafico
          titulo="Inadimplência por mês" carregando={carregando} vazio={vazioMensal}
          tabela={{ columns: [{ label: 'Mês', primary: true, render: r => r.rotulo }, { label: 'Inadimplência', align: 'right', render: r => formatarPercentual(r.inadimplencia_pct) }], rows: mensal, rowKey: r => r.mes }}
          onBaixar={() => baixarCsvGrafico('inadimplencia_mensal', mensal, csvInad)}
          regra="Em atraso sobre o previsto do mês. Atraso = vencida e não paga, até hoje."
          ariaLabel="Linha da inadimplência em porcentagem por mês"
        >
          <Linha dados={mensal} series={seriesInad} formatar={(x) => formatarPercentual(x)} />
        </BiCartaoGrafico>

        <BiCartaoGrafico
          titulo="Envelhecimento do atraso" carregando={carregando} vazio={!carregando && envelhecimento.every(e => !e.valor)}
          altura={200}
          tabela={{ columns: [{ label: 'Faixa em dias', primary: true, render: r => r.nome }, { label: 'Cobranças', align: 'right', render: r => formatarNumero(r.quantidade) }, { label: 'Valor', align: 'right', render: r => reais(r.valor) }], rows: envelhecimento, rowKey: r => r.nome }}
          onBaixar={() => baixarCsvGrafico('envelhecimento_atraso', envelhecimento, csvValor('Faixa (dias)'))}
          regra="Dias desde o vencimento das cobranças em atraso. Quanto mais escuro, mais antigo."
          ariaLabel="Barras do valor em atraso por faixa de dias"
        >
          <BarrasH dados={envelhecimento} formatar={reais} rotuloSerie="Em atraso" larguraRotulo={84} />
        </BiCartaoGrafico>

        <BiCartaoGrafico
          titulo="Recebido por forma de pagamento" carregando={carregando} vazio={!carregando && formas.length === 0}
          altura={Math.max(160, formas.length * 34 + 16)}
          tabela={{ columns: [...colValor, { label: 'Cobranças', align: 'right', render: r => formatarNumero(r.quantidade) }], rows: formas, rowKey: r => r.nome }}
          onBaixar={() => baixarCsvGrafico('forma_pagamento', formas, csvValor('Forma'))}
          regra="Cobranças pagas no período, pela forma registrada. Sem forma aparece como Outra."
          ariaLabel="Barras do valor recebido por forma de pagamento"
        >
          <BarrasH dados={formas} formatar={reais} rotuloSerie="Recebido" />
        </BiCartaoGrafico>

        <BiCartaoGrafico
          titulo="Despesas por categoria" carregando={carregando} vazio={!carregando && categorias.length === 0}
          altura={Math.max(160, categorias.length * 34 + 16)}
          tabela={{ columns: colValor, rows: categorias, rowKey: r => r.nome }}
          onBaixar={() => baixarCsvGrafico('despesas_categoria', categorias, csvValor('Categoria'))}
          regra="Despesas pagas no período. As 8 maiores categorias; o resto vai em Outras."
          ariaLabel="Barras das despesas pagas por categoria"
        >
          <BarrasH dados={categorias} formatar={reais} rotuloSerie="Despesas" larguraRotulo={120} />
        </BiCartaoGrafico>

        <BiCartaoGrafico
          titulo="Resultado por mês" carregando={carregando} vazio={vazioMensal}
          tabela={{ columns: colMensalRes, rows: mensal, rowKey: r => r.mes }}
          onBaixar={() => baixarCsvGrafico('resultado_mensal', mensal, csvRes)}
          regra="Recebido do mês menos despesas pagas no mês. Positivo em verde, negativo em vermelho."
          ariaLabel="Colunas do resultado mensal, positivo ou negativo"
        >
          <Colunas dados={mensal} series={seriesRes} formatar={reais} formatarEixo={reaisCurto} divergente={{ positivo: COR_POSITIVO, negativo: COR_NEGATIVO, zero: COR_ZERO }} />
        </BiCartaoGrafico>
      </div>

      <section className="min-w-0 bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 print:break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="font-bold text-on-surface text-sm">Maiores atrasos por aluno</h3>
          {atrasos.length > 0 && <SecondaryButton type="button" onClick={() => baixarCsvGrafico('maiores_atrasos', atrasos, csvAtrasos)} className="!px-2.5 !py-1.5 text-xs">Baixar</SecondaryButton>}
        </div>
        {carregando ? <div className="animate-pulse h-40 rounded-zela-md bg-surface-container-low" role="status" aria-label="Carregando" /> : atrasos.length === 0 ? (
          <EmptyState text="Sem dados no período." hint="Mude o período ou os filtros." />
        ) : (
          <>
            <ul className="divide-y divide-outline-variant/50">
              {atrasos.map(a => (
                <li key={a.aluno_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-on-surface break-words">{a.aluno}</span>
                    <span className="block text-xs text-on-surface-variant">{a.turma || 'Sem turma'} · {a.quantidade} {a.quantidade === 1 ? 'cobrança' : 'cobranças'} · {a.dias_max} dias</span>
                  </span>
                  <span className="font-semibold tabular-nums text-warning shrink-0">{reais(a.valor_cents)}</span>
                </li>
              ))}
            </ul>
            <div className="pt-3"><SecondaryButton type="button" onClick={() => onDrill('financeiro_atraso')}>Ver lista completa</SecondaryButton></div>
          </>
        )}
        <p className="text-xs text-on-surface-variant mt-3">Os 10 alunos com mais valor em atraso no período.</p>
      </section>
    </div>
  );
}
