import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sprout } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { SITUACAO_LABEL, periodoLabel, mapaIndisponivel } from '../lib/mapaHabilidades';

const COR = {
  sem_interesse: 'bg-slate-100 text-slate-700 border-slate-200',
  adquirindo: 'bg-amber-50 text-amber-700 border-amber-200',
  adquirido: 'bg-green-50 text-green-700 border-green-200',
};

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

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (erro) return <div className="p-4 text-sm text-red-600">{erro}</div>;
  if (registros.length === 0) {
    return (
      <div className="text-center py-16 text-on-surface-variant">
        <Sprout className="mx-auto h-12 w-12 text-outline-variant mb-3" />
        <p className="text-sm font-semibold">O Mapa de Habilidades ainda não foi publicado.</p>
      </div>
    );
  }

  const campo = 'border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-white text-on-surface';
  return (
    <div className="max-w-3xl mx-auto space-y-4">
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
      {linhas.map(([area, itens]) => (
        <section key={area} className="rounded-zela-lg border border-outline-variant p-4">
          <h3 className="text-[11px] font-extrabold uppercase text-primary mb-2">{area}</h3>
          <ul className="space-y-2">
            {itens.map(({ r, h }) => (
              <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-on-surface">{h.descricao}</span>
                <span className={`shrink-0 text-[10px] font-extrabold uppercase px-2 py-1 rounded-md border ${COR[r.situacao]}`}>{SITUACAO_LABEL[r.situacao]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
