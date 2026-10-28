import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { listar, mensagemDeErro } from './lib/estrutura';
import {
  listarTarefas, criarTarefa, atualizarTarefa, removerTarefa, validarTarefa, ordenarTarefas, estaVencida,
  LIMITE_TITULO, LIMITE_DESCRICAO, LIMITE_HABILIDADES, COMPONENTES_BNCC,
  anoDaSerie, componenteDaDisciplina, filtrarHabilidades,
  listarHabilidades, listarHabilidadesDasTarefas, salvarHabilidadesDaTarefa,
} from './lib/tarefas';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const hoje = () => new Date().toLocaleDateString('en-CA');
const formatarData = (iso) => iso.split('-').reverse().join('/');
const vazio = () => ({ titulo: '', descricao: '', data_entrega: hoje(), habilidades: [] });

// Fase 5B do Método Tradicional. modo 'professor': só as atribuições dele (a
// RLS barra o resto). modo 'gestao': todas as turmas da escola, para
// Coordenação e Direção acompanharem e corrigirem.
export default function Tarefas({ currentUser, currentSchool, modo = 'professor' }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [atribuicoes, setAtribuicoes] = useState([]);
  const [rotulos, setRotulos] = useState({});
  const [contexto, setContexto] = useState({});
  const [catalogo, setCatalogo] = useState([]);
  const [habsPorTarefa, setHabsPorTarefa] = useState({});
  const [componente, setComponente] = useState('');
  const [tarefas, setTarefas] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState(vazio());
  const [editandoId, setEditandoId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });
  const [apagar, setApagar] = useState(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [ats, ts, ds, series] = await Promise.all([
          listar('trad_atribuicoes', schoolId),
          listar('trad_turmas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_disciplinas', schoolId, { ordenarPor: 'nome' }),
          listar('trad_series', schoolId),
        ]);
        const lista = modo === 'gestao' ? ats : ats.filter(a => a.professor_id === currentUser?.id);
        const nomes = Object.fromEntries(lista.map(a => [
          a.id,
          `${ts.find(t => t.id === a.turma_id)?.nome || 'Turma'} · ${ds.find(d => d.id === a.disciplina_id)?.nome || 'Disciplina'}`,
        ]));
        const ordenadas = [...lista].sort((a, b) => nomes[a.id].localeCompare(nomes[b.id], 'pt-BR'));
        const ctx = Object.fromEntries(ordenadas.map(a => {
          const turma = ts.find(t => t.id === a.turma_id);
          return [a.id, {
            ano: anoDaSerie(series.find(x => x.id === turma?.serie_id)?.nome),
            componente: componenteDaDisciplina(ds.find(d => d.id === a.disciplina_id)?.nome),
          }];
        }));
        const lidas = await listarTarefas(schoolId, ordenadas.map(a => a.id));
        // O catálogo e os vínculos são complemento: falha aqui não impede as tarefas.
        const [cat, habs] = await Promise.all([
          listarHabilidades().catch(() => []),
          listarHabilidadesDasTarefas(schoolId, lidas.map(t => t.id)).catch(() => ({})),
        ]);
        if (!ativo) return;
        setAtribuicoes(ordenadas); setRotulos(nomes); setTarefas(lidas);
        setContexto(ctx); setCatalogo(cat); setHabsPorTarefa(habs);
        setFiltro(ordenadas[0]?.id || '');
      } catch (e) {
        if (ativo) setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId, currentUser?.id, modo]);

  const visiveis = useMemo(
    () => ordenarTarefas(tarefas.filter(t => !filtro || t.atribuicao_id === filtro), hoje()),
    [tarefas, filtro],
  );

  const cancelarEdicao = () => { setEditandoId(null); setForm(vazio()); };

  const anoAtual = contexto[filtro]?.ano || null;
  const componenteAtivo = componente || contexto[filtro]?.componente || '';
  const opcoes = useMemo(
    () => (anoAtual ? filtrarHabilidades(catalogo, { ano: anoAtual, componente: componenteAtivo }) : []),
    [catalogo, anoAtual, componenteAtivo],
  );
  const alternarHabilidade = (codigo) => setForm(f => {
    if (f.habilidades.includes(codigo)) return { ...f, habilidades: f.habilidades.filter(c => c !== codigo) };
    if (f.habilidades.length >= LIMITE_HABILIDADES) return f;
    return { ...f, habilidades: [...f.habilidades, codigo] };
  });

  const salvar = async () => {
    const problema = validarTarefa(form) || (!editandoId && !filtro ? 'Escolha a turma e a disciplina.' : '');
    if (problema) { setMsg({ tipo: 'erro', texto: problema }); return; }
    setSalvando(true);
    try {
      let salva;
      if (editandoId) {
        salva = await atualizarTarefa(schoolId, editandoId, form);
        setTarefas(ts => ts.map(t => (t.id === editandoId ? salva : t)));
      } else {
        salva = await criarTarefa(schoolId, { ...form, atribuicao_id: filtro, userId: currentUser?.id });
        setTarefas(ts => [salva, ...ts]);
      }
      let aviso = '';
      try {
        const gravadas = await salvarHabilidadesDaTarefa(schoolId, salva.id, form.habilidades, habsPorTarefa[salva.id] || []);
        setHabsPorTarefa(m => ({ ...m, [salva.id]: gravadas }));
      } catch {
        aviso = ' As habilidades da BNCC não foram salvas; edite a tarefa e tente de novo.';
      }
      cancelarEdicao();
      setMsg({ tipo: aviso ? 'erro' : 'ok', texto: `Tarefa salva.${aviso}` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const editar = (t) => {
    setEditandoId(t.id);
    setFiltro(t.atribuicao_id);
    setForm({ titulo: t.titulo, descricao: t.descricao, data_entrega: t.data_entrega, habilidades: habsPorTarefa[t.id] || [] });
    setComponente('');
    setMsg({ tipo: '', texto: '' });
  };

  const confirmarApagar = async () => {
    const alvo = apagar;
    setApagar(null);
    try {
      await removerTarefa(schoolId, alvo.id);
      setTarefas(ts => ts.filter(t => t.id !== alvo.id));
      if (editandoId === alvo.id) cancelarEdicao();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });
    }
  };

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Tarefas</h2>
      </div>
      {msg.texto && (
        <p className={`text-sm rounded-zela-md p-3 ${msg.tipo === 'erro' ? 'text-error bg-error/10' : 'text-primary bg-primary/10'}`}>{msg.texto}</p>
      )}
      {atribuicoes.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {modo === 'gestao' ? 'Nenhuma turma com professor atribuído.' : 'Você ainda não tem turmas atribuídas. Fale com a Coordenação.'}
        </p>
      ) : (
        <>
          <select value={filtro} onChange={e => { setFiltro(e.target.value); if (editandoId) cancelarEdicao(); }} className={campo} aria-label="Turma e disciplina">
            {modo === 'gestao' && <option value="">Todas as turmas</option>}
            {atribuicoes.map(a => <option key={a.id} value={a.id}>{rotulos[a.id]}</option>)}
          </select>

          <section className="bg-surface-container-low rounded-zela-md p-4 space-y-3">
            <h3 className="font-bold text-on-surface">{editandoId ? 'Editar tarefa' : 'Nova tarefa'}</h3>
            <input value={form.titulo} maxLength={LIMITE_TITULO} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Título" className={campo} />
            <textarea value={form.descricao} maxLength={LIMITE_DESCRICAO} rows={3} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Orientações para os alunos (opcional)" className={campo} />
            <label className="block text-sm text-on-surface-variant">
              Entrega
              <input type="date" value={form.data_entrega} onChange={e => setForm(f => ({ ...f, data_entrega: e.target.value }))} className={`${campo} mt-1`} />
            </label>
            {anoAtual && catalogo.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-on-surface-variant">Habilidades da BNCC ({form.habilidades.length}/{LIMITE_HABILIDADES})</p>
                <select value={componenteAtivo} onChange={e => setComponente(e.target.value)} className={campo} aria-label="Componente curricular">
                  <option value="">Todos os componentes</option>
                  {COMPONENTES_BNCC.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="max-h-48 overflow-y-auto space-y-1 border border-outline-variant rounded-zela-md p-2 bg-surface">
                  {opcoes.length === 0 && <p className="text-xs text-on-surface-variant">Nenhuma habilidade cadastrada para este ano e componente.</p>}
                  {opcoes.map(h => (
                    <label key={h.codigo} className="flex items-start gap-2 text-sm text-on-surface">
                      <input type="checkbox" checked={form.habilidades.includes(h.codigo)} onChange={() => alternarHabilidade(h.codigo)} className="mt-1" />
                      <span><span className="font-bold">{h.codigo}</span> {h.descricao}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-zela-md font-bold disabled:opacity-60">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {editandoId ? 'Salvar' : 'Publicar'}
              </button>
              {editandoId && <button onClick={cancelarEdicao} className="border border-outline-variant px-4 py-2 rounded-zela-md font-bold text-on-surface">Cancelar</button>}
            </div>
          </section>

          {visiveis.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhuma tarefa publicada.</p>
          ) : visiveis.map(t => (
            <article key={t.id} className="bg-surface-container-low rounded-zela-md p-4 space-y-1">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-on-surface break-words">{t.titulo}</h3>
                  <p className="text-xs text-on-surface-variant">{rotulos[t.atribuicao_id]}</p>
                </div>
                <span className={`text-sm ${estaVencida(t, hoje()) ? 'text-on-surface-variant' : 'text-brass font-bold'}`}>
                  {formatarData(t.data_entrega)}
                </span>
                <button onClick={() => editar(t)} aria-label="Editar" className="p-1.5 text-on-surface-variant"><Pencil size={16} /></button>
                <button onClick={() => setApagar(t)} aria-label="Excluir" className="p-1.5 text-error"><Trash2 size={16} /></button>
              </div>
              {t.descricao && <p className="text-sm text-on-surface whitespace-pre-wrap break-words">{t.descricao}</p>}
              {(habsPorTarefa[t.id] || []).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {habsPorTarefa[t.id].map(c => <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{c}</span>)}
                </div>
              )}
            </article>
          ))}
        </>
      )}
      {apagar && (
        <ConfirmModal title="Excluir" message={`Excluir a tarefa "${apagar.titulo}"?`} confirmLabel="Excluir"
          onConfirm={confirmarApagar} onCancel={() => setApagar(null)} />
      )}
    </div>
  );
}
