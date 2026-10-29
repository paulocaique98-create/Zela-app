import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, FileSpreadsheet, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageShell, Tabs, Loading, SecondaryButton } from '../GestaoShared';
import BiFiltros, { BiFiltrosResumo, FILTROS_VAZIOS } from './BiFiltros';
import BiDrillModal from './BiDrillModal';
import { resolverPeriodo, periodoDeComparacao, validarPeriodo } from '../../lib/bi/periodos';
import { atualizarMapaCores } from '../../lib/bi/coresEntidade';

// Recharts só é baixado quando o painel abre: as abas são lazy.
const VisaoGeral = lazy(() => import('./abas/VisaoGeral'));
const Financeiro = lazy(() => import('./abas/Financeiro'));
const Matriculas = lazy(() => import('./abas/Matriculas'));
const Frequencia = lazy(() => import('./abas/Frequencia'));
const Academico = lazy(() => import('./abas/Academico'));
const Operacao = lazy(() => import('./abas/Operacao'));

const FILTROS_INICIAIS = { preset: 'este-mes', comparacao: 'nenhuma', inicio: '', fim: '', ...FILTROS_VAZIOS };
const TELA_DO_DETALHE = {
  financeiro_previsto: { aba: 'financeiro-cobrancas', rotulo: 'Abrir Cobranças' },
  financeiro_recebido: { aba: 'financeiro-recebimentos', rotulo: 'Abrir Recebimentos' },
  financeiro_atraso: { aba: 'financeiro-inadimplencia', rotulo: 'Abrir Inadimplência' },
};

function lerFiltros(chave) {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(chave) || 'null');
    return salvo && Array.isArray(salvo.turmas) ? { ...FILTROS_INICIAIS, ...salvo } : FILTROS_INICIAIS;
  } catch {
    return FILTROS_INICIAIS;
  }
}

// Painel de indicadores da Gestão (Fases 1.3 a 1.5: Visão geral, Financeiro, Matrículas, Frequência, Acadêmico e Operação).
// A Coordenação (gestao_pedagogica) não vê a aba Financeiro; o banco também barra.
// Marca o body durante a impressão para o CSS (index.css) esconder o menu e
// liberar a altura só do painel.
function imprimir() {
  const limpar = () => {
    document.body.classList.remove('imprimindo-bi');
    window.removeEventListener('afterprint', limpar);
  };
  document.body.classList.add('imprimindo-bi');
  window.addEventListener('afterprint', limpar);
  window.print();
}

export default function GestaoPainelBI({ currentUser, setGestaoTab }) {
  const userId = currentUser?.id;
  const schoolId = currentUser?.school_id;
  const ehGestao = currentUser?.role === 'gestao';
  const chaveFiltros = `zela:bi:filtros:${userId}`;
  const chaveCache = `${userId}|${schoolId}`;

  const [filtros, setFiltros] = useState(() => lerFiltros(chaveFiltros));
  const [aba, setAba] = useState('visao');
  const [anoLetivo, setAnoLetivo] = useState(null);
  const [turmasEscola, setTurmasEscola] = useState([]);
  const [atualizacao, setAtualizacao] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [drill, setDrill] = useState(null);
  const exportRef = useRef(null);

  useEffect(() => {
    try { sessionStorage.setItem(chaveFiltros, JSON.stringify(filtros)); } catch { /* armazenamento indisponível */ }
  }, [filtros, chaveFiltros]);

  useEffect(() => {
    if (!schoolId) return;
    let ativo = true;
    Promise.all([
      supabase.from('school_years').select('starts_on, ends_on').eq('school_id', schoolId).eq('status', 'aberto').maybeSingle(),
      supabase.from('students').select('turma').eq('school_id', schoolId).not('turma', 'is', null).limit(3000),
    ]).then(([ano, alunos]) => {
      if (!ativo) return;
      if (ano.data?.starts_on && ano.data?.ends_on) setAnoLetivo({ start_date: ano.data.starts_on, end_date: ano.data.ends_on });
      setTurmasEscola([...new Set((alunos.data || []).map(a => a.turma).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    });
    return () => { ativo = false; };
  }, [schoolId]);

  const periodo = useMemo(() => resolverPeriodo(filtros.preset, { anoLetivo, personalizado: { inicio: filtros.inicio, fim: filtros.fim } }), [filtros.preset, filtros.inicio, filtros.fim, anoLetivo]);
  const erroPeriodo = validarPeriodo(periodo);
  const comparado = useMemo(() => {
    const c = erroPeriodo ? null : periodoDeComparacao(periodo, filtros.comparacao);
    return c && !validarPeriodo(c) ? c : null;
  }, [periodo, filtros.comparacao, erroPeriodo]);
  const mapaCores = useMemo(() => atualizarMapaCores(turmasEscola), [turmasEscola]);

  const alternarTurma = useCallback((nome) => {
    setFiltros(f => ({ ...f, turmas: f.turmas.includes(nome) ? f.turmas.filter(t => t !== nome) : [...f.turmas, nome] }));
  }, []);

  const abas = [
    { id: 'visao', label: 'Visão geral' },
    ...(ehGestao ? [{ id: 'financeiro', label: 'Financeiro' }] : []),
    { id: 'matriculas', label: 'Matrículas' },
    { id: 'frequencia', label: 'Frequência' },
    { id: 'academico', label: 'Acadêmico' },
    { id: 'operacao', label: 'Operação' },
  ];
  const abaAtual = abas.some(a => a.id === aba) ? aba : 'visao';
  const hora = atualizadoEm ? new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : null;

  const propsAba = {
    periodo, comparado, turmas: filtros.turmas, chaveCache, exportRef, atualizacao,
    onAtualizado: setAtualizadoEm, onDrill: (indicador) => setDrill({ indicador }),
  };
  const tela = drill && TELA_DO_DETALHE[drill.indicador];

  return (
    <PageShell
      actionsFull
      actions={(
        <div className="w-full flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <BiFiltros valor={filtros} opcoes={{ turmas: turmasEscola }} onChange={setFiltros} />
          <div className="flex items-center gap-2 flex-wrap">
            <SecondaryButton type="button" onClick={() => setAtualizacao(n => n + 1)}><RefreshCw size={14} /> Atualizar</SecondaryButton>
            <SecondaryButton type="button" onClick={() => exportRef.current?.()}><FileSpreadsheet size={14} /> Exportar</SecondaryButton>
            <SecondaryButton type="button" onClick={imprimir}><Printer size={14} /> Imprimir</SecondaryButton>
          </div>
        </div>
      )}
    >
      <div className="space-y-4 bi-area-impressao">
        <BiFiltrosResumo
          valor={filtros}
          onChange={setFiltros}
          onLimpar={() => setFiltros(f => ({ ...f, ...FILTROS_VAZIOS }))}
        />
        {abas.length > 1 && <Tabs tabs={abas} active={abaAtual} onChange={setAba} distribuir />}
        {!erroPeriodo && (
          <Suspense fallback={<Loading />}>
            {abaAtual === 'visao' && <VisaoGeral {...propsAba} mapaCores={mapaCores} onFiltrarTurma={alternarTurma} />}
            {abaAtual === 'financeiro' && ehGestao && <Financeiro {...propsAba} />}
            {abaAtual === 'matriculas' && <Matriculas {...propsAba} mapaCores={mapaCores} onFiltrarTurma={alternarTurma} />}
            {abaAtual === 'frequencia' && <Frequencia {...propsAba} mapaCores={mapaCores} onFiltrarTurma={alternarTurma} />}
            {abaAtual === 'academico' && <Academico {...propsAba} mapaCores={mapaCores} />}
            {abaAtual === 'operacao' && <Operacao {...propsAba} />}
          </Suspense>
        )}
      </div>
      {drill && !erroPeriodo && (
        <BiDrillModal
          aberto={drill} periodo={periodo} turmas={filtros.turmas} chaveCache={chaveCache}
          onFechar={() => setDrill(null)}
          tela={tela && setGestaoTab ? tela : null}
          onAbrirTela={(destino) => { setDrill(null); setGestaoTab(destino); }}
        />
      )}
    </PageShell>
  );
}
