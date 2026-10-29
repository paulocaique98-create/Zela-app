import React, { useEffect, useMemo } from 'react';
import { Notice } from '../../GestaoShared';
import BiKpi from '../BiKpi';
import BiCartaoGrafico from '../BiCartaoGrafico';
import FunilCaptacao from '../FunilCaptacao';
import Colunas from '../charts/Colunas';
import BarrasH from '../charts/BarrasH';
import { useBiQuery } from '../../../hooks/useBiQuery';
import { formatarNumero, rotuloMes } from '../../../lib/bi/formatos';
import { corDaEntidade, CORES_CATEGORICAS } from '../../../lib/bi/coresEntidade';
import { baixarCsvGrafico, baixarXlsxAba } from '../../../lib/bi/exportar';

const numero = (v) => formatarNumero(v);
const colunasNome = (titulo) => [{ label: titulo, value: 'nome' }, { label: 'Alunos', value: 'valor' }];
const colunasTabela = (titulo) => [
  { label: titulo, primary: true, render: r => r.nome },
  { label: 'Alunos', align: 'right', render: r => formatarNumero(r.valor) },
];

export default function Matriculas({ periodo, turmas, chaveCache, mapaCores, exportRef, atualizacao, onAtualizado, onFiltrarTurma, onDrill }) {
  const params = { p_inicio: periodo.inicio, p_fim: periodo.fim, p_turmas: turmas.length ? turmas : null };
  const q = useBiQuery('bi_matriculas', params, { chave: chaveCache + atualizacao });

  const d = q.dados;
  useEffect(() => { if (q.atualizadoEm) onAtualizado(q.atualizadoEm); }, [q.atualizadoEm, onAtualizado]);
  const k = d?.kpis;

  const entradas = useMemo(() => (d?.entradas_mensais || []).map(e => ({ mes: e.mes, rotulo: rotuloMes(e.mes), entradas: e.entradas })), [d]);
  const porTurma = useMemo(() => (d?.alunos_por_turma || []).map(t => ({ nome: t.turma, valor: t.alunos, cor: corDaEntidade(mapaCores, t.turma) })), [d, mapaCores]);
  const porTurno = useMemo(() => (d?.alunos_por_turno || []).map(t => ({ nome: t.turno, valor: t.alunos, cor: CORES_CATEGORICAS[0] })), [d]);
  const porFaixa = useMemo(() => (d?.alunos_por_faixa || []).map(f => ({ nome: f.faixa, valor: f.alunos, cor: CORES_CATEGORICAS[0] })), [d]);
  const seriesEntradas = [{ id: 'entradas', label: 'Matrículas novas', cor: CORES_CATEGORICAS[0] }];
  const colunasEntradas = [{ label: 'Mês', value: 'rotulo' }, { label: 'Matrículas novas', value: 'entradas' }];

  useEffect(() => {
    if (!d) return undefined;
    exportRef.current = () => baixarXlsxAba('painel_matriculas', [
      { titulo: 'Matrículas novas por mês', linhas: entradas, colunas: colunasEntradas },
      { titulo: 'Alunos por turma', linhas: porTurma, colunas: colunasNome('Turma') },
      { titulo: 'Alunos por turno', linhas: porTurno, colunas: colunasNome('Turno') },
      { titulo: 'Alunos por faixa etária', linhas: porFaixa, colunas: colunasNome('Faixa etária') },
    ]);
    return () => { exportRef.current = null; };
  }, [d, entradas, porTurma, porTurno, porFaixa, exportRef]);

  if (q.erro) return <Notice type="error">Não foi possível carregar as matrículas. Use Atualizar para tentar de novo.</Notice>;

  const carregando = q.carregando && !d;
  const valor = (v) => (carregando ? '·' : formatarNumero(v));
  const grafico = (titulo, dados, nome, regra, aria, props = {}) => (
    <BiCartaoGrafico
      titulo={titulo} carregando={carregando} vazio={!carregando && dados.length === 0}
      altura={Math.max(160, dados.length * 34 + 16)}
      tabela={{ columns: colunasTabela(nome), rows: dados, rowKey: r => r.nome }}
      onBaixar={() => baixarCsvGrafico(titulo.toLowerCase().replace(/\s+/g, '_'), dados, colunasNome(nome))}
      regra={regra} ariaLabel={aria}
    >
      <BarrasH dados={dados} formatar={numero} rotuloSerie="Alunos" {...props} />
    </BiCartaoGrafico>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BiKpi label="Alunos ativos" value={valor(k?.alunos_ativos)} hint="Retrato de hoje" onClick={() => onDrill('alunos_ativos')} />
        <BiKpi label="Matrículas novas" value={valor(k?.matriculas_novas)} hint="Primeira matrícula no período" onClick={() => onDrill('matriculas_novas')} />
        {d?.contratos_visiveis && <BiKpi label="Contratos enviados" value={valor(k?.contratos_enviados)} />}
        {d?.contratos_visiveis && <BiKpi label="Contratos assinados" value={valor(k?.contratos_assinados)} />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <BiCartaoGrafico
          titulo="Matrículas novas por mês" carregando={carregando} vazio={!carregando && entradas.every(e => !e.entradas)}
          tabela={{ columns: [{ label: 'Mês', primary: true, render: r => r.rotulo }, { label: 'Matrículas novas', align: 'right', render: r => formatarNumero(r.entradas) }], rows: entradas, rowKey: r => r.mes }}
          onBaixar={() => baixarCsvGrafico('matriculas_novas_mes', entradas, colunasEntradas)}
          regra="Alunos cuja primeira matrícula foi registrada no mês. Quem já estava na base em 27/09/2026 aparece nesse mês. A data de saída não é guardada, por isso as saídas ficam fora do painel."
          ariaLabel="Colunas de matrículas novas por mês"
        >
          <Colunas dados={entradas} series={seriesEntradas} formatar={numero} />
        </BiCartaoGrafico>

        {grafico(
          'Alunos por turma', porTurma, 'Turma',
          'Alunos ativos hoje. Clique numa barra para filtrar a turma.', 'Barras de alunos ativos por turma',
          { selecionados: new Set(turmas), onSelecionar: (nome) => nome !== 'Sem turma' && onFiltrarTurma(nome) },
        )}
        {grafico('Alunos por turno', porTurno, 'Turno', 'Alunos ativos hoje.', 'Barras de alunos ativos por turno')}
        {grafico('Alunos por faixa etária', porFaixa, 'Faixa etária', 'Alunos ativos hoje, pela idade em anos completos.', 'Barras de alunos ativos por faixa etária')}
      </div>

      <FunilCaptacao periodo={periodo} chaveCache={chaveCache} atualizacao={atualizacao} />
    </div>
  );
}
