import React, { useMemo } from 'react';
import BiKpi from './BiKpi';
import BiCartaoGrafico from './BiCartaoGrafico';
import BarrasH from './charts/BarrasH';
import { useBiQuery } from '../../hooks/useBiQuery';
import { formatarNumero, formatarPercentual } from '../../lib/bi/formatos';
import { CORES_CATEGORICAS } from '../../lib/bi/coresEntidade';
import { baixarCsvGrafico } from '../../lib/bi/exportar';
import { resumirFunil, rotuloOrigem as rotulo } from '../../lib/captacao';

const numero = (v) => formatarNumero(v);
const COLUNAS_ETAPA = [{ label: 'Etapa', value: 'nome' }, { label: 'Interessados', value: 'valor' }];
const COLUNAS_ORIGEM = [
  { label: 'Origem', value: 'nome' }, { label: 'Interessados', value: 'valor' },
  { label: 'Matriculados', value: 'matriculados' }, { label: 'Conversão (%)', value: r => r.conversao ?? '' },
];

// Funil de captação (módulo `captacao`). Usado na aba Matrículas do painel e em
// Captação › Funil. Só aparece para quem pode usar a Captação: a pergunta vai ao banco
// (captacao_pode_gerenciar), que confere perfil e módulo ligado da escola.
// periodo: { inicio, fim } em AAAA-MM-DD, pela data em que o interessado chegou.
export default function FunilCaptacao({ periodo, chaveCache, atualizacao = 0 }) {
  const pode = useBiQuery('captacao_pode_gerenciar', {}, { chave: chaveCache });
  const q = useBiQuery('captacao_funil', { p_inicio: periodo.inicio, p_fim: periodo.fim }, { chave: chaveCache + atualizacao, habilitado: pode.dados === true });

  const r = useMemo(() => resumirFunil(q.dados), [q.dados]);
  const etapas = useMemo(() => r.alcancou.map((e, i) => ({ nome: e.label, valor: e.total, cor: CORES_CATEGORICAS[0], ordem: i })), [r]);
  const origens = useMemo(() => r.porOrigem.map(o => ({
    nome: rotulo(o.origem), valor: o.total, matriculados: o.matriculados, conversao: o.conversao, cor: CORES_CATEGORICAS[0],
  })), [r]);

  if (pode.dados !== true) return null;
  if (q.erro) return <p className="text-sm text-error">Não foi possível carregar o funil de captação.</p>;

  const carregando = q.carregando && !q.dados;
  const valor = (v) => (carregando ? '·' : formatarNumero(v));

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-on-surface text-sm">Funil de captação</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BiKpi label="Interessados" value={valor(r.total)} hint="Chegaram no período" />
        <BiKpi label="Matriculados" value={valor(r.matriculados)} hint="Do total que chegou" />
        <BiKpi label="Conversão" value={carregando ? '·' : formatarPercentual(r.conversao)} hint="Matriculados sobre interessados" />
        <BiKpi label="Perdidos" value={valor(r.perdidos)} hint="Encerrados sem matrícula" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <BiCartaoGrafico
          titulo="Interessados por etapa" carregando={carregando} vazio={!carregando && r.total === 0}
          altura={Math.max(160, etapas.length * 34 + 16)}
          tabela={{ columns: [{ label: 'Etapa', primary: true, render: x => x.nome }, { label: 'Interessados', align: 'right', render: x => formatarNumero(x.valor) }], rows: etapas, rowKey: x => x.nome }}
          onBaixar={() => baixarCsvGrafico('captacao_etapas', etapas, COLUNAS_ETAPA)}
          regra="Cada etapa conta quem chegou até ela ou além. Quem foi perdido não entra nas etapas de avanço."
          ariaLabel="Barras de interessados por etapa do funil"
        >
          <BarrasH dados={etapas} formatar={numero} rotuloSerie="Interessados" />
        </BiCartaoGrafico>
        <BiCartaoGrafico
          titulo="Interessados por origem" carregando={carregando} vazio={!carregando && r.total === 0}
          altura={Math.max(160, origens.length * 34 + 16)}
          tabela={{
            columns: [
              { label: 'Origem', primary: true, render: x => x.nome },
              { label: 'Interessados', align: 'right', render: x => formatarNumero(x.valor) },
              { label: 'Matriculados', align: 'right', render: x => formatarNumero(x.matriculados) },
              { label: 'Conversão', align: 'right', render: x => formatarPercentual(x.conversao) },
            ],
            rows: origens, rowKey: x => x.nome,
          }}
          onBaixar={() => baixarCsvGrafico('captacao_origens', origens, COLUNAS_ORIGEM)}
          regra="Origem informada no cadastro do interessado. Conversão é matriculados sobre interessados da origem."
          ariaLabel="Barras de interessados por origem"
        >
          <BarrasH dados={origens} formatar={numero} rotuloSerie="Interessados" />
        </BiCartaoGrafico>
      </div>
    </div>
  );
}
