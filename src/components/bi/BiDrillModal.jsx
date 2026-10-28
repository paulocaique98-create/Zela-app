import React from 'react';
import { Modal, ResponsiveTable, Notice, Loading, EmptyState, SecondaryButton } from '../GestaoShared';
import { useBiQuery } from '../../hooks/useBiQuery';
import { formatarMoeda } from '../../lib/bi/formatos';
import { baixarCsvGrafico } from '../../lib/bi/exportar';

const STATUS = { PAID: 'Pago', OVERDUE: 'Em atraso', PENDING: 'Pendente', AWAITING_PAYMENT: 'Aguardando pagamento' };
const FORMAS = { pix: 'Pix', boleto: 'Boleto', credit_card: 'Cartão', link: 'Link', cash: 'Dinheiro', transfer: 'Transferência', other: 'Outra' };
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '·');

const TITULOS = {
  financeiro_previsto: 'Cobranças previstas no período',
  financeiro_recebido: 'Cobranças recebidas no período',
  financeiro_atraso: 'Cobranças em atraso no período',
  alunos_ativos: 'Alunos ativos',
};

// Lista que forma o número de um KPI. A RPC bi_detalhe devolve no máximo 500 linhas
// e barra o financeiro para quem não é Gestão.
// aberto: { indicador } | null; tela: { aba, rotulo } leva à tela operacional.
export default function BiDrillModal({ aberto, periodo, turmas, chaveCache, onFechar, tela, onAbrirTela }) {
  const params = {
    p_indicador: aberto.indicador, p_inicio: periodo.inicio, p_fim: periodo.fim,
    p_filtros: { turmas }, p_limite: 200,
  };
  const { dados, carregando, erro } = useBiQuery('bi_detalhe', params, { chave: chaveCache });
  const financeiro = aberto.indicador.startsWith('financeiro_');
  const linhas = dados?.linhas || [];

  const colunas = financeiro
    ? [
      { label: 'Aluno', primary: true, render: r => r.aluno },
      { label: 'Turma', render: r => r.turma || '·' },
      { label: 'Vencimento', render: r => dataBR(r.due_date) },
      { label: 'Valor', align: 'right', render: r => formatarMoeda(r.amount_cents) },
      { label: 'Situação', render: r => STATUS[r.status] || r.status },
      { label: 'Forma', hideOnMobile: true, render: r => (r.payment_method ? FORMAS[r.payment_method] || r.payment_method : '·') },
    ]
    : [
      { label: 'Aluno', primary: true, render: r => r.aluno },
      { label: 'Turma', render: r => r.turma || '·' },
      { label: 'Turno', render: r => r.turno || '·' },
    ];
  const colunasCsv = financeiro
    ? [
      { label: 'Aluno', value: 'aluno' }, { label: 'Turma', value: 'turma' }, { label: 'Vencimento', value: r => dataBR(r.due_date) },
      { label: 'Valor (R$)', value: r => (r.amount_cents / 100).toFixed(2).replace('.', ',') },
      { label: 'Situação', value: r => STATUS[r.status] || r.status },
    ]
    : [{ label: 'Aluno', value: 'aluno' }, { label: 'Turma', value: 'turma' }, { label: 'Turno', value: 'turno' }];

  return (
    <Modal
      wide
      title={TITULOS[aberto.indicador] || 'Detalhe'}
      onClose={onFechar}
      footer={(
        <>
          {tela && <SecondaryButton type="button" onClick={() => onAbrirTela(tela.aba)}>{tela.rotulo}</SecondaryButton>}
          {linhas.length > 0 && <SecondaryButton type="button" onClick={() => baixarCsvGrafico(`detalhe_${aberto.indicador}`, linhas, colunasCsv)}>Baixar planilha</SecondaryButton>}
          <SecondaryButton type="button" onClick={onFechar}>Fechar</SecondaryButton>
        </>
      )}
    >
      {carregando ? <Loading /> : erro ? <Notice type="error">Não foi possível carregar a lista.</Notice> : linhas.length === 0 ? (
        <EmptyState text="Nada para listar." hint="Mude o período ou os filtros." />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant">
            {dados.total > linhas.length ? `Mostrando ${linhas.length} de ${dados.total}.` : `${dados.total} ${dados.total === 1 ? 'registro' : 'registros'}.`}
          </p>
          <ResponsiveTable columns={colunas} rows={linhas} rowKey={(r) => r.id} />
        </div>
      )}
    </Modal>
  );
}
