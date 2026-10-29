import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Camera, Download, Plus, ScanLine, Upload } from 'lucide-react';
import jsQR from 'jsqr';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, Notice, EmptyState, Modal, Field, PrimaryButton, SecondaryButton, ResponsiveTable, StatCard, Tabs, inputCls } from './GestaoShared';
import {
  ESTADOS_EXEMPLAR, PRAZO_PADRAO_DIAS, ROTULO_SITUACAO, baixarModeloAcervo, dataBR, hojeISO, isbnValido, lerAcervo,
  normalizarCodigo, normalizarIsbn, situacaoEmprestimo, somarDias, textoBusca,
} from '../lib/biblioteca';

const LIMITE_IMPORTACAO = 500;
const TOM_SITUACAO = { atrasado: 'text-warning font-semibold', vence_hoje: 'text-warning', em_dia: 'text-on-surface-variant', devolvido: 'text-success' };

const ABAS_INTERNAS = [
  { id: 'biblioteca-acervo', label: 'Acervo' },
  { id: 'biblioteca-emprestimos', label: 'Empréstimos' },
  { id: 'biblioteca-atrasados', label: 'Atrasados' },
];

// Biblioteca (módulo `biblioteca`). Gestão, Coordenação e Direção (cada aba é um item
// do menu) e também Recepção e Professora com a permissão biblioteca.gerenciar (sem
// `aba`, a tela mostra as três abas por dentro). O banco barra o resto (RLS por escola
// e RPCs library_emprestar e library_devolver).
export default function GestaoBiblioteca({ currentUser, aba: abaFixa }) {
  const [abaInterna, setAbaInterna] = useState('biblioteca-acervo');
  const aba = abaFixa || abaInterna;
  const [itens, setItens] = useState(null);
  const [exemplares, setExemplares] = useState([]);
  const [emprestimos, setEmprestimos] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const schoolId = currentUser.school_id;

  const carregar = useCallback(async () => {
    const [it, ex, em] = await Promise.all([
      supabase.from('library_items').select('id, titulo, autor, editora, isbn, categoria, faixa_etaria, capa_path, ativo').eq('school_id', schoolId).order('titulo').limit(2000),
      supabase.from('library_copies').select('id, item_id, tombo, estado, localizacao, ativo').eq('school_id', schoolId).limit(5000),
      supabase.from('library_loans').select('id, copy_id, borrower_type, student_id, user_id, emprestado_em, devolver_ate, devolvido_em').eq('school_id', schoolId).order('emprestado_em', { ascending: false }).limit(1000),
    ]);
    if (it.error || ex.error || em.error) { setErro('Não foi possível carregar a biblioteca.'); setItens([]); return; }
    setErro('');
    setItens(it.data); setExemplares(ex.data); setEmprestimos(em.data);
  }, [schoolId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setAviso(''); }, [aba]);

  useEffect(() => {
    if (aba === 'biblioteca-acervo') return;
    if (alunos.length) return;
    supabase.from('students').select('id, name, turma').eq('school_id', schoolId).order('name').limit(3000)
      .then(({ data }) => setAlunos(data || []));
    supabase.from('users').select('id, name, role').eq('school_id', schoolId)
      .in('role', ['admin', 'teacher', 'gestao', 'gestao_pedagogica', 'financeiro']).order('name').limit(500)
      .then(({ data }) => setEquipe(data || []));
  }, [aba, schoolId, alunos.length]);

  const ctx = { schoolId, itens, exemplares, emprestimos, alunos, equipe, carregar, setErro, setAviso };

  return (
    <PageShell>
      <div className="space-y-3">
        {!abaFixa && <Tabs tabs={ABAS_INTERNAS} active={aba} onChange={setAbaInterna} />}
        <Notice type="error">{erro}</Notice>
        <Notice type="success">{aviso}</Notice>
        {itens === null ? <Loading /> : (
          <>
            {aba === 'biblioteca-acervo' && <Acervo {...ctx} />}
            {aba === 'biblioteca-emprestimos' && <Emprestimos {...ctx} />}
            {aba === 'biblioteca-atrasados' && <Atrasados {...ctx} />}
          </>
        )}
      </div>
    </PageShell>
  );
}

function useIndices({ itens, exemplares, emprestimos, alunos, equipe }) {
  return useMemo(() => {
    const livro = new Map(itens.map(i => [i.id, i]));
    const exemplar = new Map(exemplares.map(e => [e.id, e]));
    const aluno = new Map(alunos.map(a => [a.id, a]));
    const pessoa = new Map(equipe.map(u => [u.id, u]));
    const abertoPorExemplar = new Map(emprestimos.filter(e => !e.devolvido_em).map(e => [e.copy_id, e]));
    const nomeDoTomador = (e) => (e.borrower_type === 'aluno' ? aluno.get(e.student_id)?.name : pessoa.get(e.user_id)?.name) || 'Não encontrado';
    const tituloDe = (e) => livro.get(exemplar.get(e.copy_id)?.item_id)?.titulo || 'Livro não encontrado';
    return { livro, exemplar, aluno, abertoPorExemplar, nomeDoTomador, tituloDe };
  }, [itens, exemplares, emprestimos, alunos, equipe]);
}

// ───────────────────────── Acervo ─────────────────────────
function Acervo({ schoolId, itens, exemplares, emprestimos, carregar, setErro, setAviso }) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const [importando, setImportando] = useState(false);
  const [aberto, setAberto] = useState(null);
  const [capas, setCapas] = useState({});

  const abertos = useMemo(() => new Set(emprestimos.filter(e => !e.devolvido_em).map(e => e.copy_id)), [emprestimos]);
  const porItem = useMemo(() => {
    const m = new Map();
    for (const e of exemplares) m.set(e.item_id, [...(m.get(e.item_id) || []), e]);
    return m;
  }, [exemplares]);

  const visiveis = useMemo(() => {
    const q = textoBusca(busca);
    const tombos = (id) => (porItem.get(id) || []).map(e => e.tombo).join(' ');
    return itens.filter(i => !q || textoBusca(`${i.titulo} ${i.autor} ${i.isbn} ${i.categoria} ${tombos(i.id)}`).includes(q));
  }, [itens, busca, porItem]);

  useEffect(() => {
    const caminhos = itens.filter(i => i.capa_path).slice(0, 100).map(i => i.capa_path);
    if (!caminhos.length) return;
    supabase.storage.from('library-covers').createSignedUrls(caminhos, 3600).then(({ data }) => {
      setCapas(Object.fromEntries((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])));
    });
  }, [itens]);

  const totalExemplares = exemplares.filter(e => e.ativo).length;
  const emprestados = exemplares.filter(e => abertos.has(e.id)).length;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Livros" value={itens.filter(i => i.ativo).length} />
        <StatCard label="Exemplares" value={totalExemplares} />
        <StatCard label="Emprestados" value={emprestados} />
        <StatCard label="Disponíveis" value={Math.max(0, totalExemplares - emprestados)} tone="good" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input className={`${inputCls} sm:max-w-xs`} placeholder="Buscar por título, autor, ISBN ou tombo" value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="flex gap-2 sm:ml-auto flex-wrap">
          <SecondaryButton onClick={baixarModeloAcervo}><Download size={15} />Modelo da planilha</SecondaryButton>
          <SecondaryButton onClick={() => setImportando(true)}><Upload size={15} />Importar planilha</SecondaryButton>
          <PrimaryButton onClick={() => setEditando({})}><Plus size={15} />Novo livro</PrimaryButton>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState icon={BookOpen} text="Nenhum livro no acervo" hint="Cadastre um livro ou importe a planilha do acervo." />
      ) : (
        <ResponsiveTable
          rows={visiveis}
          columns={[
            { label: 'Livro', primary: true, render: i => (
              <div className="flex items-center gap-2.5">
                {capas[i.capa_path] ? <img src={capas[i.capa_path]} alt="" className="w-9 h-12 object-cover rounded-zela-md border border-outline-variant" /> : null}
                <div>
                  <p className="font-semibold text-on-surface">{i.titulo}{!i.ativo && ' (inativo)'}</p>
                  <p className="text-xs text-on-surface-variant">{[i.autor, i.editora].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
            ) },
            { label: 'ISBN', render: i => i.isbn || 'Sem ISBN' },
            { label: 'Categoria', render: i => [i.categoria, i.faixa_etaria].filter(Boolean).join(' · ') || 'Sem categoria' },
            { label: 'Exemplares', render: i => {
              const lista = (porItem.get(i.id) || []).filter(e => e.ativo);
              const livres = lista.filter(e => !abertos.has(e.id)).length;
              return `${livres} livres de ${lista.length}`;
            } },
            { label: 'Ações', actions: true, render: i => (
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setAberto(i)}>Exemplares</SecondaryButton>
                <SecondaryButton onClick={() => setEditando(i)}>Editar</SecondaryButton>
              </div>
            ) },
          ]}
        />
      )}

      {editando && <ModalLivro schoolId={schoolId} item={editando} onClose={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} setErro={setErro} />}
      {aberto && (
        <ModalExemplares
          schoolId={schoolId} item={aberto} exemplares={porItem.get(aberto.id) || []} abertos={abertos}
          onClose={() => setAberto(null)} onMudou={carregar}
        />
      )}
      {importando && (
        <ModalImportar
          schoolId={schoolId} tombos={new Set(exemplares.map(e => e.tombo))}
          onClose={() => setImportando(false)}
          onFeito={(msg) => { setImportando(false); setAviso(msg); carregar(); }}
        />
      )}
    </>
  );
}

function ModalLivro({ schoolId, item, onClose, onSalvo, setErro }) {
  const [f, setF] = useState({
    titulo: item.titulo || '', autor: item.autor || '', editora: item.editora || '', isbn: item.isbn || '',
    categoria: item.categoria || '', faixa_etaria: item.faixa_etaria || '', ativo: item.ativo ?? true,
  });
  const [capa, setCapa] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));

  const salvar = async () => {
    setMsg('');
    if (!f.titulo.trim()) return setMsg('Informe o título.');
    if (!isbnValido(f.isbn)) return setMsg('ISBN inválido. Confira os números.');
    if (capa && (!['image/png', 'image/jpeg', 'image/webp'].includes(capa.type) || capa.size > 2 * 1024 * 1024)) {
      return setMsg('A capa deve ser PNG, JPG ou WEBP de até 2 MB.');
    }
    setSalvando(true);
    const dados = {
      titulo: f.titulo.trim(), autor: f.autor.trim() || null, editora: f.editora.trim() || null,
      isbn: normalizarIsbn(f.isbn) || null, categoria: f.categoria.trim() || null,
      faixa_etaria: f.faixa_etaria.trim() || null, ativo: f.ativo,
    };
    let id = item.id;
    if (id) {
      const { error } = await supabase.from('library_items').update(dados).eq('id', id).eq('school_id', schoolId);
      if (error) { setSalvando(false); return setMsg('Não foi possível salvar o livro.'); }
    } else {
      const { data, error } = await supabase.from('library_items').insert({ ...dados, school_id: schoolId }).select('id').single();
      if (error) { setSalvando(false); return setMsg('Não foi possível salvar o livro.'); }
      id = data.id;
    }
    if (capa) {
      const ext = capa.type === 'image/png' ? 'png' : capa.type === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${schoolId}/${id}/capa-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('library-covers').upload(caminho, capa, { contentType: capa.type });
      if (upErr) setErro('O livro foi salvo, mas a capa não foi enviada.');
      else {
        await supabase.from('library_items').update({ capa_path: caminho }).eq('id', id).eq('school_id', schoolId);
        if (item.capa_path) await supabase.storage.from('library-covers').remove([item.capa_path]);
      }
    }
    setSalvando(false);
    onSalvo();
  };

  return (
    <Modal title={item.id ? 'Editar livro' : 'Novo livro'} onClose={onClose} footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={salvar} disabled={salvando}>Salvar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <Field label="Título" id="bib-titulo"><input id="bib-titulo" className={inputCls} maxLength={200} value={f.titulo} onChange={set('titulo')} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Autor" id="bib-autor"><input id="bib-autor" className={inputCls} maxLength={200} value={f.autor} onChange={set('autor')} /></Field>
        <Field label="Editora" id="bib-editora"><input id="bib-editora" className={inputCls} maxLength={200} value={f.editora} onChange={set('editora')} /></Field>
        <Field label="ISBN" id="bib-isbn"><input id="bib-isbn" className={inputCls} maxLength={20} value={f.isbn} onChange={set('isbn')} /></Field>
        <Field label="Categoria" id="bib-cat"><input id="bib-cat" className={inputCls} maxLength={80} value={f.categoria} onChange={set('categoria')} /></Field>
        <Field label="Faixa etária" id="bib-faixa"><input id="bib-faixa" className={inputCls} maxLength={40} value={f.faixa_etaria} onChange={set('faixa_etaria')} /></Field>
        <Field label="Capa" id="bib-capa" hint="PNG, JPG ou WEBP de até 2 MB. Fica em armazenamento privado.">
          <input id="bib-capa" type="file" accept="image/png,image/jpeg,image/webp" className={inputCls} onChange={e => setCapa(e.target.files?.[0] || null)} />
        </Field>
      </div>
      {item.id && (
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input type="checkbox" checked={f.ativo} onChange={e => setF(v => ({ ...v, ativo: e.target.checked }))} />
          Livro ativo no acervo
        </label>
      )}
    </Modal>
  );
}

function ModalExemplares({ schoolId, item, exemplares, abertos, onClose, onMudou }) {
  const [tombo, setTombo] = useState('');
  const [estado, setEstado] = useState('bom');
  const [local, setLocal] = useState('');
  const [msg, setMsg] = useState('');

  const adicionar = async () => {
    setMsg('');
    const t = normalizarCodigo(tombo);
    if (!t) return setMsg('Informe o tombo.');
    const { error } = await supabase.from('library_copies').insert({
      school_id: schoolId, item_id: item.id, tombo: t, estado, localizacao: local.trim() || null,
    });
    if (error) return setMsg(error.code === '23505' ? 'Este tombo já existe na escola.' : 'Não foi possível adicionar o exemplar.');
    setTombo(''); setLocal('');
    onMudou();
  };

  const alterar = async (id, patch) => {
    const { error } = await supabase.from('library_copies').update(patch).eq('id', id).eq('school_id', schoolId);
    if (error) setMsg('Não foi possível alterar o exemplar.'); else onMudou();
  };

  return (
    <Modal title={`Exemplares de ${item.titulo}`} onClose={onClose} wide>
      <Notice type="error">{msg}</Notice>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <Field label="Tombo" id="ex-tombo"><input id="ex-tombo" className={inputCls} maxLength={40} value={tombo} onChange={e => setTombo(e.target.value)} /></Field>
        <Field label="Estado" id="ex-estado">
          <select id="ex-estado" className={inputCls} value={estado} onChange={e => setEstado(e.target.value)}>
            {Object.entries(ESTADOS_EXEMPLAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Localização" id="ex-local"><input id="ex-local" className={inputCls} maxLength={80} value={local} onChange={e => setLocal(e.target.value)} /></Field>
        <PrimaryButton onClick={adicionar}><Plus size={15} />Adicionar</PrimaryButton>
      </div>
      {exemplares.length === 0 ? <EmptyState text="Nenhum exemplar cadastrado" /> : (
        <ResponsiveTable
          rows={exemplares}
          columns={[
            { label: 'Tombo', primary: true, render: e => <span className="font-semibold">{e.tombo}{!e.ativo && ' (baixado)'}</span> },
            { label: 'Estado', render: e => (
              <select className={inputCls} value={e.estado} onChange={ev => alterar(e.id, { estado: ev.target.value })}>
                {Object.entries(ESTADOS_EXEMPLAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            ) },
            { label: 'Localização', render: e => e.localizacao || 'Sem localização' },
            { label: 'Situação', render: e => (abertos.has(e.id) ? 'Emprestado' : 'Livre') },
            { label: 'Ações', actions: true, render: e => (abertos.has(e.id) ? null : (
              <SecondaryButton onClick={() => alterar(e.id, { ativo: !e.ativo })}>{e.ativo ? 'Dar baixa' : 'Reativar'}</SecondaryButton>
            )) },
          ]}
        />
      )}
    </Modal>
  );
}

function ModalImportar({ schoolId, tombos, onClose, onFeito }) {
  const [lido, setLido] = useState(null);
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const aoEscolher = async (e) => {
    setMsg(''); setLido(null);
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await arquivo.arrayBuffer());
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (linhas.length > LIMITE_IMPORTACAO) return setMsg(`A planilha passa de ${LIMITE_IMPORTACAO} linhas. Divida em partes.`);
      setLido(lerAcervo(linhas, tombos));
    } catch {
      setMsg('Não foi possível ler a planilha. Use o modelo.');
    }
  };

  const importar = async () => {
    setEnviando(true); setMsg('');
    let livros = 0; let copias = 0;
    for (const it of lido.itens) {
      const { exemplares, ...dados } = it;
      const { data, error } = await supabase.from('library_items').insert({ ...dados, school_id: schoolId }).select('id').single();
      if (error) { setMsg(`Parou no livro "${it.titulo}". ${livros} livros já foram importados.`); setEnviando(false); return; }
      livros += 1;
      const { error: exErr } = await supabase.from('library_copies').insert(exemplares.map(x => ({ ...x, school_id: schoolId, item_id: data.id })));
      if (exErr) { setMsg(`Os exemplares de "${it.titulo}" não foram salvos. ${livros} livros foram criados.`); setEnviando(false); return; }
      copias += exemplares.length;
    }
    setEnviando(false);
    onFeito(`Importados ${livros} livros e ${copias} exemplares.`);
  };

  return (
    <Modal title="Importar acervo" onClose={onClose} wide footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={importar} disabled={!lido || lido.itens.length === 0 || enviando}>Importar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <Field label="Planilha XLSX" id="bib-arquivo" hint="Uma linha por exemplar. Use o modelo da planilha. Até 500 linhas por vez.">
        <input id="bib-arquivo" type="file" accept=".xlsx,.xls" className={inputCls} onChange={aoEscolher} />
      </Field>
      {lido && (
        <div className="space-y-2 text-sm">
          <p className="text-on-surface">{lido.itens.length} livros e {lido.itens.reduce((n, i) => n + i.exemplares.length, 0)} exemplares prontos para importar.</p>
          {lido.erros.length > 0 && (
            <div className="p-2.5 rounded-zela-md border border-warning/30 bg-warning/10 text-warning">
              <p className="font-semibold">{lido.erros.length} linhas serão ignoradas</p>
              <ul className="mt-1 text-xs space-y-0.5 max-h-40 overflow-y-auto">
                {lido.erros.slice(0, 50).map(er => <li key={er.linha}>Linha {er.linha}: {er.motivo}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────── Empréstimos ─────────────────────────
function Emprestimos(ctx) {
  const { exemplares, emprestimos, alunos, equipe, carregar, setAviso } = ctx;
  const ix = useIndices(ctx);
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState('aluno');
  const [buscaPessoa, setBuscaPessoa] = useState('');
  const [pessoaId, setPessoaId] = useState('');
  const [ate, setAte] = useState(() => somarDias(hojeISO(), PRAZO_PADRAO_DIAS));
  const [lendo, setLendo] = useState(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [msg, setMsg] = useState('');
  const campoCodigo = useRef(null);

  const achar = useCallback((valor) => {
    const t = normalizarCodigo(valor).toLowerCase();
    return exemplares.find(e => e.tombo.toLowerCase() === t);
  }, [exemplares]);

  const exemplar = achar(codigo);
  const aberto = exemplar ? ix.abertoPorExemplar.get(exemplar.id) : null;
  const lista = tipo === 'aluno' ? alunos : equipe;
  const candidatas = useMemo(() => {
    const q = textoBusca(buscaPessoa);
    if (!q) return lista.slice(0, 30);
    return lista.filter(p => textoBusca(p.name).includes(q)).slice(0, 30);
  }, [lista, buscaPessoa]);

  const registrar = async (fn, ok) => {
    setTrabalhando(true); setMsg(''); setAviso('');
    const { error } = await fn();
    setTrabalhando(false);
    if (error) return setMsg(error.message || 'Não foi possível concluir.');
    setAviso(ok); setCodigo('');
    await carregar();
    campoCodigo.current?.focus();
  };

  const emprestar = () => {
    if (!exemplar) return setMsg('Tombo não encontrado no acervo.');
    if (!pessoaId) return setMsg('Escolha quem está levando o livro.');
    registrar(() => supabase.rpc('library_emprestar', {
      p_copy_id: exemplar.id, p_borrower_type: tipo,
      p_student_id: tipo === 'aluno' ? pessoaId : null, p_user_id: tipo === 'funcionario' ? pessoaId : null,
      p_devolver_ate: ate,
    }), `Empréstimo registrado: ${ix.livro.get(exemplar.item_id)?.titulo}.`);
  };

  const devolver = (emp) => registrar(() => supabase.rpc('library_devolver', { p_loan_id: emp.id }), `Devolução registrada: ${ix.tituloDe(emp)}.`);

  const abertos = emprestimos.filter(e => !e.devolvido_em);
  const recentes = emprestimos.filter(e => e.devolvido_em).slice(0, 15);

  return (
    <>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 space-y-3">
        <Notice type="error">{msg}</Notice>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Tombo do exemplar" id="emp-tombo" hint="Digite, use o leitor de código ou a câmera.">
            <div className="flex gap-2">
              <input
                id="emp-tombo" ref={campoCodigo} className={inputCls} value={codigo} autoComplete="off"
                onChange={e => setCodigo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (exemplar && aberto) devolver(aberto); } }}
              />
              <SecondaryButton onClick={() => setLendo('emprestimo')} aria-label="Ler com a câmera"><Camera size={15} /></SecondaryButton>
            </div>
            {codigo && (
              <p className="text-xs mt-1 text-on-surface-variant">
                {!exemplar ? 'Tombo não encontrado.' : `${ix.livro.get(exemplar.item_id)?.titulo}${!exemplar.ativo ? ' (baixado)' : ''}${aberto ? `, emprestado para ${ix.nomeDoTomador(aberto)}` : ', livre'}`}
              </p>
            )}
          </Field>
          <Field label="Devolver até" id="emp-ate">
            <input id="emp-ate" type="date" className={inputCls} min={hojeISO()} value={ate} onChange={e => setAte(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Quem leva" id="emp-tipo">
            <select id="emp-tipo" className={inputCls} value={tipo} onChange={e => { setTipo(e.target.value); setPessoaId(''); setBuscaPessoa(''); }}>
              <option value="aluno">Aluno</option>
              <option value="funcionario">Funcionário</option>
            </select>
          </Field>
          <Field label="Buscar nome" id="emp-busca"><input id="emp-busca" className={inputCls} value={buscaPessoa} onChange={e => setBuscaPessoa(e.target.value)} /></Field>
          <Field label={tipo === 'aluno' ? 'Aluno' : 'Funcionário'} id="emp-pessoa">
            <select id="emp-pessoa" className={inputCls} value={pessoaId} onChange={e => setPessoaId(e.target.value)}>
              <option value="">Escolha</option>
              {candidatas.map(p => <option key={p.id} value={p.id}>{p.name}{p.turma ? ` · ${p.turma}` : ''}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {aberto && <SecondaryButton onClick={() => devolver(aberto)} disabled={trabalhando}>Devolver este exemplar</SecondaryButton>}
          <PrimaryButton onClick={emprestar} disabled={trabalhando || !exemplar || !!aberto || !exemplar.ativo}><ScanLine size={15} />Emprestar</PrimaryButton>
        </div>
      </div>

      <h3 className="text-sm font-bold text-on-surface">Em aberto ({abertos.length})</h3>
      <ListaEmprestimos linhas={abertos} ix={ix} onDevolver={devolver} vazio="Nenhum livro emprestado agora" />
      {recentes.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-on-surface">Devolvidos recentemente</h3>
          <ListaEmprestimos linhas={recentes} ix={ix} />
        </>
      )}

      {lendo && (
        <LeitorCamera
          onClose={() => setLendo(null)}
          onCodigo={(c) => { setCodigo(c); setLendo(null); }}
        />
      )}
    </>
  );
}

function ListaEmprestimos({ linhas, ix, onDevolver, vazio = 'Nada por aqui' }) {
  const hoje = hojeISO();
  if (linhas.length === 0) return <EmptyState icon={BookOpen} text={vazio} />;
  return (
    <ResponsiveTable
      rows={linhas}
      columns={[
        { label: 'Livro', primary: true, render: e => (
          <div>
            <p className="font-semibold text-on-surface">{ix.tituloDe(e)}</p>
            <p className="text-xs text-on-surface-variant">Tombo {ix.exemplar.get(e.copy_id)?.tombo}</p>
          </div>
        ) },
        { label: 'Quem levou', render: e => `${ix.nomeDoTomador(e)}${e.borrower_type === 'funcionario' ? ' (funcionário)' : ''}` },
        { label: 'Emprestado em', render: e => dataBR(e.emprestado_em) },
        { label: 'Devolver até', render: e => dataBR(e.devolver_ate) },
        { label: 'Situação', render: e => {
          const s = situacaoEmprestimo(e, hoje);
          return <span className={TOM_SITUACAO[s.codigo]}>{ROTULO_SITUACAO[s.codigo]}{s.diasAtraso ? ` há ${s.diasAtraso} ${s.diasAtraso === 1 ? 'dia' : 'dias'}` : ''}</span>;
        } },
        { label: 'Ações', actions: true, render: e => (onDevolver && !e.devolvido_em ? <SecondaryButton onClick={() => onDevolver(e)}>Devolver</SecondaryButton> : null) },
      ]}
    />
  );
}

// ───────────────────────── Atrasados ─────────────────────────
function Atrasados(ctx) {
  const { emprestimos, carregar, setAviso, setErro } = ctx;
  const ix = useIndices(ctx);
  const hoje = hojeISO();
  const atrasados = useMemo(
    () => emprestimos.filter(e => !e.devolvido_em && e.devolver_ate < hoje).sort((a, b) => a.devolver_ate.localeCompare(b.devolver_ate)),
    [emprestimos, hoje],
  );

  const devolver = async (emp) => {
    setAviso(''); setErro('');
    const { error } = await supabase.rpc('library_devolver', { p_loan_id: emp.id });
    if (error) return setErro(error.message || 'Não foi possível registrar a devolução.');
    setAviso(`Devolução registrada: ${ix.tituloDe(emp)}.`);
    carregar();
  };

  return (
    <>
      <StatCard label="Livros atrasados" value={atrasados.length} tone={atrasados.length ? 'warn' : 'good'} className="max-w-xs" />
      <ListaEmprestimos linhas={atrasados} ix={ix} onDevolver={devolver} vazio="Nenhum livro atrasado" />
    </>
  );
}

// ───────────────────────── Leitor por câmera ─────────────────────────
// QR e código de barras. Usa BarcodeDetector quando o navegador tem; senão lê
// só QR com jsQR. Nada é gravado: devolve o texto lido.
function LeitorCamera({ onCodigo, onClose }) {
  const videoRef = useRef(null);
  const aoLer = useRef(onCodigo);
  const [erro, setErro] = useState('');

  useEffect(() => { aoLer.current = onCodigo; });

  useEffect(() => {
    let parar = false;
    let stream;
    let timer;
    const canvas = document.createElement('canvas');
    const detector = typeof window.BarcodeDetector === 'function'
      ? new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'] })
      : null;

    const ler = async () => {
      const v = videoRef.current;
      if (parar || !v || v.readyState < 2) { timer = setTimeout(ler, 250); return; }
      let texto = '';
      try {
        if (detector) {
          const r = await detector.detect(v);
          texto = r[0]?.rawValue || '';
        } else {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          const c = canvas.getContext('2d', { willReadFrequently: true });
          c.drawImage(v, 0, 0);
          texto = jsQR(c.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data || '';
        }
      } catch { /* quadro ruim, tenta o próximo */ }
      if (texto && !parar) { aoLer.current(normalizarCodigo(texto)); return; }
      timer = setTimeout(ler, 250);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        if (parar) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
        ler();
      })
      .catch(() => setErro('Não foi possível abrir a câmera. Digite o tombo ou use o leitor de código.'));

    return () => { parar = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  return (
    <Modal title="Ler código do livro" onClose={onClose}>
      <Notice type="error">{erro}</Notice>
      <video ref={videoRef} muted playsInline className="w-full rounded-zela-lg bg-ink aspect-[4/3] object-cover" />
      <p className="text-xs text-on-surface-variant">Aponte a câmera para o QR ou para o código de barras do tombo.</p>
    </Modal>
  );
}
