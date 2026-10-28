import React, { useEffect, useMemo, useState } from 'react';
import { Notice } from '../../GestaoShared';
import BiKpi from '../BiKpi';
import BiCartaoGrafico from '../BiCartaoGrafico';
import Colunas from '../charts/Colunas';
import BarrasH from '../charts/BarrasH';
import { useBiQuery } from '../../../hooks/useBiQuery';
import { formatarMoeda, formatarNumero, formatarPercentual, calcularVariacao, rotuloMes } from '../../../lib/bi/formatos';
import { corDaEntidade, CORES_CATEGORICAS } from '../../../lib/bi/coresEntidade';
import { baixarCsvGrafico, baixarXlsxAba } from '../../../lib/bi/exportar';

const inadimplencia = (k) => (k?.previsto_cents > 0 ? Math.round((1000 * k.atraso_cents) / k.previsto_cents) / 10 : null);
const reais = (c) => formatarMoeda(c);
const reaisCurto = (c) => (c === null || c === undefined ? '' : `R$ ${formatarNumero(c / 100)}`);

export default function VisaoGeral({ periodo, comparado, turmas, chaveCache, mapaCores, exportRef, atualizacao, onAtualizado, onFiltrarTurma, onDrill }) {
  const params = { p_inicio: periodo.inicio, p_fim: periodo.fim, p_turmas: turmas.length ? turmas : null };
  const q = useBiQuery('bi_visao_geral', params, { chave: chaveCache + atualizacao });
  const qComp = useBiQuery('bi_visao_geral', { ...params, p_inicio: comparado?.inicio, p_fim: comparado?.fim }, { chave: chaveCache + atualizacao, habilitado: !!comparado });
  const [ocultas, setOcultas] = useState(new Set());
  const alternar = (id) => setOcultas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const d = q.dados;
  useEffect(() => { if (q.atualizadoEm) onAtualizado(q.atualizadoEm); }, [q.atualizadoEm, onAtualizado]);
  const k = d?.kpis;
  const kc = comparado ? qComp.dados?.kpis : null;
  const ve = d?.valores_visiveis === true;

  const mensal = useMemo(() => (d?.serie_mensal || []).map(s => ({
    mes: s.mes, rotulo: rotuloMes(s.mes), previsto: s.previsto_cents, recebido: s.recebido_cents,
  })), [d]);
  const porTurma = useMemo(() => (d?.frequencia_por_turma || []).filter(t => t.frequencia_pct !== null).map(t => ({
    nome: t.turma, valor: Number(t.frequencia_pct), cor: corDaEntidade(mapaCores, t.turma),
  })), [d, mapaCores]);

  const seriesMensal = [
    { id: 'previsto', label: 'Previsto', cor: CORES_CATEGORICAS[0] },
    { id: 'recebido', label: 'Recebido', cor: CORES_CATEGORICAS[1] },
  ];
  const colunasMensal = [{ label: 'Mês', value: 'rotulo' }, { label: 'Previsto (R$)', value: r => (r.previsto / 100).toFixed(2).replace('.', ',') }, { label: 'Recebido (R$)', value: r => (r.recebido / 100).toFixed(2).replace('.', ',') }];
  const colunasTurma = [{ label: 'Turma', value: 'nome' }, { label: 'Frequência (%)', value: 'valor' }];

  useEffect(() => {
    if (!d) return undefined;
    exportRef.current = () => baixarXlsxAba('painel_visao_geral', [
      ...(ve ? [{ titulo: 'Previsto x recebido', linhas: mensal, colunas: colunasMensal }] : []),
      { titulo: 'Frequência por turma', linhas: porTurma, colunas: colunasTurma },
    ]);
    return () => { exportRef.current = null; };
  }, [d, ve, mensal, porTurma, exportRef]);

  if (q.erro) return <Notice type="error">Não foi possível carregar a visão geral. Use Atualizar para tentar de novo.</Notice>;

  const carregando = q.carregando && !d;
  const varia = (a, b, opc) => (kc ? calcularVariacao(a, b, opc) : null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BiKpi label="Alunos ativos" value={carregando ? '·' : formatarNumero(k?.alunos_ativos)} hint="Retrato de hoje" onClick={() => onDrill('alunos_ativos')} />
        {ve && <BiKpi label="Recebido no período" value={carregando ? '·' : reais(k?.recebido_cents)} variacao={varia(k?.recebido_cents, kc?.recebido_cents)} onClick={() => onDrill('financeiro_recebido')} />}
        {ve && <BiKpi label="Inadimplência" value={carregando ? '·' : formatarPercentual(inadimplencia(k))} variacao={varia(inadimplencia(k), inadimplencia(kc), { maisEhMelhor: false })} tone={inadimplencia(k) > 0 ? 'warn' : 'default'} onClick={() => onDrill('financeiro_atraso')} />}
        <BiKpi label="Frequência média" value={carregando ? '·' : formatarPercentual(k?.frequencia_media_pct)} variacao={varia(k?.frequencia_media_pct, kc?.frequencia_media_pct)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {ve && (
          <BiCartaoGrafico
            titulo="Previsto x recebido por mês" carregando={carregando} vazio={!carregando && mensal.every(m => !m.previsto)}
            legenda={seriesMensal.map(s => ({ ...s, oculta: ocultas.has(s.id) }))} onAlternarSerie={alternar}
            tabela={{ columns: [{ label: 'Mês', primary: true, render: r => r.rotulo }, { label: 'Previsto', align: 'right', render: r => reais(r.previsto) }, { label: 'Recebido', align: 'right', render: r => reais(r.recebido) }], rows: mensal, rowKey: r => r.mes }}
            onBaixar={() => baixarCsvGrafico('previsto_recebido', mensal, colunasMensal)}
            regra="Previsto = cobranças com vencimento no período, sem canceladas. Recebido = as pagas."
            ariaLabel="Colunas de valor previsto e recebido por mês"
          >
            <Colunas dados={mensal} series={seriesMensal} ocultas={ocultas} formatar={reais} formatarEixo={reaisCurto} />
          </BiCartaoGrafico>
        )}
        <BiCartaoGrafico
          titulo="Frequência média por turma" carregando={carregando} vazio={!carregando && porTurma.length === 0}
          altura={Math.max(200, porTurma.length * 32 + 16)}
          tabela={{ columns: [{ label: 'Turma', primary: true, render: r => r.nome }, { label: 'Frequência', align: 'right', render: r => formatarPercentual(r.valor) }], rows: porTurma, rowKey: r => r.nome }}
          onBaixar={() => baixarCsvGrafico('frequencia_por_turma', porTurma, colunasTurma)}
          regra="Presentes e atrasados sobre os registros do período, sem os justificados. Clique numa barra para filtrar a turma."
          ariaLabel="Barras de frequência média por turma"
        >
          <BarrasH
            dados={porTurma} formatar={(v) => formatarPercentual(v)} rotuloSerie="Frequência"
            selecionados={new Set(turmas)} onSelecionar={(nome) => nome !== 'Sem turma' && onFiltrarTurma(nome)}
          />
        </BiCartaoGrafico>
      </div>
    </div>
  );
}
