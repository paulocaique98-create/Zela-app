import React, { useEffect, useMemo } from 'react';
import { Notice } from '../../GestaoShared';
import BiKpi from '../BiKpi';
import BiCartaoGrafico from '../BiCartaoGrafico';
import Colunas from '../charts/Colunas';
import { useBiQuery } from '../../../hooks/useBiQuery';
import { formatarNumero, calcularVariacao } from '../../../lib/bi/formatos';
import { CORES_CATEGORICAS } from '../../../lib/bi/coresEntidade';
import { baixarCsvGrafico, baixarXlsxAba } from '../../../lib/bi/exportar';
import { recortarHoras } from '../../../lib/bi/academicoOperacao';

const numero = (v) => formatarNumero(v);

// Aba Operação (Fase 1.5): entradas e saídas por hora e correções de horário.
// Sem valores em R$. Forma de identificação e horas extras ficam fora (o banco não grava).
export default function Operacao({ periodo, comparado, turmas, chaveCache, exportRef, atualizacao, onAtualizado }) {
  const params = { p_inicio: periodo.inicio, p_fim: periodo.fim, p_turmas: turmas.length ? turmas : null };
  const q = useBiQuery('bi_operacao', params, { chave: chaveCache + atualizacao });
  const qComp = useBiQuery('bi_operacao', { ...params, p_inicio: comparado?.inicio, p_fim: comparado?.fim }, { chave: chaveCache + atualizacao, habilitado: !!comparado });

  const d = q.dados;
  useEffect(() => { if (q.atualizadoEm) onAtualizado(q.atualizadoEm); }, [q.atualizadoEm, onAtualizado]);
  const k = d?.kpis;
  const kc = comparado ? qComp.dados?.kpis : null;

  const horas = useMemo(() => recortarHoras(d?.por_hora), [d]);
  const colHora = [{ label: 'Hora', value: 'rotulo' }, { label: 'Entradas', value: 'entradas' }, { label: 'Saídas', value: 'saidas' }];
  const colCorrecoes = [
    { label: 'Situação', value: 'situacao' }, { label: 'Quantidade', value: 'quantidade' },
  ];
  const correcoes = useMemo(() => (k ? [
    { situacao: 'Aprovadas ou aplicadas', quantidade: k.correcoes_aprovadas },
    { situacao: 'Aguardando aprovação', quantidade: k.correcoes_pendentes },
    { situacao: 'Rejeitadas', quantidade: k.correcoes_rejeitadas },
  ] : []), [k]);

  useEffect(() => {
    if (!d) return undefined;
    exportRef.current = () => baixarXlsxAba('painel_operacao', [
      { titulo: 'Entradas e saídas por hora', linhas: horas, colunas: colHora },
      { titulo: 'Correções de horário', linhas: correcoes, colunas: colCorrecoes },
    ]);
    return () => { exportRef.current = null; };
  }, [d, horas, correcoes, exportRef]);

  if (q.erro) return <Notice type="error">Não foi possível carregar a operação. Use Atualizar para tentar de novo.</Notice>;

  const carregando = q.carregando && !d;
  const varia = (a, b, opc) => (kc ? calcularVariacao(a, b, opc) : null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BiKpi label="Entradas" value={carregando ? '·' : numero(k?.entradas)} variacao={varia(k?.entradas, kc?.entradas)} />
        <BiKpi label="Saídas" value={carregando ? '·' : numero(k?.saidas)} variacao={varia(k?.saidas, kc?.saidas)} />
        <BiKpi label="Correções pedidas" value={carregando ? '·' : numero(k?.correcoes_pedidas)} variacao={varia(k?.correcoes_pedidas, kc?.correcoes_pedidas, { maisEhMelhor: false })} />
        <BiKpi
          label="Correções aprovadas" value={carregando ? '·' : numero(k?.correcoes_aprovadas)}
          hint={k?.correcoes_pendentes > 0 ? `${numero(k.correcoes_pendentes)} aguardando aprovação` : 'Inclui as aplicadas na hora'}
          tone={k?.correcoes_pendentes > 0 ? 'warn' : 'default'}
        />
      </div>

      <BiCartaoGrafico
        titulo="Entradas e saídas por hora do dia" carregando={carregando} vazio={!carregando && horas.every(h => !h.entradas && !h.saidas)}
        tabela={{ columns: [{ label: 'Hora', primary: true, render: r => r.rotulo }, { label: 'Entradas', align: 'right', render: r => numero(r.entradas) }, { label: 'Saídas', align: 'right', render: r => numero(r.saidas) }], rows: horas, rowKey: r => r.hora }}
        onBaixar={() => baixarCsvGrafico('entradas_saidas_por_hora', horas, colHora)}
        regra="Registros de entrada e de saída do período por hora cheia, no horário de Brasília. Usa o horário já corrigido, quando houve correção."
        ariaLabel="Colunas de entradas e saídas por hora do dia"
      >
        <Colunas
          dados={horas} eixo="rotulo" formatar={numero}
          series={[{ id: 'entradas', label: 'Entradas', cor: CORES_CATEGORICAS[0] }, { id: 'saidas', label: 'Saídas', cor: CORES_CATEGORICAS[1] }]}
        />
      </BiCartaoGrafico>

      <p className="text-xs text-on-surface-variant">
        Forma de identificação (rosto, QR Code, PIN), tempo até a confirmação no monitor e horas extras ainda não aparecem aqui, porque o sistema não grava esses dados.
      </p>
    </div>
  );
}
