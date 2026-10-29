import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Copy, Download, EyeOff, MessageSquareText, Square } from 'lucide-react';
import { downloadCSV } from '../lib/gestaoUtils';
import { Loading, Notice, EmptyState, Modal, SecondaryButton, ResponsiveTable } from './GestaoShared';
import BiKpi from './bi/BiKpi';
import BiCartaoGrafico from './bi/BiCartaoGrafico';
import BarrasH from './bi/charts/BarrasH';
import {
  MIN_RESPOSTAS, PUBLICOS, ROTULO_STATUS, TIPOS_PERGUNTA, statusEfetivo, calcularNps, mediaDe, taxaResposta,
  serieDaPergunta, linhasExportacao, COLUNAS_EXPORTACAO, resultadosPesquisa, textosPesquisa, encerrarPesquisa,
} from '../lib/pesquisas';

const COR = 'var(--color-primary)';
const numero = (v) => String(v);
const um = (v) => v.toFixed(1).replace('.', ',');

// Resultados de uma pesquisa: taxa de resposta e um gráfico por pergunta
// (kit do BI). O banco já esconde o que não pode aparecer: pergunta oculta
// (anônima com menos de 5 respostas) e segmento com menos de 5.
export default function PesquisaResultados({ pesquisa, onVoltar, onDuplicar, onMudou }) {
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState('');
  const [comentarios, setComentarios] = useState(null); // { pergunta, linhas }
  const [encerrando, setEncerrando] = useState(false);

  const carregar = useCallback(() => resultadosPesquisa(pesquisa.id)
    .then(setRes)
    .catch(e => { setErro(e.message); setRes({ perguntas: [] }); }), [pesquisa.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const situacao = statusEfetivo(pesquisa);

  const encerrar = async () => {
    if (!window.confirm('Encerrar esta pesquisa agora? Ninguém mais poderá responder.')) return;
    setEncerrando(true);
    try { await encerrarPesquisa(pesquisa.id); await carregar(); onMudou(); } catch (e) { setErro(e.message); }
    setEncerrando(false);
  };

  const verComentarios = async (p) => {
    try { setComentarios({ pergunta: p, linhas: await textosPesquisa(pesquisa.id, p.id) }); } catch (e) { setErro(e.message); }
  };

  const exportar = () => downloadCSV(`pesquisa-${pesquisa.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.csv`, linhasExportacao(res), COLUNAS_EXPORTACAO);

  if (!res) return <Loading />;
  const taxa = taxaResposta(res.respostas || 0, res.elegiveis || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><ChevronLeft size={16} /> Voltar às pesquisas</button>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton type="button" onClick={onDuplicar}><Copy size={16} /> Duplicar</SecondaryButton>
          <SecondaryButton type="button" onClick={exportar} disabled={!res.perguntas?.length}><Download size={16} /> Exportar</SecondaryButton>
          {pesquisa.status === 'publicada' && situacao !== 'encerrada' && (
            <SecondaryButton type="button" onClick={encerrar} disabled={encerrando}><Square size={16} /> Encerrar agora</SecondaryButton>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-on-surface">{pesquisa.titulo}</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          {PUBLICOS[pesquisa.publico]}{pesquisa.publico === 'turmas' ? `: ${(pesquisa.turmas || []).join(', ')}` : ''} · {pesquisa.anonima ? 'Anônima' : 'Identificada'} · {ROTULO_STATUS[situacao]}
        </p>
      </div>

      {erro && <Notice type="error">{erro}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BiKpi label="Respostas" value={numero(res.respostas || 0)} />
        <BiKpi label="Podiam responder" value={numero(res.elegiveis || 0)} />
        <BiKpi label="Taxa de resposta" value={taxa === null ? '...' : `${taxa}%`} />
        <BiKpi label="Situação" value={ROTULO_STATUS[situacao]} />
      </div>

      {res.oculto && (
        <div className="p-2.5 rounded-zela-md text-sm font-medium flex items-start gap-2 border bg-brass-50 border-brass text-on-surface">
          <EyeOff size={16} className="shrink-0 mt-0.5 text-brass" />
          <span>Pesquisa anônima com menos de {MIN_RESPOSTAS} respostas: os resultados ficam escondidos para ninguém ser identificado.</span>
        </div>
      )}

      {res.perguntas.length === 0 ? (
        <EmptyState icon={MessageSquareText} text="Esta pesquisa não tem perguntas." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {res.perguntas.map(p => <CartaoPergunta key={p.id} p={p} onComentarios={() => verComentarios(p)} />)}
        </div>
      )}

      {comentarios && (
        <Modal wide title={comentarios.pergunta.enunciado} onClose={() => setComentarios(null)}>
          {comentarios.linhas.length === 0 ? (
            <EmptyState icon={MessageSquareText} text="Nenhum comentário para mostrar." hint={pesquisa.anonima ? `Pesquisa anônima só mostra comentários com ${MIN_RESPOSTAS} ou mais respostas.` : undefined} />
          ) : (
            <ul className="divide-y divide-outline-variant/60">
              {comentarios.linhas.map((l, i) => (
                <li key={i} className="py-2 text-sm">
                  <p className="whitespace-pre-wrap break-words text-on-surface">{l.texto}</p>
                  {l.autor && <p className="text-xs text-on-surface-variant mt-0.5">{l.autor}</p>}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function CartaoPergunta({ p, onComentarios }) {
  const titulo = `${p.ordem}. ${p.enunciado}`;
  if (p.oculto) {
    return (
      <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
        <h3 className="font-bold text-on-surface text-sm mb-1">{titulo}</h3>
        <p className="text-xs text-on-surface-variant">{TIPOS_PERGUNTA[p.tipo]} · escondida até ter {MIN_RESPOSTAS} respostas.</p>
      </section>
    );
  }
  if (p.tipo === 'texto') {
    return (
      <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-col gap-3">
        <h3 className="font-bold text-on-surface text-sm">{titulo}</h3>
        <p className="text-sm text-on-surface-variant tabular-nums">{p.respostas} comentário{p.respostas === 1 ? '' : 's'}</p>
        <div><SecondaryButton type="button" onClick={onComentarios} disabled={!p.respostas}><MessageSquareText size={16} /> Ler comentários</SecondaryButton></div>
      </section>
    );
  }

  const dados = serieDaPergunta(p).map(s => ({ ...s, cor: COR }));
  const nps = p.tipo === 'nps' ? calcularNps(p.distribuicao) : null;
  const media = p.tipo === 'escala5' ? mediaDe(p.distribuicao) : null;
  const colunas = [
    { label: p.tipo === 'multipla' ? 'Opção' : 'Nota', primary: true, render: r => r.nome },
    { label: 'Respostas', align: 'right', render: r => r.valor },
  ];
  const segmentos = (p.segmentos || []).map(s => {
    if (p.tipo === 'nps') { const n = calcularNps(s.distribuicao); return { segmento: s.segmento, respostas: s.respostas, valor: n.nps }; }
    return { segmento: s.segmento, respostas: s.respostas, valor: mediaDe(s.distribuicao) };
  });

  return (
    <div className="min-w-0 space-y-2">
    <BiCartaoGrafico
      titulo={titulo} vazio={!p.respostas} altura={p.tipo === 'nps' ? 300 : Math.max(140, dados.length * 34)}
      tabela={{ columns: colunas, rows: dados, rowKey: (r) => r.nome }}
      onBaixar={() => downloadCSV(`pergunta-${p.ordem}.csv`, dados, [{ label: 'Resposta', value: 'nome' }, { label: 'Quantidade', value: 'valor' }])}
      ariaLabel={`${p.enunciado}: ${p.respostas} respostas`}
      regra={nps?.nps != null ? `NPS ${nps.nps}: ${nps.promotores} promotores (9 e 10), ${nps.neutros} neutros (7 e 8) e ${nps.detratores} detratores (0 a 6). ${p.respostas} respostas.`
        : media != null ? `Média ${um(media)} de 5. ${p.respostas} respostas.` : `${p.respostas} respostas.`}
    >
      <BarrasH dados={dados} formatar={numero} larguraRotulo={p.tipo === 'nps' ? 28 : 120} rotuloSerie="Respostas" />
    </BiCartaoGrafico>
    {segmentos.length > 0 && (
      <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
        <h3 className="font-bold text-on-surface text-sm mb-2">Por turma</h3>
        <ul className="divide-y divide-outline-variant/60">
          {segmentos.map(s => (
            <li key={s.segmento} className="py-2 flex items-center justify-between text-sm gap-2">
              <span className="text-on-surface">{s.segmento}</span>
              <span className="text-on-surface-variant tabular-nums">
                {s.valor == null ? '...' : p.tipo === 'nps' ? `NPS ${s.valor}` : `Média ${um(s.valor)}`} · {s.respostas} respostas
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-on-surface-variant mt-2">Turmas com menos de {MIN_RESPOSTAS} respostas não aparecem.</p>
      </section>
    )}
    </div>
  );
}
