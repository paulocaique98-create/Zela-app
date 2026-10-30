import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Printer, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/gestaoUtils';
import { listarHistoricoDoAluno } from '../tradicional/lib/historico';
import {
  TIPOS_DOCUMENTO, RESULTADOS_EXTERNOS, rotuloResultado, tiposDisponiveis, formatarCodigo, dataBR,
  montarAnos, montarConteudo, pendenciasDeDados, validarAnoExterno, linhaDoAnoExterno, disciplinasParaTexto,
} from '../lib/documentosEscolares';
import { printDocumentoEscolar } from '../lib/printDocumentoEscolar';
import {
  PageShell, Tabs, Modal, Field, inputCls, PrimaryButton, SecondaryButton, ResponsiveTable, EmptyState, Loading, Notice,
} from './GestaoShared';

// Histórico escolar oficial e declarações (item 12 do plano de expansão da Gestão).
// Gestão, Coordenação e Direção; a Recepção só com a permissão historico.emitir (a RLS barra os
// outros). Emitir e cancelar passam por funções do banco: número, código e hash vêm do servidor.
const COLUNAS_ESCOLA = 'id, name, razao_social, cnpj, phone, email, director_name, zip_code, street, number, complement, neighborhood, city, state, pedagogical_method';
const COLUNAS_EXTERNO = 'id, student_id, escola_origem, cidade, uf, ano_letivo, serie, disciplinas, carga_horaria, frequencia, resultado, observacao';
const COLUNAS_EMITIDO = 'id, tipo, numero, codigo_verificacao, conteudo, hash_conteudo, emitido_em, cancelado_em, motivo_cancelamento';
const CHIP = 'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap';
const EXTERNO_VAZIO = {
  escola_origem: '', cidade: '', uf: '', ano_letivo: '', serie: '', disciplinas_texto: '',
  carga_horaria: '', frequencia: '', resultado: 'aprovado', observacao: '',
};

export default function GestaoHistoricoEscolar({ currentUser }) {
  const schoolId = currentUser.school_id;
  const [escola, setEscola] = useState(null);
  const [alunos, setAlunos] = useState([]);
  const [busca, setBusca] = useState('');
  const [alunoId, setAlunoId] = useState('');
  const [aba, setAba] = useState('emitir');
  const [carregando, setCarregando] = useState(true);
  const [carregandoAluno, setCarregandoAluno] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [responsaveis, setResponsaveis] = useState([]);
  const [externos, setExternos] = useState([]);
  const [internos, setInternos] = useState([]);
  const [emitidos, setEmitidos] = useState([]);
  const [editandoExterno, setEditandoExterno] = useState(null);
  const [cancelando, setCancelando] = useState(null);

  const metodo = escola?.pedagogical_method || '';
  const aluno = useMemo(() => alunos.find(a => a.id === alunoId) || null, [alunos, alunoId]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      const [esc, al] = await Promise.all([
        supabase.from('schools').select(COLUNAS_ESCOLA).eq('id', schoolId).maybeSingle(),
        supabase.from('students').select('id, name, birth_date, cidade_nascimento, turma, enrollment_status')
          .eq('school_id', schoolId).order('name').limit(1000),
      ]);
      if (!ativo) return;
      if (esc.error || al.error) setErro('Não foi possível carregar os dados da escola e dos alunos.');
      setEscola(esc.data || null);
      setAlunos(al.data || []);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [schoolId]);

  const carregarAluno = useCallback(async (id, metodoEscola) => {
    if (!id) return;
    setCarregandoAluno(true);
    setErro('');
    const [resp, ext, emi, int] = await Promise.all([
      supabase.from('student_guardians').select('relationship, is_primary, users:guardian_id(name)').eq('student_id', id).limit(10),
      supabase.from('student_external_history').select(COLUNAS_EXTERNO).eq('school_id', schoolId).eq('student_id', id).order('ano_letivo').limit(40),
      supabase.from('school_documents_issued').select(COLUNAS_EMITIDO).eq('school_id', schoolId).eq('student_id', id).order('emitido_em', { ascending: false }).limit(60),
      metodoEscola === 'montessori' ? Promise.resolve([]) : listarHistoricoDoAluno(schoolId, id).catch(() => []),
    ]);
    if (resp.error || ext.error || emi.error) setErro('Não foi possível carregar o histórico deste aluno.');
    setResponsaveis((resp.data || []).map(r => ({ nome: r.users?.name || '', parentesco: r.relationship || '' })).filter(r => r.nome));
    setExternos(ext.data || []);
    setEmitidos(emi.data || []);
    setInternos(int || []);
    setCarregandoAluno(false);
  }, [schoolId]);

  useEffect(() => { if (alunoId && escola) carregarAluno(alunoId, metodo); }, [alunoId, escola, metodo, carregarAluno]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (t ? alunos.filter(a => a.name.toLowerCase().includes(t)) : alunos).slice(0, 8);
  }, [alunos, busca]);

  const recarregar = () => carregarAluno(alunoId, metodo);

  const tabs = [
    { id: 'emitir', label: 'Emitir' },
    { id: 'externos', label: 'Anos cursados fora', badge: externos.length || null },
    { id: 'emitidos', label: 'Emitidos', badge: emitidos.length || null },
  ];

  if (carregando) return <Loading />;

  return (
    <PageShell>
      {aviso && <div className="mb-3"><Notice type="success">{aviso}</Notice></div>}
      {erro && <div className="mb-3"><Notice>{erro}</Notice></div>}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3 mb-4">
        <Field label="Aluno" id="hist-busca">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input id="hist-busca" className={`${inputCls} pl-8`} placeholder="Buscar pelo nome do aluno" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </Field>
        {busca.trim() && (
          <ul className="mt-2 divide-y divide-outline-variant border border-outline-variant rounded-zela-md">
            {filtrados.length === 0 && <li className="px-3 py-2 text-sm text-on-surface-variant">Nenhum aluno encontrado.</li>}
            {filtrados.map(a => (
              <li key={a.id}>
                <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10"
                  onClick={() => { setAlunoId(a.id); setBusca(''); setAviso(''); setAba('emitir'); }}>
                  {a.name}{a.turma ? <span className="text-on-surface-variant"> · {a.turma}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {aluno && <p className="mt-2 text-sm font-semibold text-on-surface">Aluno selecionado: {aluno.name}</p>}
      </div>

      {!aluno && <EmptyState text="Escolha um aluno para ver o histórico e emitir documentos." />}

      {aluno && (
        <>
          <Tabs tabs={tabs} active={aba} onChange={setAba} />
          {carregandoAluno ? <Loading /> : (
            <>
              {aba === 'emitir' && (
                <Emitir
                  escola={escola} aluno={aluno} responsaveis={responsaveis} metodo={metodo}
                  internos={internos} externos={externos}
                  onEmitido={(msg) => { setAviso(msg); setErro(''); recarregar(); setAba('emitidos'); }}
                  onErro={setErro}
                />
              )}
              {aba === 'externos' && (
                <Externos
                  externos={externos}
                  onNovo={() => setEditandoExterno({ ...EXTERNO_VAZIO })}
                  onEditar={(e) => setEditandoExterno({
                    id: e.id, escola_origem: e.escola_origem, cidade: e.cidade || '', uf: e.uf || '', ano_letivo: String(e.ano_letivo),
                    serie: e.serie, disciplinas_texto: disciplinasParaTexto(e.disciplinas), carga_horaria: e.carga_horaria ?? '',
                    frequencia: e.frequencia ?? '', resultado: e.resultado, observacao: e.observacao || '',
                  })}
                  onApagar={async (e) => {
                    if (!window.confirm('Apagar este ano cursado fora? Os documentos já emitidos não mudam.')) return;
                    const { error } = await supabase.from('student_external_history').delete().eq('id', e.id).eq('school_id', schoolId);
                    if (error) setErro('Não foi possível apagar.'); else { setAviso('Ano apagado.'); recarregar(); }
                  }}
                />
              )}
              {aba === 'emitidos' && (
                <EmitidosLista
                  emitidos={emitidos}
                  onImprimir={(d) => { if (!printDocumentoEscolar(d.conteudo, {
                    numero: d.numero, codigo: d.codigo_verificacao, emitidoEm: d.emitido_em.slice(0, 10), cancelado: Boolean(d.cancelado_em),
                  })) setErro('O navegador bloqueou a janela de impressão. Libere pop ups para este site.'); }}
                  onCancelar={setCancelando}
                />
              )}
            </>
          )}
        </>
      )}

      {editandoExterno && (
        <ExternoModal
          form={editandoExterno} schoolId={schoolId} alunoId={alunoId} userId={currentUser.id}
          onClose={() => setEditandoExterno(null)}
          onSaved={() => { setEditandoExterno(null); setAviso('Ano salvo.'); recarregar(); }}
        />
      )}
      {cancelando && (
        <CancelarModal
          doc={cancelando} onClose={() => setCancelando(null)}
          onDone={() => { setCancelando(null); setAviso('Documento cancelado.'); recarregar(); }}
        />
      )}
    </PageShell>
  );
}

function Emitir({ escola, aluno, responsaveis, metodo, internos, externos, onEmitido, onErro }) {
  const tipos = tiposDisponiveis(metodo);
  const [tipo, setTipo] = useState(tipos[0]);
  const [ato, setAto] = useState('');
  const [secretario, setSecretario] = useState('');
  const [diretor, setDiretor] = useState(escola?.director_name || '');
  const [local, setLocal] = useState(escola?.city || '');
  const [data, setData] = useState(todayISO());
  const [observacoes, setObservacoes] = useState('');
  const [emitindo, setEmitindo] = useState(false);

  const semNotas = tipo === 'ficha_acompanhamento' || metodo === 'montessori';
  const anos = useMemo(
    () => montarAnos({ internos, externos, escolaNome: escola?.name || '', semNotas }),
    [internos, externos, escola, semNotas],
  );
  const pendencias = pendenciasDeDados({ escola, aluno, responsaveis, tipo, anos, ato });
  const ehDeclaracao = tipo.startsWith('declaracao');

  const emitir = async () => {
    onErro('');
    if (!secretario.trim() || !diretor.trim()) return onErro('Informe os nomes de quem assina: Secretaria e Direção.');
    setEmitindo(true);
    try {
      const conteudo = montarConteudo({
        tipo, escola, aluno, responsaveis, anos, metodo, secretario, diretor, observacoes, local, data, ato, turmaAtual: aluno.turma || '',
      });
      const { data: linhas, error } = await supabase.rpc('documentos_emitir', { p_student: aluno.id, p_tipo: tipo, p_conteudo: conteudo });
      if (error) throw error;
      const nova = Array.isArray(linhas) ? linhas[0] : linhas;
      const abriu = printDocumentoEscolar(conteudo, { numero: nova.numero, codigo: nova.codigo_verificacao, emitidoEm: String(nova.emitido_em).slice(0, 10) });
      onEmitido(`${TIPOS_DOCUMENTO[tipo]} número ${nova.numero} emitido.${abriu ? '' : ' Use Imprimir na lista para abrir o documento.'}`);
    } catch (e) {
      onErro(e?.message || 'Não foi possível emitir o documento.');
    } finally {
      setEmitindo(false);
    }
  };

  return (
    <div className="space-y-3">
      {pendencias.length > 0 && (
        <div className="border border-brass bg-brass/15 text-ink rounded-zela-md p-3 text-sm" role="status">
          <p className="font-semibold mb-1">Dados que ainda faltam para o documento sair completo</p>
          <ul className="list-disc pl-5">{pendencias.map(p => <li key={p}>{p}</li>)}</ul>
          <p className="mt-1 text-xs">Você pode emitir assim mesmo, mas confira antes de entregar.</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Documento" id="hist-tipo">
          <select id="hist-tipo" className={inputCls} value={tipo} onChange={e => setTipo(e.target.value)}>
            {tipos.map(t => <option key={t} value={t}>{TIPOS_DOCUMENTO[t]}</option>)}
          </select>
        </Field>
        <Field label="Data" id="hist-data"><input id="hist-data" type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} /></Field>
        {!ehDeclaracao && (
          <Field label="Ato de autorização da escola" id="hist-ato" hint="Ex.: portaria ou parecer que autoriza o funcionamento. Sai no cabeçalho.">
            <input id="hist-ato" className={inputCls} maxLength={200} value={ato} onChange={e => setAto(e.target.value)} />
          </Field>
        )}
        <Field label="Local" id="hist-local"><input id="hist-local" className={inputCls} maxLength={80} value={local} onChange={e => setLocal(e.target.value)} /></Field>
        <Field label="Nome de quem assina pela Secretaria" id="hist-sec"><input id="hist-sec" className={inputCls} maxLength={80} value={secretario} onChange={e => setSecretario(e.target.value)} /></Field>
        <Field label="Nome de quem assina pela Direção" id="hist-dir"><input id="hist-dir" className={inputCls} maxLength={80} value={diretor} onChange={e => setDiretor(e.target.value)} /></Field>
      </div>
      <Field label="Observações" id="hist-obs" hint="Opcional. Sai no fim do documento.">
        <textarea id="hist-obs" rows={2} className={inputCls} maxLength={1500} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
      </Field>
      {!ehDeclaracao && (
        <p className="text-xs text-on-surface-variant">
          {anos.length} {anos.length === 1 ? 'ano entra' : 'anos entram'} no documento{semNotas ? ', sem notas' : ''}.
          Anos da própria escola vêm dos resultados fechados; anos de outras escolas, da aba Anos cursados fora.
        </p>
      )}
      <PrimaryButton onClick={emitir} disabled={emitindo}><Printer size={14} /> {emitindo ? 'Emitindo' : 'Emitir e imprimir'}</PrimaryButton>
    </div>
  );
}

function Externos({ externos, onNovo, onEditar, onApagar }) {
  return (
    <div className="space-y-3">
      <PrimaryButton onClick={onNovo}><Plus size={14} /> Lançar ano</PrimaryButton>
      {externos.length === 0 ? <EmptyState text="Nenhum ano cursado fora lançado para este aluno." /> : (
        <ResponsiveTable
          rows={externos}
          columns={[
            { label: 'Ano', primary: true, render: e => e.ano_letivo },
            { label: 'Escola', render: e => `${e.escola_origem}${e.cidade ? `, ${e.cidade}${e.uf ? `/${e.uf}` : ''}` : ''}` },
            { label: 'Série', render: e => e.serie },
            { label: 'Resultado', render: e => rotuloResultado(e.resultado) },
            { label: '', actions: true, render: e => (
              <div className="flex gap-2">
                <SecondaryButton onClick={() => onEditar(e)}>Editar</SecondaryButton>
                <SecondaryButton onClick={() => onApagar(e)}>Apagar</SecondaryButton>
              </div>
            ) },
          ]}
        />
      )}
    </div>
  );
}

function EmitidosLista({ emitidos, onImprimir, onCancelar }) {
  if (emitidos.length === 0) return <EmptyState text="Nenhum documento emitido para este aluno." />;
  return (
    <ResponsiveTable
      rows={emitidos}
      columns={[
        { label: 'Número', primary: true, render: d => d.numero },
        { label: 'Documento', render: d => TIPOS_DOCUMENTO[d.tipo] || d.tipo },
        { label: 'Emitido em', render: d => dataBR(d.emitido_em.slice(0, 10)) },
        { label: 'Código', render: d => formatarCodigo(d.codigo_verificacao) },
        { label: 'Situação', render: d => d.cancelado_em
          ? <span className={`${CHIP} bg-error/10 text-error border-error/30`} title={d.motivo_cancelamento}>Cancelado</span>
          : <span className={`${CHIP} bg-success/10 text-success border-success/30`}>Válido</span> },
        { label: '', actions: true, render: d => (
          <div className="flex gap-2">
            <SecondaryButton onClick={() => onImprimir(d)}><Printer size={14} /> Imprimir</SecondaryButton>
            {!d.cancelado_em && <SecondaryButton onClick={() => onCancelar(d)}>Cancelar</SecondaryButton>}
          </div>
        ) },
      ]}
    />
  );
}

function ExternoModal({ form: inicial, schoolId, alunoId, userId, onClose, onSaved }) {
  const [f, setF] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));

  const salvar = async () => {
    const problema = validarAnoExterno(f);
    if (problema) return setErro(problema);
    setSalvando(true);
    setErro('');
    const linha = linhaDoAnoExterno(f, f.id ? null : userId);
    const { error } = f.id
      ? await supabase.from('student_external_history').update({ ...linha, updated_at: new Date().toISOString() }).eq('id', f.id).eq('school_id', schoolId)
      : await supabase.from('student_external_history').insert({ ...linha, school_id: schoolId, student_id: alunoId });
    setSalvando(false);
    if (error) return setErro('Não foi possível salvar este ano.');
    onSaved();
  };

  return (
    <Modal title={f.id ? 'Editar ano cursado fora' : 'Lançar ano cursado fora'} onClose={onClose} wide
      footer={<><SecondaryButton onClick={onClose}>Fechar</SecondaryButton><PrimaryButton onClick={salvar} disabled={salvando}>{salvando ? 'Salvando' : 'Salvar'}</PrimaryButton></>}>
      <Notice>{erro}</Notice>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Escola de origem *" id="ext-escola"><input id="ext-escola" className={inputCls} maxLength={160} value={f.escola_origem} onChange={set('escola_origem')} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Field label="Cidade" id="ext-cidade"><input id="ext-cidade" className={inputCls} maxLength={80} value={f.cidade} onChange={set('cidade')} /></Field></div>
          <Field label="UF" id="ext-uf"><input id="ext-uf" className={inputCls} maxLength={2} value={f.uf} onChange={set('uf')} /></Field>
        </div>
        <Field label="Ano letivo *" id="ext-ano"><input id="ext-ano" inputMode="numeric" className={inputCls} maxLength={4} value={f.ano_letivo} onChange={set('ano_letivo')} /></Field>
        <Field label="Série cursada *" id="ext-serie"><input id="ext-serie" className={inputCls} maxLength={80} value={f.serie} onChange={set('serie')} /></Field>
        <Field label="Carga horária (horas)" id="ext-ch"><input id="ext-ch" inputMode="numeric" className={inputCls} value={f.carga_horaria} onChange={set('carga_horaria')} /></Field>
        <Field label="Frequência (%)" id="ext-freq"><input id="ext-freq" inputMode="decimal" className={inputCls} value={f.frequencia} onChange={set('frequencia')} /></Field>
        <Field label="Resultado" id="ext-res">
          <select id="ext-res" className={inputCls} value={f.resultado} onChange={set('resultado')}>
            {RESULTADOS_EXTERNOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Disciplinas e notas" id="ext-disc" hint="Uma por linha, no formato Matemática: 8,5. Não sai na ficha de acompanhamento.">
        <textarea id="ext-disc" rows={5} className={inputCls} value={f.disciplinas_texto} onChange={set('disciplinas_texto')} />
      </Field>
      <Field label="Observação" id="ext-obs"><input id="ext-obs" className={inputCls} maxLength={500} value={f.observacao} onChange={set('observacao')} /></Field>
    </Modal>
  );
}

function CancelarModal({ doc, onClose, onDone }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const cancelar = async () => {
    if (motivo.trim().length < 3) return setErro('Informe o motivo do cancelamento.');
    setSalvando(true);
    const { error } = await supabase.rpc('documentos_cancelar', { p_document: doc.id, p_motivo: motivo.trim() });
    setSalvando(false);
    if (error) return setErro(error.message || 'Não foi possível cancelar.');
    onDone();
  };
  return (
    <Modal title={`Cancelar documento número ${doc.numero}`} onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Voltar</SecondaryButton><PrimaryButton onClick={cancelar} disabled={salvando}>{salvando ? 'Cancelando' : 'Cancelar documento'}</PrimaryButton></>}>
      <Notice>{erro}</Notice>
      <p className="text-sm text-on-surface-variant">O documento continua na lista como cancelado e a verificação pública passa a mostrar que ele não vale mais. Para corrigir, emita um novo.</p>
      <Field label="Motivo *" id="can-motivo"><textarea id="can-motivo" rows={3} className={inputCls} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>
    </Modal>
  );
}
