import React, { useEffect, useMemo } from 'react';
import { Notice, EmptyState, SecondaryButton } from '../../GestaoShared';
import BiKpi from '../BiKpi';
import BiCartaoGrafico from '../BiCartaoGrafico';
import Colunas from '../charts/Colunas';
import BarrasH from '../charts/BarrasH';
import { useBiQuery } from '../../../hooks/useBiQuery';
import { formatarNumero, formatarPercentual } from '../../../lib/bi/formatos';
import { corDaEntidade, CORES_CATEGORICAS } from '../../../lib/bi/coresEntidade';
import { baixarCsvGrafico, baixarXlsxAba } from '../../../lib/bi/exportar';
import { rotulosProfessoras } from '../../../lib/bi/academicoOperacao';

const numero = (v) => formatarNumero(v);
const nota = (v) => formatarNumero(v, 1);
const pct = (v) => formatarPercentual(v);

// Aba Acadêmico (Fase 1.5): o servidor devolve só o bloco do método da escola.
export default function Academico({ periodo, turmas, chaveCache, mapaCores, exportRef, atualizacao, onAtualizado }) {
  const params = { p_inicio: periodo.inicio, p_fim: periodo.fim, p_turmas: turmas.length ? turmas : null };
  const q = useBiQuery('bi_academico', params, { chave: chaveCache + atualizacao });
  const d = q.dados;
  useEffect(() => { if (q.atualizadoEm) onAtualizado(q.atualizadoEm); }, [q.atualizadoEm, onAtualizado]);

  const t = d?.tradicional || null;
  const m = d?.montessori || null;
  const minima = t?.media_minima ?? 7;

  const porDisciplina = useMemo(() => (t?.media_por_disciplina || []).map(x => ({ nome: x.disciplina, valor: Number(x.media), alunos: x.alunos, cor: CORES_CATEGORICAS[0] })), [t]);
  const faixas = useMemo(() => (t?.distribuicao_notas || []).map(x => ({ rotulo: x.rotulo, quantidade: x.quantidade })), [t]);
  const aprovacao = useMemo(() => (t?.aprovacao_por_serie || []).map(x => ({ nome: x.serie, valor: Number(x.aprovacao_pct), alunos: x.alunos, aprovados: x.aprovados, cor: CORES_CATEGORICAS[4] })), [t]);
  const abaixo = t?.abaixo_media_periodo || [];
  const professoras = useMemo(() => rotulosProfessoras(m?.relatorios_por_professora), [m]);
  const mitigacoes = m?.mitigacoes_por_turma || [];

  const colDisc = [{ label: 'Disciplina', value: 'nome' }, { label: 'Média', value: 'valor' }, { label: 'Alunos', value: 'alunos' }];
  const colFaixa = [{ label: 'Faixa de nota', value: 'rotulo' }, { label: 'Notas lançadas', value: 'quantidade' }];
  const colAprov = [{ label: 'Série', value: 'nome' }, { label: 'Alunos', value: 'alunos' }, { label: 'Aprovados', value: 'aprovados' }, { label: 'Aprovação (%)', value: 'valor' }];
  const colAbaixo = [{ label: 'Aluno', value: 'aluno' }, { label: 'Turma', value: 'turma' }, { label: 'Período', value: 'periodo' }, { label: 'Média', value: 'media' }];
  const colProf = [{ label: 'Professora', value: 'professora' }, { label: 'Publicados', value: 'publicados' }, { label: 'Pendentes', value: 'pendentes' }];
  const colMit = [{ label: 'Turma', value: 'turma' }, { label: 'Publicadas', value: 'publicadas' }, { label: 'Pendentes', value: 'pendentes' }];

  useEffect(() => {
    if (!d) return undefined;
    const blocos = [];
    if (t) {
      blocos.push(
        { titulo: 'Média por disciplina', linhas: porDisciplina, colunas: colDisc },
        { titulo: 'Distribuição das notas', linhas: faixas, colunas: colFaixa },
        { titulo: 'Aprovação por série', linhas: aprovacao, colunas: colAprov },
        { titulo: 'Alunos abaixo da média', linhas: abaixo, colunas: colAbaixo },
      );
    }
    if (m) {
      blocos.push(
        { titulo: 'Relatórios por professora', linhas: professoras, colunas: colProf },
        { titulo: 'Mitigações por turma', linhas: mitigacoes, colunas: colMit },
      );
    }
    exportRef.current = () => baixarXlsxAba('painel_academico', blocos);
    return () => { exportRef.current = null; };
  }, [d, t, m, porDisciplina, faixas, aprovacao, abaixo, professoras, mitigacoes, exportRef]);

  if (q.erro) return <Notice type="error">Não foi possível carregar os indicadores acadêmicos. Use Atualizar para tentar de novo.</Notice>;
  const carregando = q.carregando && !d;
  const v = (x) => (carregando ? '·' : x);

  if (!carregando && d && !t && !m) {
    return <EmptyState text="Sem indicadores acadêmicos para esta escola." hint="O painel mostra o bloco do método pedagógico configurado." />;
  }

  return (
    <div className="space-y-4">
      {(carregando || t) && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BiKpi label="Média geral" value={v(nota(t?.kpis?.media_geral))} hint={`Mínima da escola: ${nota(minima)}`} />
            <BiKpi label="Alunos com nota" value={v(numero(t?.kpis?.alunos_com_nota))} />
            <BiKpi label="Notas lançadas" value={v(numero(t?.kpis?.notas_lancadas))} />
            <BiKpi label="Alunos abaixo da média" value={v(numero(t?.kpis?.alunos_abaixo_media))} tone={t?.kpis?.alunos_abaixo_media > 0 ? 'warn' : 'default'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <BiCartaoGrafico
              titulo="Média por disciplina" carregando={carregando} vazio={!carregando && porDisciplina.length === 0}
              altura={Math.max(200, porDisciplina.length * 32 + 16)}
              tabela={{ columns: [{ label: 'Disciplina', primary: true, render: r => r.nome }, { label: 'Média', align: 'right', render: r => nota(r.valor) }], rows: porDisciplina, rowKey: r => r.nome }}
              onBaixar={() => baixarCsvGrafico('media_por_disciplina', porDisciplina, colDisc)}
              regra="Média das médias dos alunos em cada disciplina no ano letivo. Cada período vale a média ponderada pelos pesos; a recuperação substitui a nota do período."
              ariaLabel="Barras da média por disciplina"
            >
              <BarrasH dados={porDisciplina} formatar={nota} rotuloSerie="Média" />
            </BiCartaoGrafico>

            <BiCartaoGrafico
              titulo="Distribuição das notas" carregando={carregando} vazio={!carregando && faixas.every(f => !f.quantidade)}
              tabela={{ columns: [{ label: 'Faixa', primary: true, render: r => r.rotulo }, { label: 'Notas', align: 'right', render: r => numero(r.quantidade) }], rows: faixas, rowKey: r => r.rotulo }}
              onBaixar={() => baixarCsvGrafico('distribuicao_notas', faixas, colFaixa)}
              regra="Quantidade de notas lançadas em cada faixa de um ponto. A nota 10 entra na última faixa."
              ariaLabel="Colunas da distribuição das notas"
            >
              <Colunas dados={faixas} series={[{ id: 'quantidade', label: 'Notas', cor: CORES_CATEGORICAS[0] }]} formatar={numero} />
            </BiCartaoGrafico>
          </div>

          <BiCartaoGrafico
            titulo="Aprovação por série" carregando={carregando} vazio={!carregando && aprovacao.length === 0}
            altura={Math.max(160, aprovacao.length * 32 + 16)}
            tabela={{ columns: [{ label: 'Série', primary: true, render: r => r.nome }, { label: 'Aprovados', align: 'right', render: r => `${r.aprovados} de ${r.alunos}` }, { label: 'Aprovação', align: 'right', render: r => pct(r.valor) }], rows: aprovacao, rowKey: r => r.nome }}
            onBaixar={() => baixarCsvGrafico('aprovacao_por_serie', aprovacao, colAprov)}
            regra={`Aluno aprovado = todas as médias de disciplina iguais ou acima de ${nota(minima)}. Conta só quem já tem nota lançada.`}
            ariaLabel="Barras da aprovação por série"
          >
            <BarrasH dados={aprovacao} formatar={pct} rotuloSerie="Aprovação" />
          </BiCartaoGrafico>

          <section className="min-w-0 bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 print:break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-bold text-on-surface text-sm">Alunos abaixo da média</h3>
              {abaixo.length > 0 && <SecondaryButton type="button" onClick={() => baixarCsvGrafico('alunos_abaixo_media', abaixo, colAbaixo)} className="!px-2.5 !py-1.5 text-xs">Baixar</SecondaryButton>}
            </div>
            {carregando ? <div className="animate-pulse h-40 rounded-zela-md bg-surface-container-low" role="status" aria-label="Carregando" /> : abaixo.length === 0 ? (
              <EmptyState text="Nenhum aluno abaixo da média." hint="Mude o filtro de turma para conferir outras turmas." />
            ) : (
              <ul className="divide-y divide-outline-variant/50">
                {abaixo.map(a => (
                  <li key={`${a.aluno_id}|${a.periodo}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold text-on-surface break-words">{a.aluno}</span>
                      <span className="block text-xs text-on-surface-variant">{a.turma || 'Sem turma'} · {a.periodo}º período</span>
                    </span>
                    <span className="font-semibold tabular-nums text-warning shrink-0">{nota(a.media)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-on-surface-variant mt-3">Média das disciplinas do aluno no período, abaixo de {nota(minima)}. Mostra as 20 mais baixas.</p>
          </section>
        </>
      )}

      {m && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BiKpi label="Relatórios publicados" value={numero(m.kpis.relatorios_publicados)} />
            <BiKpi label="Relatórios pendentes" value={numero(m.kpis.relatorios_pendentes)} hint="Ainda em rascunho" tone={m.kpis.relatorios_pendentes > 0 ? 'warn' : 'default'} />
            <BiKpi label="Mitigações publicadas" value={numero(m.kpis.mitigacoes_publicadas)} />
            <BiKpi label="Mitigações pendentes" value={numero(m.kpis.mitigacoes_pendentes)} hint="Ainda em rascunho" tone={m.kpis.mitigacoes_pendentes > 0 ? 'warn' : 'default'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <BiCartaoGrafico
              titulo="Relatórios por professora" vazio={professoras.length === 0}
              tabela={{ columns: [{ label: 'Professora', primary: true, render: r => r.professora }, { label: 'Publicados', align: 'right', render: r => numero(r.publicados) }, { label: 'Pendentes', align: 'right', render: r => numero(r.pendentes) }], rows: professoras, rowKey: r => r.professora }}
              onBaixar={() => baixarCsvGrafico('relatorios_por_professora', professoras, colProf)}
              regra="Relatórios criados no período. Pendente é o que ainda está em rascunho; arquivados ficam de fora."
              ariaLabel="Colunas empilhadas de relatórios publicados e pendentes por professora"
            >
              <Colunas
                dados={professoras} eixo="rotulo" empilhado formatar={numero}
                series={[{ id: 'publicados', label: 'Publicados', cor: CORES_CATEGORICAS[0] }, { id: 'pendentes', label: 'Pendentes', cor: CORES_CATEGORICAS[1] }]}
              />
            </BiCartaoGrafico>

            <BiCartaoGrafico
              titulo="Mitigações por turma" vazio={mitigacoes.length === 0}
              altura={Math.max(200, mitigacoes.length * 32 + 16)}
              tabela={{ columns: [{ label: 'Turma', primary: true, render: r => r.turma }, { label: 'Publicadas', align: 'right', render: r => numero(r.publicadas) }, { label: 'Pendentes', align: 'right', render: r => numero(r.pendentes) }], rows: mitigacoes, rowKey: r => r.turma }}
              onBaixar={() => baixarCsvGrafico('mitigacoes_por_turma', mitigacoes, colMit)}
              regra="Relatórios de mitigação criados no período, por turma do aluno (publicados e em rascunho)."
              ariaLabel="Barras de mitigações por turma"
            >
              <BarrasH
                dados={mitigacoes.map(x => ({ nome: x.turma, valor: Number(x.publicadas) + Number(x.pendentes), cor: corDaEntidade(mapaCores, x.turma) }))}
                formatar={numero} rotuloSerie="Mitigações"
              />
            </BiCartaoGrafico>
          </div>
        </>
      )}
    </div>
  );
}
