import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Copy, ExternalLink, Loader2, Paperclip, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { Modal, Notice, Loading, EmptyState, PrimaryButton, SecondaryButton, Field } from './GestaoShared';
import { listar, mensagemDeErro } from '../tradicional/lib/estrutura';
import {
  STATUS_PLANO, LIMITE_TEXTO, LIMITE_HABILIDADES, planoVazio, podeEditar, semanaAtual, dataBR, validarPlano,
  agruparPorSemana, duplicarPlano, listarMeusPlanos, criarPlano, atualizarPlano, removerPlano,
  listarAnexos, enviarAnexo, removerAnexo, linkDoAnexo,
} from '../lib/planoAula';
import { notifyPlanoAula } from '../lib/notifyPlanoAula';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const hoje = () => new Date().toLocaleDateString('en-CA');
const SECOES = [
  ['objetivos', 'Objetivos'],
  ['conteudo', 'Conteúdo'],
  ['metodologia', 'Metodologia'],
  ['recursos', 'Recursos'],
  ['avaliacao', 'Avaliação'],
];
const corDoStatus = {
  rascunho: 'bg-surface-container text-on-surface-variant',
  enviado: 'bg-brass/15 text-brass',
  aprovado: 'bg-primary/10 text-primary',
  devolvido: 'bg-brass/15 text-brass',
};

// Professor › Acadêmico › Planos de aula. Vale para os dois métodos: no
// Montessori a turma vem do cadastro da professora; no Tradicional, das
// atribuições dela (turma e disciplina). A RLS repete todas as regras.
export default function TeacherPlanosAula({ currentUser, currentSchool, method }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [planos, setPlanos] = useState([]);
  const [opcoes, setOpcoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState({ tipo: 'error', texto: '' });
  const [form, setForm] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [anexos, setAnexos] = useState([]);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [apagar, setApagar] = useState(null);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const lista = [];
        if (method !== 'tradicional') {
          for (const t of currentUser?.turmas || []) lista.push({ chave: `t:${t}`, turma: t, atribuicao_id: null, rotulo: t });
        }
        const [meus, ats, turmas, discs] = await Promise.all([
          listarMeusPlanos(schoolId, currentUser?.id),
          method === 'montessori' ? Promise.resolve([]) : listar('trad_atribuicoes', schoolId).catch(() => []),
          method === 'montessori' ? Promise.resolve([]) : listar('trad_turmas', schoolId, { ordenarPor: 'nome' }).catch(() => []),
          method === 'montessori' ? Promise.resolve([]) : listar('trad_disciplinas', schoolId, { ordenarPor: 'nome' }).catch(() => []),
        ]);
        for (const a of ats.filter(x => x.professor_id === currentUser?.id)) {
          const turma = turmas.find(t => t.id === a.turma_id)?.nome || 'Turma';
          const disc = discs.find(d => d.id === a.disciplina_id)?.nome || 'Disciplina';
          lista.push({ chave: `a:${a.id}`, turma, atribuicao_id: a.id, rotulo: `${turma} · ${disc}` });
        }
        lista.sort((x, y) => x.rotulo.localeCompare(y.rotulo, 'pt-BR'));
        if (!ativo) return;
        setPlanos(meus);
        setOpcoes(lista);
      } catch (e) {
        if (ativo) setMsg({ tipo: 'error', texto: mensagemDeErro(e) });
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId, currentUser?.id, currentUser?.turmas, method]);

  const rotuloDoPlano = (p) => opcoes.find(o => (p.atribuicao_id ? o.atribuicao_id === p.atribuicao_id : !o.atribuicao_id && o.turma === p.turma))?.rotulo || p.turma;
  const visiveis = useMemo(() => planos.filter(p => !filtro || p.status === filtro), [planos, filtro]);
  const grupos = useMemo(() => agruparPorSemana(visiveis), [visiveis]);
  const devolvidos = planos.filter(p => p.status === 'devolvido').length;

  const carregarAnexos = async (planoId) => {
    try { setAnexos(await listarAnexos(schoolId, planoId)); } catch { setAnexos([]); }
  };

  const abrirNovo = (base) => {
    const { inicio, fim } = semanaAtual(hoje());
    const inicial = base || planoVazio(inicio, fim);
    setForm(inicial.turma ? inicial : { ...inicial, turma: opcoes[0]?.turma || '', atribuicao_id: opcoes[0]?.atribuicao_id || null });
    setEditandoId(null); setAnexos([]); setErroForm('');
  };

  const abrirPlano = (p) => {
    setForm({ ...p }); setEditandoId(p.id); setErroForm('');
    carregarAnexos(p.id);
  };

  const fechar = () => { setForm(null); setEditandoId(null); setAnexos([]); setErroForm(''); };

  const trocarTurma = (chave) => {
    const o = opcoes.find(x => x.chave === chave);
    if (o) setForm(f => ({ ...f, turma: o.turma, atribuicao_id: o.atribuicao_id }));
  };
  const chaveAtual = form ? opcoes.find(o => (form.atribuicao_id ? o.atribuicao_id === form.atribuicao_id : !o.atribuicao_id && o.turma === form.turma))?.chave || '' : '';

  const salvar = async (enviar) => {
    const problema = validarPlano(form, { envio: enviar });
    if (problema) { setErroForm(problema); return; }
    setSalvando(true); setErroForm('');
    try {
      const salvo = editandoId
        ? await atualizarPlano(schoolId, editandoId, form, { enviar })
        : await criarPlano(schoolId, currentUser.id, form, { enviar });
      setPlanos(ps => (editandoId ? ps.map(p => (p.id === salvo.id ? salvo : p)) : [salvo, ...ps]));
      if (enviar) {
        notifyPlanoAula(salvo.id);
        fechar();
        setMsg({ tipo: 'success', texto: 'Plano enviado para a Coordenação.' });
      } else if (!editandoId) {
        // Fica aberto para permitir anexos, que precisam do plano já criado.
        setEditandoId(salvo.id); setForm({ ...salvo });
        setMsg({ tipo: 'success', texto: 'Rascunho salvo. Agora você já pode anexar arquivos.' });
      } else {
        setMsg({ tipo: 'success', texto: 'Rascunho salvo.' });
      }
    } catch (e) {
      setErroForm(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const anexar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editandoId) return;
    setEnviandoAnexo(true); setErroForm('');
    try {
      await enviarAnexo(schoolId, editandoId, file);
      await carregarAnexos(editandoId);
    } catch (err) {
      setErroForm(mensagemDeErro(err));
    } finally {
      setEnviandoAnexo(false);
    }
  };

  const abrirAnexo = async (a) => {
    try { window.open(await linkDoAnexo(a.caminho), '_blank', 'noopener'); } catch (err) { setErroForm(mensagemDeErro(err)); }
  };

  const tirarAnexo = async (a) => {
    try { await removerAnexo(a.caminho); setAnexos(l => l.filter(x => x.caminho !== a.caminho)); } catch (err) { setErroForm(mensagemDeErro(err)); }
  };

  const confirmarApagar = async () => {
    const alvo = apagar;
    setApagar(null);
    try {
      await removerPlano(schoolId, alvo.id);
      setPlanos(ps => ps.filter(p => p.id !== alvo.id));
    } catch (e) {
      setMsg({ tipo: 'error', texto: mensagemDeErro(e) });
    }
  };

  if (carregando) return <Loading />;

  const editavel = form ? podeEditar(editandoId ? form : null) : false;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BookOpenCheck size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface flex-1">Planos de aula</h2>
        <PrimaryButton onClick={() => abrirNovo()} disabled={opcoes.length === 0}><Plus size={16} /> Novo plano</PrimaryButton>
      </div>
      {msg.texto && <Notice type={msg.tipo}>{msg.texto}</Notice>}
      {devolvidos > 0 && (
        <p className="text-sm font-medium text-brass border border-brass/40 bg-brass/10 rounded-zela-md p-2.5">
          {devolvidos === 1 ? 'Há 1 plano devolvido pela Coordenação.' : `Há ${devolvidos} planos devolvidos pela Coordenação.`} Ajuste e envie de novo.
        </p>
      )}

      {opcoes.length === 0 ? (
        <EmptyState icon={BookOpenCheck} text="Você ainda não tem turmas atribuídas." hint="Fale com a Coordenação para vincular suas turmas." />
      ) : (
        <>
          <select value={filtro} onChange={e => setFiltro(e.target.value)} className={campo} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            {Object.entries(STATUS_PLANO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>

          {grupos.length === 0 ? (
            <EmptyState icon={BookOpenCheck} text="Nenhum plano de aula ainda." hint="Crie o primeiro com o botão Novo plano." />
          ) : grupos.map(g => (
            <section key={g.segunda} className="space-y-2">
              <h3 className="text-sm font-bold text-on-surface-variant">Semana de {dataBR(g.segunda)}</h3>
              {g.itens.map(p => (
                <article key={p.id} className="bg-surface-container-low rounded-zela-md p-4 space-y-1">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-on-surface break-words">{rotuloDoPlano(p)}</p>
                      <p className="text-xs text-on-surface-variant">{dataBR(p.periodo_inicio)} a {dataBR(p.periodo_fim)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-zela-md ${corDoStatus[p.status]}`}>{STATUS_PLANO[p.status]}</span>
                    <button onClick={() => abrirPlano(p)} aria-label={podeEditar(p) ? 'Editar' : 'Ver'} className="p-1.5 text-on-surface-variant"><Pencil size={16} /></button>
                    <button onClick={() => abrirNovo(duplicarPlano(p))} aria-label="Duplicar para a próxima semana" className="p-1.5 text-on-surface-variant"><Copy size={16} /></button>
                    {p.status === 'rascunho' && <button onClick={() => setApagar(p)} aria-label="Excluir" className="p-1.5 text-error"><Trash2 size={16} /></button>}
                  </div>
                  {p.status === 'devolvido' && p.comentario_coordenacao && (
                    <p className="text-sm text-brass whitespace-pre-wrap break-words">Coordenação: {p.comentario_coordenacao}</p>
                  )}
                </article>
              ))}
            </section>
          ))}
        </>
      )}

      {form && (
        <Modal
          wide
          title={editandoId ? (editavel ? 'Editar plano de aula' : 'Plano de aula') : 'Novo plano de aula'}
          onClose={fechar}
          footer={editavel ? (
            <>
              <SecondaryButton onClick={fechar}>Fechar</SecondaryButton>
              <SecondaryButton onClick={() => salvar(false)} disabled={salvando}>Salvar rascunho</SecondaryButton>
              <PrimaryButton onClick={() => salvar(true)} disabled={salvando}>
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar para revisão
              </PrimaryButton>
            </>
          ) : <SecondaryButton onClick={fechar}>Fechar</SecondaryButton>}
        >
          <div className="space-y-3">
            <Notice type="error">{erroForm}</Notice>
            {editandoId && form.status !== 'rascunho' && (
              <p className="text-sm text-on-surface-variant">Situação: <span className="font-bold">{STATUS_PLANO[form.status]}</span></p>
            )}
            {form.status === 'devolvido' && form.comentario_coordenacao && (
              <p className="text-sm text-brass whitespace-pre-wrap break-words">Coordenação: {form.comentario_coordenacao}</p>
            )}
            <Field label="Turma" id="plano-turma">
              <select id="plano-turma" value={chaveAtual} onChange={e => trocarTurma(e.target.value)} disabled={!editavel || !!editandoId} className={campo}>
                {!chaveAtual && <option value="">Escolha</option>}
                {opcoes.map(o => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início" id="plano-inicio">
                <input id="plano-inicio" type="date" value={form.periodo_inicio} disabled={!editavel} onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} className={campo} />
              </Field>
              <Field label="Fim" id="plano-fim">
                <input id="plano-fim" type="date" value={form.periodo_fim} disabled={!editavel} onChange={e => setForm(f => ({ ...f, periodo_fim: e.target.value }))} className={campo} />
              </Field>
            </div>
            {SECOES.map(([chave, rotulo]) => (
              <Field key={chave} label={rotulo} id={`plano-${chave}`}>
                <textarea id={`plano-${chave}`} rows={3} maxLength={LIMITE_TEXTO} value={form[chave]} disabled={!editavel}
                  onChange={e => setForm(f => ({ ...f, [chave]: e.target.value }))} className={campo} />
              </Field>
            ))}
            <Field label="Habilidades (opcional)" id="plano-habilidades" hint="Escreva os códigos ou descrições, por exemplo da BNCC.">
              <textarea id="plano-habilidades" rows={2} maxLength={LIMITE_HABILIDADES} value={form.habilidades} disabled={!editavel}
                onChange={e => setForm(f => ({ ...f, habilidades: e.target.value }))} className={campo} />
            </Field>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-on-surface-variant">Anexos</p>
              {!editandoId ? (
                <p className="text-sm text-on-surface-variant">Salve o rascunho para poder anexar arquivos.</p>
              ) : (
                <>
                  {anexos.length === 0 && <p className="text-sm text-on-surface-variant">Nenhum anexo.</p>}
                  {anexos.map(a => (
                    <div key={a.caminho} className="flex items-center gap-2 text-sm bg-surface-container-low rounded-zela-md px-3 py-2">
                      <Paperclip size={14} className="text-on-surface-variant shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{a.nome.replace(/^\d+-/, '')}</span>
                      <button onClick={() => abrirAnexo(a)} aria-label="Abrir anexo" className="p-1 text-on-surface-variant"><ExternalLink size={14} /></button>
                      {editavel && <button onClick={() => tirarAnexo(a)} aria-label="Remover anexo" className="p-1 text-error"><Trash2 size={14} /></button>}
                    </div>
                  ))}
                  {editavel && (
                    <label className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-outline-variant rounded-zela-md text-sm font-semibold text-on-surface-variant cursor-pointer">
                      {enviandoAnexo ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />} Anexar arquivo
                      <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={anexar} disabled={enviandoAnexo} className="hidden" />
                    </label>
                  )}
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {apagar && (
        <ConfirmModal
          title="Excluir rascunho"
          message="Este rascunho será apagado. Deseja continuar?"
          confirmLabel="Excluir"
          onConfirm={confirmarApagar}
          onCancel={() => setApagar(null)}
        />
      )}
    </div>
  );
}
