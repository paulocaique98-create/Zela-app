import React, { useEffect, useMemo } from 'react';
import { Notice, EmptyState, SecondaryButton } from '../../GestaoShared';
import BiKpi from '../BiKpi';
import BiCartaoGrafico from '../BiCartaoGrafico';
import Colunas from '../charts/Colunas';
import BarrasH from '../charts/BarrasH';
import MapaCalor from '../charts/MapaCalor';
import { useBiQuery } from '../../../hooks/useBiQuery';
import { formatarNumero, formatarPercentual, calcularVariacao } from '../../../lib/bi/formatos';
import { corDaEntidade, CORES_CATEGORICAS } from '../../../lib/bi/coresEntidade';
import { baixarCsvGrafico, baixarXlsxAba } from '../../../lib/bi/exportar';

const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const numero = (v) => formatarNumero(v);
const pct = (v) => formatarPercentual(v);
const dataBR = (iso) => iso.split('-').reverse().join('/');

export default function Frequencia({ periodo, comparado, turmas, chaveCache, mapaCores, exportRef, atualizacao, onAtualizado, onFiltrarTurma, onDrill }) {
  const params = { p_inicio: periodo.inicio, p_fim: periodo.fim, p_turmas: turmas.length ? turmas : null };
  const q = useBiQuery('bi_frequencia', params, { chave: chaveCache + atualizacao });
  const qComp = useBiQuery('bi_frequencia', { ...params, p_inicio: comparado?.inicio, p_fim: comparado?.fim }, { chave: chaveCache + atualizacao, habilitado: !!comparado });

  const d = q.dados;
  useEffect(() => { if (q.atualizadoEm) onAtualizado(q.atualizadoEm); }, [q.atualizadoEm, onAtualizado]);
  const k = d?.kpis;
  const kc = comparado ? qComp.dados?.kpis : null;

  const porTurma = useMemo(() => (d?.por_turma || []).filter(t => t.frequencia_pct !== null).map(t => ({
    nome: t.turma, valor: Number(t.frequencia_pct), cor: corDaEntidade(mapaCores, t.turma),
  })), [d, mapaCores]);
  const semanas = useMemo(() => (d?.turma_semana || []).filter(t => t.frequencia_pct !== null).map(t => ({
    turma: t.turma, semana: t.semana, valor: Number(t.frequencia_pct),
  })), [d]);
  const porDia = useMemo(() => (d?.faltas_dia_semana || []).filter(x => x.dia <= 5 || x.faltas > 0).map(x => ({ rotulo: DIAS[x.dia], faltas: x.faltas })), [d]);
  const top = d?.top_faltas || [];

  const colunasTurma = [{ label: 'Turma', value: 'nome' }, { label: 'Frequência (%)', value: 'valor' }];
  const colunasSemana = [{ label: 'Turma', value: 'turma' }, { label: 'Semana de', value: r => dataBR(r.semana) }, { label: 'Frequência (%)', value: 'valor' }];
  const colunasDia = [{ label: 'Dia', value: 'rotulo' }, { label: 'Faltas', value: 'faltas' }];
  const colunasTop = [{ label: 'Aluno', value: 'aluno' }, { label: 'Turma', value: 'turma' }, { label: 'Faltas', value: 'faltas' }, { label: 'Frequência (%)', value: 'frequencia_pct' }];

  useEffect(() => {
    if (!d) return undefined;
    exportRef.current = () => baixarXlsxAba('painel_frequencia', [
      { titulo: 'Frequência por turma', linhas: porTurma, colunas: colunasTurma },
      { titulo: 'Turma por semana', linhas: semanas, colunas: colunasSemana },
      { titulo: 'Faltas por dia da semana', linhas: porDia, colunas: colunasDia },
      { titulo: 'Alunos com mais faltas', linhas: top, colunas: colunasTop },
    ]);
    return () => { exportRef.current = null; };
  }, [d, porTurma, semanas, porDia, top, exportRef]);

  if (q.erro) return <Notice type="error">Não foi possível carregar a frequência. Use Atualizar para tentar de novo.</Notice>;

  const carregando = q.carregando && !d;
  const varia = (a, b, opc) => (kc ? calcularVariacao(a, b, opc) : null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BiKpi label="Frequência média" value={carregando ? '·' : pct(k?.frequencia_media_pct)} variacao={varia(k?.frequencia_media_pct, kc?.frequencia_media_pct)} />
        <BiKpi
          label="Alunos abaixo de 75%" value={carregando ? '·' : formatarNumero(k?.alunos_abaixo_75)} hint="Mínimo exigido pela LDB"
          variacao={varia(k?.alunos_abaixo_75, kc?.alunos_abaixo_75, { maisEhMelhor: false })}
          tone={k?.alunos_abaixo_75 > 0 ? 'warn' : 'default'} onClick={() => onDrill('frequencia_abaixo_75')}
        />
        <BiKpi label="Faltas no período" value={carregando ? '·' : formatarNumero(k?.faltas)} variacao={varia(k?.faltas, kc?.faltas, { maisEhMelhor: false })} onClick={() => onDrill('frequencia_faltas')} />
        <BiKpi label="Atrasos de chegada" value={carregando ? '·' : formatarNumero(k?.atrasos)} hint="Registros marcados como atrasado" variacao={varia(k?.atrasos, kc?.atrasos, { maisEhMelhor: false })} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <BiCartaoGrafico
          titulo="Frequência por turma" carregando={carregando} vazio={!carregando && porTurma.length === 0}
          altura={Math.max(200, porTurma.length * 32 + 16)}
          tabela={{ columns: [{ label: 'Turma', primary: true, render: r => r.nome }, { label: 'Frequência', align: 'right', render: r => pct(r.valor) }], rows: porTurma, rowKey: r => r.nome }}
          onBaixar={() => baixarCsvGrafico('frequencia_por_turma', porTurma, colunasTurma)}
          regra="Presentes e atrasados sobre os registros do período, sem os justificados. Clique numa barra para filtrar a turma."
          ariaLabel="Barras de frequência por turma"
        >
          <BarrasH
            dados={porTurma} formatar={pct} rotuloSerie="Frequência"
            selecionados={new Set(turmas)} onSelecionar={(nome) => nome !== 'Sem turma' && onFiltrarTurma(nome)}
          />
        </BiCartaoGrafico>

        <BiCartaoGrafico
          titulo="Faltas por dia da semana" carregando={carregando} vazio={!carregando && porDia.every(x => !x.faltas)}
          tabela={{ columns: [{ label: 'Dia', primary: true, render: r => r.rotulo }, { label: 'Faltas', align: 'right', render: r => formatarNumero(r.faltas) }], rows: porDia, rowKey: r => r.rotulo }}
          onBaixar={() => baixarCsvGrafico('faltas_dia_semana', porDia, colunasDia)}
          regra="Registros marcados como ausente em cada dia da semana, somados no período."
          ariaLabel="Colunas de faltas por dia da semana"
        >
          <Colunas dados={porDia} series={[{ id: 'faltas', label: 'Faltas', cor: CORES_CATEGORICAS[0] }]} formatar={numero} />
        </BiCartaoGrafico>
      </div>

      <BiCartaoGrafico
        titulo="Frequência por turma e semana" carregando={carregando} vazio={!carregando && semanas.length === 0}
        altura={Math.max(140, new Set(semanas.map(s => s.turma)).size * 32 + 56)}
        tabela={{ columns: [{ label: 'Turma', primary: true, render: r => r.turma }, { label: 'Semana de', render: r => dataBR(r.semana) }, { label: 'Frequência', align: 'right', render: r => pct(r.valor) }], rows: semanas, rowKey: r => `${r.turma}|${r.semana}` }}
        onBaixar={() => baixarCsvGrafico('frequencia_turma_semana', semanas, colunasSemana)}
        regra="Cada quadrado é a frequência da turma na semana (a data é a segunda feira). Clique no nome da turma para filtrar."
        ariaLabel="Mapa de calor da frequência por turma e semana"
      >
        <MapaCalor dados={semanas} formatar={(v) => `${Math.round(v)}%`} selecionados={new Set(turmas)} onSelecionar={(t) => t !== 'Sem turma' && onFiltrarTurma(t)} />
      </BiCartaoGrafico>

      <section className="min-w-0 bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 print:break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="font-bold text-on-surface text-sm">Alunos com mais faltas</h3>
          {top.length > 0 && <SecondaryButton type="button" onClick={() => baixarCsvGrafico('alunos_mais_faltas', top, colunasTop)} className="!px-2.5 !py-1.5 text-xs">Baixar</SecondaryButton>}
        </div>
        {carregando ? <div className="animate-pulse h-40 rounded-zela-md bg-surface-container-low" role="status" aria-label="Carregando" /> : top.length === 0 ? (
          <EmptyState text="Sem faltas no período." hint="Mude o período ou os filtros." />
        ) : (
          <>
            <ul className="divide-y divide-outline-variant/50">
              {top.map(a => (
                <li key={a.aluno_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-on-surface break-words">{a.aluno}</span>
                    <span className="block text-xs text-on-surface-variant">{a.turma || 'Sem turma'} · frequência {pct(a.frequencia_pct)}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-warning shrink-0">{a.faltas} {a.faltas === 1 ? 'falta' : 'faltas'}</span>
                </li>
              ))}
            </ul>
            <div className="pt-3"><SecondaryButton type="button" onClick={() => onDrill('frequencia_faltas')}>Ver lista completa</SecondaryButton></div>
          </>
        )}
        <p className="text-xs text-on-surface-variant mt-3">Os 10 alunos com mais faltas (ausente) no período.</p>
      </section>
    </div>
  );
}
