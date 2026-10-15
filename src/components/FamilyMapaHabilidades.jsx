import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Calculator, CircleCheck, CircleDashed, Eye, Footprints, Globe, Hand, Heart, Loader2, Sprout, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { AREAS_PADRAO, SITUACAO_LABEL, periodoLabel, mapaIndisponivel } from '../lib/mapaHabilidades';

const VISUAL = {
  adquirido: { Icone: CircleCheck, cor: 'bg-success/10 text-success' },
  adquirindo: { Icone: TrendingUp, cor: 'bg-warning/15 text-warning' },
  sem_interesse: { Icone: CircleDashed, cor: 'bg-surface-container text-on-surface-variant' },
};
const SITUACOES_VISUAIS = [
  { chave: 'adquirido', Icone: CircleCheck },
  { chave: 'adquirindo', Icone: TrendingUp },
  { chave: 'sem_interesse', Icone: CircleDashed },
];
const ICONE_AREA = [
  ['linguagem', BookOpen], ['matem', Calculator], ['vida pr', Hand], ['sensorial', Eye],
  ['movimento', Footprints], ['cultura', Globe], ['conviv', Heart],
];
function iconeDaArea(area) {
  const nome = String(area || '').toLowerCase();
  return (ICONE_AREA.find(([chave]) => nome.includes(chave)) || [null, Sprout])[1];
}

// A RLS só devolve registros PUBLICADOS dos próprios filhos.
export default function FamilyMapaHabilidades({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [registros, setRegistros] = useState([]);
  const [habilidades, setHabilidades] = useState({});
  const [alunos, setAlunos] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [alunoSel, setAlunoSel] = useState('');
  const [periodoSel, setPeriodoSel] = useState('');
  const [abertas, setAbertas] = useState(() => new Set());

  useEffect(() => {
    if (!schoolId) return undefined;
    let cancelado = false;
    (async () => {
      setCarregando(true);
      try {
        const regs = await buscarTodos(() => supabase.from('mapa_habilidades_registros')
          .select('id, student_id, habilidade_id, ano, semestre, situacao')
          .eq('school_id', schoolId).eq('status', 'PUBLICADO').order('id', { ascending: true }));
        const idsHab = [...new Set(regs.map(r => r.habilidade_id))];
        const idsAluno = [...new Set(regs.map(r => r.student_id))];
        const [hab, alu] = await Promise.all([
          idsHab.length ? buscarTodos(() => supabase.from('mapa_habilidades').select('id, area, descricao').eq('school_id', schoolId).order('id', { ascending: true })) : [],
          idsAluno.length ? supabase.from('students').select('id, name').in('id', idsAluno).then(({ data }) => data || []) : [],
        ]);
        if (cancelado) return;
        setRegistros(regs);
        setHabilidades(Object.fromEntries(hab.map(h => [h.id, h])));
        setAlunos(Object.fromEntries(alu.map(a => [a.id, a])));
      } catch (e) {
        console.error('[FamilyMapaHabilidades] Erro ao carregar:', e);
        if (!cancelado) setErro(mapaIndisponivel(e) ? 'O Mapa de Habilidades ainda não está disponível.' : 'Não foi possível carregar o Mapa de Habilidades.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [schoolId]);

  const listaAlunos = useMemo(() => Object.values(alunos).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [alunos]);
  const aluno = alunoSel || listaAlunos[0]?.id || '';
  const periodos = useMemo(() => {
    const chaves = new Set(registros.filter(r => r.student_id === aluno).map(r => `${r.ano}|${r.semestre}`));
    return [...chaves].sort().reverse();
  }, [registros, aluno]);
  const periodo = periodoSel && periodos.includes(periodoSel) ? periodoSel : periodos[0] || '';

  const linhas = useMemo(() => {
    const [a, s] = periodo.split('|').map(Number);
    const porArea = new Map();
    registros.filter(r => r.student_id === aluno && r.ano === a && r.semestre === s).forEach(r => {
      const h = habilidades[r.habilidade_id];
      if (!h) return;
      porArea.set(h.area, [...(porArea.get(h.area) || []), { r, h }]);
    });
    return [...porArea.entries()].sort((x, y) => x[0].localeCompare(y[0], 'pt-BR'));
  }, [registros, habilidades, aluno, periodo]);

  // As áreas padrão sempre aparecem (na ordem fixa); áreas extras do catálogo entram depois.
  // Dentro de cada uma, só o que foi publicado para a criança.
  const areasCompletas = (() => {
    const publicadas = new Map(linhas);
    const extras = new Set([...publicadas.keys(), ...Object.values(habilidades).map(h => h.area)].filter(a => a && !AREAS_PADRAO.includes(a)));
    const ordem = [...AREAS_PADRAO, ...[...extras].sort((x, y) => x.localeCompare(y, 'pt-BR'))];
    return ordem.map(area => [area, publicadas.get(area) || []]);
  })();
  const alternar = area => setAbertas(prev => {
    const novo = new Set(prev);
    if (novo.has(area)) novo.delete(area); else novo.add(area);
    return novo;
  });
  const todasAbertas = areasCompletas.length > 0 && areasCompletas.every(([area]) => abertas.has(area));

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (erro) return <div className="p-4 text-sm text-error">{erro}</div>;
  if (registros.length === 0) {
    return (
      <div className="text-center py-16 text-on-surface-variant">
        <Sprout className="mx-auto h-12 w-12 text-outline-variant mb-3" />
        <p className="text-sm font-semibold">O Mapa de Habilidades ainda não foi publicado.</p>
      </div>
    );
  }

  const campo = 'border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-white text-on-surface';
  const nomeAluno = alunos[aluno]?.name || '';
  const todos = linhas.flatMap(([, itens]) => itens);
  const contagem = { adquirido: 0, adquirindo: 0, sem_interesse: 0 };
  todos.forEach(({ r }) => { if (contagem[r.situacao] !== undefined) contagem[r.situacao] += 1; });
  const pct = todos.length ? Math.round((contagem.adquirido / todos.length) * 100) : 0;
  const [anoSel, semSel] = periodo.split('|').map(Number);

  return (
    <div className="w-full space-y-4 px-3 sm:px-5">
      <div className="rounded-zela-xl bg-primary text-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-zela-lg bg-white/15 flex items-center justify-center shrink-0"><Sprout size={24} /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/80">Mapa de Habilidades</p>
            <h2 className="text-xl sm:text-2xl font-bold font-serif truncate">{nomeAluno}</h2>
            {periodo && <p className="text-sm text-white/80">{periodoLabel({ ano: anoSel, semestre: semSel })}</p>}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-sm font-semibold">{contagem.adquirido} de {todos.length} {todos.length === 1 ? 'habilidade conquistada' : 'habilidades conquistadas'}</span>
            <span className="text-2xl font-bold">{pct}%</span>
          </div>
          <div className="h-2.5 rounded-sm bg-white/20 overflow-hidden">
            <div className="h-full rounded-sm bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {SITUACOES_VISUAIS.map(({ chave, Icone }) => (
            <div key={chave} className="rounded-zela-md bg-white/10 px-2 py-2.5 text-center">
              <Icone size={18} className="mx-auto mb-1" />
              <p className="text-lg font-bold leading-none">{contagem[chave]}</p>
              <p className="text-[11px] text-white/80 mt-1">{SITUACAO_LABEL[chave]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {listaAlunos.length > 1 && (
          <select value={aluno} onChange={e => { setAlunoSel(e.target.value); setPeriodoSel(''); }} className={`${campo} flex-1`} aria-label="Criança">
            {listaAlunos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select value={periodo} onChange={e => setPeriodoSel(e.target.value)} className={`${campo} flex-1`} aria-label="Período">
          {periodos.map(p => { const [a, s] = p.split('|').map(Number); return <option key={p} value={p}>{periodoLabel({ ano: a, semestre: s })}</option>; })}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-on-surface">Áreas de desenvolvimento</h3>
        <button type="button" onClick={() => setAbertas(todasAbertas ? new Set() : new Set(areasCompletas.map(([area]) => area)))}
          className="text-xs font-bold text-primary px-2 py-1.5 rounded-zela-md hover:bg-primary/10">
          {todasAbertas ? 'Recolher todas' : 'Expandir todas'}
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 items-start">
        {areasCompletas.map(([area, itens]) => {
          const AreaIcone = iconeDaArea(area);
          const conquistadas = itens.filter(({ r }) => r.situacao === 'adquirido').length;
          const aberta = abertas.has(area);
          return (
            <section key={area} className="rounded-zela-lg border border-outline-variant bg-white overflow-hidden">
              <button type="button" onClick={() => alternar(area)} aria-expanded={aberta}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-container-lowest">
                <span className="w-8 h-8 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center shrink-0"><AreaIcone size={17} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-on-surface truncate">{area}</h3>
                  <p className="text-xs text-on-surface-variant">
                    {itens.length === 0 ? 'Nenhuma habilidade registrada ainda' : `${conquistadas} de ${itens.length} conquistadas`}
                  </p>
                </div>
                {itens.length > 0 && (
                  <div className="w-12 sm:w-16 h-1.5 rounded-sm bg-surface-container overflow-hidden shrink-0">
                    <div className="h-full rounded-sm bg-success" style={{ width: `${Math.round((conquistadas / itens.length) * 100)}%` }} />
                  </div>
                )}
                <ChevronDown size={18} className={`text-on-surface-variant shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />
              </button>
              {aberta && (
                itens.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-on-surface-variant border-t border-outline-variant/60">As habilidades desta área aparecem aqui quando a escola publicar.</p>
                ) : (
                  <ul className="divide-y divide-outline-variant/60 border-t border-outline-variant">
                    {itens.map(({ r, h }) => {
                      const { Icone, cor } = VISUAL[r.situacao] || VISUAL.sem_interesse;
                      return (
                        <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className={`w-7 h-7 rounded-zela-md flex items-center justify-center shrink-0 ${cor}`}><Icone size={15} /></span>
                          <span className="flex-1 text-sm text-on-surface">{h.descricao}</span>
                          <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-sm ${cor}`}>{SITUACAO_LABEL[r.situacao]}</span>
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
