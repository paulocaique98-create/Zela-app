import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, PrimaryButton, SecondaryButton, ResponsiveTable } from './GestaoShared';
import PesquisaForm from './PesquisaForm';
import {
  PUBLICOS, ROTULO_STATUS, statusEfetivo, formularioVazio, listarPesquisas, carregarPerguntas, salvarPesquisa,
  publicarPesquisa, excluirPesquisa, notificarPesquisa,
} from '../lib/pesquisas';

const PesquisaResultados = lazy(() => import('./PesquisaResultados'));

const TOM_STATUS = {
  rascunho: 'bg-surface-container text-on-surface-variant',
  agendada: 'bg-brass-50 text-on-surface',
  aberta: 'bg-success/10 text-success',
  encerrada: 'bg-surface-container text-on-surface-variant',
};

// Comunicação › Pesquisas (módulo `avaliacao_institucional`). Gestão, Coordenação e
// Direção criam, publicam e acompanham. Pesquisa publicada não se edita (as
// respostas perderiam o sentido): para mudar, duplica. Tudo grava por RPC.
export default function GestaoPesquisas({ currentUser }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState(null); // { id, inicial, titulo }
  const [detalhe, setDetalhe] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const schoolId = currentUser.school_id;

  const carregar = useCallback(() => listarPesquisas(schoolId)
    .then(l => { setErro(''); setLista(l); })
    .catch(e => { setErro(e.message); setLista([]); }), [schoolId]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    supabase.from('students').select('turma').eq('school_id', schoolId).not('turma', 'is', null).limit(3000)
      .then(({ data }) => setTurmas([...new Set((data || []).map(a => a.turma).filter(Boolean))].sort()));
  }, [schoolId]);

  const abrirForm = async (p, { duplicar = false } = {}) => {
    setErro('');
    try {
      const perguntas = (await carregarPerguntas(schoolId, p.id)).map(q => ({
        tipo: q.tipo, enunciado: q.enunciado, opcoes: q.opcoes || [], obrigatoria: q.obrigatoria,
      }));
      const vazio = formularioVazio();
      setForm({
        id: duplicar ? null : p.id,
        titulo: duplicar ? 'Duplicar pesquisa' : 'Editar pesquisa',
        inicial: {
          titulo: duplicar ? `${p.titulo} (cópia)` : p.titulo, descricao: p.descricao || '', publico: p.publico,
          turmas: p.turmas || [], anonima: p.anonima,
          abre_em: duplicar ? vazio.abre_em : p.abre_em, fecha_em: duplicar ? vazio.fecha_em : p.fecha_em, perguntas,
        },
      });
    } catch (e) { setErro(e.message); }
  };

  const salvar = async (f, publicar) => {
    const id = await salvarPesquisa(form.id, f);
    if (publicar) {
      await publicarPesquisa(id);
      notificarPesquisa(id);
    }
    setForm(null);
    setAviso(publicar ? 'Pesquisa publicada. O público será avisado.' : 'Rascunho salvo.');
    await carregar();
  };

  const excluir = async (p) => {
    if (!window.confirm(`Excluir o rascunho "${p.titulo}"?`)) return;
    try { await excluirPesquisa(p.id); setAviso('Rascunho excluído.'); await carregar(); } catch (e) { setErro(e.message); }
  };

  const colunas = [
    { label: 'Pesquisa', primary: true, render: p => <span className="font-semibold text-on-surface">{p.titulo}</span> },
    { label: 'Público', render: p => PUBLICOS[p.publico] },
    { label: 'Prazo', render: p => <span className="tabular-nums">{formatDateBR(p.abre_em)} a {formatDateBR(p.fecha_em)}</span> },
    {
      label: 'Situação',
      render: p => { const s = statusEfetivo(p); return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm ${TOM_STATUS[s]}`}>{ROTULO_STATUS[s]}</span>; },
    },
    {
      label: 'Ações', actions: true, align: 'right',
      render: p => (p.status === 'rascunho' ? (
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={() => abrirForm(p)} className="!px-2.5 !py-1.5 text-xs"><Pencil size={14} /> Editar</SecondaryButton>
          <SecondaryButton type="button" onClick={() => excluir(p)} className="!px-2.5 !py-1.5 text-xs" aria-label={`Excluir ${p.titulo}`}><Trash2 size={14} /></SecondaryButton>
        </div>
      ) : (
        <div className="flex justify-end">
          <SecondaryButton type="button" onClick={() => setDetalhe(p)} className="!px-2.5 !py-1.5 text-xs">Resultados</SecondaryButton>
        </div>
      )),
    },
  ];

  return (
    <PageShell actions={!detalhe && <PrimaryButton type="button" onClick={() => setForm({ id: null, titulo: 'Nova pesquisa', inicial: formularioVazio() })}><Plus size={16} /> Nova pesquisa</PrimaryButton>}>
      <div className="space-y-6">
        {erro && <Notice type="error">{erro}</Notice>}
        {aviso && <Notice type="success">{aviso}</Notice>}

        {detalhe ? (
          <Suspense fallback={<Loading />}>
            <PesquisaResultados
              pesquisa={detalhe} onVoltar={() => setDetalhe(null)} onMudou={carregar}
              onDuplicar={() => { const p = detalhe; setDetalhe(null); abrirForm(p, { duplicar: true }); }}
            />
          </Suspense>
        ) : lista === null ? <Loading /> : lista.length === 0 ? (
          <EmptyState icon={ClipboardList} text="Nenhuma pesquisa criada." hint="Crie uma pesquisa de satisfação para as famílias ou para a equipe." />
        ) : (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
            <ResponsiveTable columns={colunas} rows={lista} />
          </section>
        )}
      </div>

      {form && <PesquisaForm key={form.titulo + (form.id || '')} {...form} turmasDisponiveis={turmas} onClose={() => setForm(null)} onSalvar={salvar} />}
    </PageShell>
  );
}
