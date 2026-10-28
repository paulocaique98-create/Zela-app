import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, FileSpreadsheet, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageShell, Tabs, Loading, SecondaryButton } from '../GestaoShared';
import BiFiltros, { FILTROS_VAZIOS } from './BiFiltros';
import BiDrillModal from './BiDrillModal';
import { resolverPeriodo, periodoDeComparacao, validarPeriodo } from '../../lib/bi/periodos';
import { atualizarMapaCores } from '../../lib/bi/coresEntidade';

// Recharts só é baixado quando o painel abre: as abas são lazy.
const VisaoGeral = lazy(() => import('./abas/VisaoGeral'));
const Financeiro = lazy(() => import('./abas/Financeiro'));

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

// Painel de indicadores da Gestão (Fase 1.3: Visão geral e Financeiro).
// A Coordenação (gestao_pedagogica) não vê a aba Financeiro; o banco também barra.
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

  const abas = [{ id: 'visao', label: 'Visão geral' }, ...(ehGestao ? [{ id: 'financeiro', label: 'Financeiro' }] : [])];
  const abaAtual = abas.some(a => a.id === aba) ? aba : 'visao';
  const hora = atualizadoEm ? new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : null;

  const propsAba = {
    periodo, comparado, turmas: filtros.turmas, chaveCache, exportRef, atualizacao,
    onAtualizado: setAtualizadoEm, onDrill: (indicador) => setDrill({ indicador }),
  };
  const tela = drill && TELA_DO_DETALHE[drill.indicador];

  return (
    <PageShell
      actions={(
        <>
          {hora && <span className="text-xs text-on-surface-variant">Atualizado às {hora}</span>}
          <SecondaryButton type="button" onClick={() => setAtualizacao(n => n + 1)}><RefreshCw size={14} /> Atualizar</SecondaryButton>
          <SecondaryButton type="button" onClick={() => exportRef.current?.()}><FileSpreadsheet size={14} /> Exportar planilha</SecondaryButton>
          <SecondaryButton type="button" onClick={() => window.print()}><Printer size={14} /> Imprimir</SecondaryButton>
        </>
      )}
    >
      <div className="space-y-4">
        <BiFiltros
          valor={filtros}
          opcoes={{ turmas: turmasEscola }}
          onChange={setFiltros}
          onLimpar={() => setFiltros(f => ({ ...f, ...FILTROS_VAZIOS }))}
        />
        {abas.length > 1 && <Tabs tabs={abas} active={abaAtual} onChange={setAba} />}
        {!erroPeriodo && (
          <Suspense fallback={<Loading />}>
            {abaAtual === 'visao' && <VisaoGeral {...propsAba} mapaCores={mapaCores} onFiltrarTurma={alternarTurma} />}
            {abaAtual === 'financeiro' && ehGestao && <Financeiro {...propsAba} />}
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
