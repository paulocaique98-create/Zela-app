import React, { useState } from 'react';
import { Table2, BarChart3, Download } from 'lucide-react';
import { EmptyState, ResponsiveTable, SecondaryButton } from '../GestaoShared';

// Cartão padrão de todo gráfico do painel: título, legenda clicável,
// "Ver como tabela", "Baixar", estado vazio, esqueleto e rodapé com a regra.
// legenda: [{ id, label, cor, oculta? }]; onAlternarSerie(id) liga/desliga a série.
// tabela: { columns, rows } no formato do ResponsiveTable (mesmos dados do gráfico).
export default function BiCartaoGrafico({
  titulo, legenda = [], onAlternarSerie, carregando = false, vazio = false,
  tabela = null, onBaixar, regra, ariaLabel, altura = 260, children,
}) {
  const [comoTabela, setComoTabela] = useState(false);
  const mostrarTabela = comoTabela && tabela;

  return (
    <section className="min-w-0 bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 print:break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-bold text-on-surface text-sm">{titulo}</h3>
        {!carregando && !vazio && (
          <div className="flex items-center gap-2">
            {tabela && (
              <SecondaryButton type="button" onClick={() => setComoTabela(v => !v)} className="!px-2.5 !py-1.5 text-xs">
                {comoTabela ? <BarChart3 size={14} /> : <Table2 size={14} />}
                {comoTabela ? 'Ver gráfico' : 'Ver como tabela'}
              </SecondaryButton>
            )}
            {onBaixar && (
              <SecondaryButton type="button" onClick={onBaixar} className="!px-2.5 !py-1.5 text-xs" aria-label={`Baixar ${titulo}`}>
                <Download size={14} />
                Baixar
              </SecondaryButton>
            )}
          </div>
        )}
      </div>

      {legenda.length > 1 && !mostrarTabela && !carregando && !vazio && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3" aria-label="Legenda">
          {legenda.map(item => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onAlternarSerie?.(item.id)}
                aria-pressed={!item.oculta}
                className={`inline-flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface ${item.oculta ? 'opacity-50 line-through' : ''}`}
              >
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: item.cor }} aria-hidden="true" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {carregando ? (
        <div className="animate-pulse rounded-zela-md bg-surface-container-low" style={{ height: altura }} role="status" aria-label="Carregando" />
      ) : vazio ? (
        <EmptyState text="Sem dados no período." hint="Mude o período ou os filtros." />
      ) : mostrarTabela ? (
        <ResponsiveTable columns={tabela.columns} rows={tabela.rows} rowKey={tabela.rowKey || ((_, i) => i)} />
      ) : (
        <div role="img" aria-label={ariaLabel || titulo} style={{ height: altura }} className="min-w-0">{children}</div>
      )}

      {regra && <p className="text-xs text-on-surface-variant mt-3">{regra}</p>}
    </section>
  );
}
