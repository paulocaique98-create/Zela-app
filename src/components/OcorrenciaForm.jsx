import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, Field, inputCls, Notice, PrimaryButton, SecondaryButton } from './GestaoShared';
import {
  TIPOS, GRAVIDADES, MEDIDAS, TIPOS_COM_ALERTA_SAUDE, formularioVazio, validarOcorrencia, validarAnexo,
  montarPayload, registrarOcorrencia, atualizarOcorrencia, enviarAnexo, alertasSaude, notifyOcorrencia, hojeISO,
} from '../lib/ocorrencias';

// Formulário de ocorrência, usado pela professora (Professor › Ocorrências) e
// pela Coordenação/Direção (Gestão › Acadêmico › Ocorrências e perfil do aluno).
//  * turmas: nomes das turmas que a pessoa pode escolher (a RLS repete a regra).
//  * alunoFixo: { id, name, turma } quando abre pelo perfil do aluno.
//  * podeMedida: só Coordenação e Direção aplicam advertência ou suspensão.
//  * inicial: ocorrência existente (edição, só Coordenação e Direção).
export default function OcorrenciaForm({ currentUser, schoolId, turmas = null, alunoFixo = null, podeMedida = false, inicial = null, onClose, onSaved }) {
  const [form, setForm] = useState(() => (inicial
    ? { ...formularioVazio(), ...inicial, providencias: inicial.providencias || '', medida: inicial.medida || '', medida_inicio: inicial.medida_inicio || '', medida_fim: inicial.medida_fim || '' }
    : { ...formularioVazio(), student_id: alunoFixo?.id || '' }));
  const [turma, setTurma] = useState(alunoFixo?.turma || '');
  const [alunos, setAlunos] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [arquivos, setArquivos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [turmasLista, setTurmasLista] = useState(turmas || []);
  const inputArquivo = useRef(null);
  const editando = Boolean(inicial);
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  // Sem lista de turmas (Gestão), deriva das turmas dos alunos da escola.
  useEffect(() => {
    if (turmas || alunoFixo || editando) return;
    let ativo = true;
    supabase.from('students').select('turma').eq('school_id', schoolId).eq('enrollment_status', 'ativo').limit(2000)
      .then(({ data }) => { if (ativo) setTurmasLista([...new Set((data || []).map(s => s.turma).filter(Boolean))].sort()); });
    return () => { ativo = false; };
  }, [turmas, alunoFixo, editando, schoolId]);

  useEffect(() => {
    if (alunoFixo || editando || !turma) { setAlunos([]); return; }
    let ativo = true;
    supabase.from('students').select('id, name').eq('school_id', schoolId).eq('turma', turma).eq('enrollment_status', 'ativo').order('name').limit(200)
      .then(({ data }) => { if (ativo) setAlunos(data || []); });
    return () => { ativo = false; };
  }, [turma, alunoFixo, editando, schoolId]);

  useEffect(() => {
    if (!form.student_id || !TIPOS_COM_ALERTA_SAUDE.includes(form.tipo)) { setAlertas([]); return; }
    let ativo = true;
    alertasSaude(form.student_id).then(a => { if (ativo) setAlertas(a); }).catch(() => { if (ativo) setAlertas([]); });
    return () => { ativo = false; };
  }, [form.student_id, form.tipo]);

  const escolherArquivos = (e) => {
    const novos = Array.from(e.target.files || []);
    e.target.value = '';
    const problema = novos.map(validarAnexo).find(Boolean);
    if (problema) { setErro(problema); return; }
    setErro('');
    setArquivos(a => [...a, ...novos].slice(0, 5));
  };

  const salvar = async () => {
    const problema = validarOcorrencia(form, { podeMedida });
    if (problema) { setErro(problema); return; }
    setSalvando(true);
    setErro('');
    try {
      if (editando) {
        await atualizarOcorrencia(inicial.id, schoolId, form);
        for (const f of arquivos) await enviarAnexo(schoolId, inicial.id, f);
        onSaved?.();
        return;
      }
      const { id } = await registrarOcorrencia(montarPayload(form, { schoolId, userId: currentUser.id, podeMedida }));
      let falhaAnexo = false;
      for (const f of arquivos) {
        try { await enviarAnexo(schoolId, id, f); } catch { falhaAnexo = true; }
      }
      notifyOcorrencia(id);
      onSaved?.(falhaAnexo ? 'A ocorrência foi registrada, mas algum anexo não foi enviado.' : '');
    } catch (e) {
      setErro(e?.message || 'Não foi possível salvar a ocorrência.');
      setSalvando(false);
    }
  };

  return (
    <Modal
      title={editando ? 'Editar ocorrência' : 'Nova ocorrência'}
      onClose={salvando ? () => {} : onClose}
      footer={<>
        <SecondaryButton onClick={onClose} disabled={salvando}>Cancelar</SecondaryButton>
        <PrimaryButton onClick={salvar} disabled={salvando}>{salvando && <Loader2 size={14} className="animate-spin" />} {editando ? 'Salvar alterações' : 'Registrar'}</PrimaryButton>
      </>}
    >
      <Notice>{erro}</Notice>
      {editando && <Notice type="success">A versão anterior fica guardada no histórico da ocorrência.</Notice>}

      {!editando && !alunoFixo && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Turma" id="oc-turma">
            <select id="oc-turma" className={inputCls} value={turma} onChange={e => { setTurma(e.target.value); set('student_id', ''); }}>
              <option value="">Escolha</option>
              {turmasLista.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Aluno" id="oc-aluno">
            <select id="oc-aluno" className={inputCls} value={form.student_id} onChange={e => set('student_id', e.target.value)} disabled={!turma}>
              <option value="">Escolha</option>
              {alunos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
      )}
      {(alunoFixo || editando) && (
        <p className="text-sm font-bold text-on-surface">{alunoFixo?.name || inicial?.students?.name}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Tipo" id="oc-tipo">
          <select id="oc-tipo" className={inputCls} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Gravidade" id="oc-grav">
          <select id="oc-grav" className={inputCls} value={form.gravidade} onChange={e => set('gravidade', e.target.value)}>
            {Object.entries(GRAVIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Data" id="oc-data">
          <input id="oc-data" type="date" className={inputCls} max={hojeISO()} value={form.ocorrido_em} onChange={e => set('ocorrido_em', e.target.value)} />
        </Field>
      </div>

      {alertas.length > 0 && (
        <div className="p-2.5 rounded-zela-md border border-warning/40 bg-warning/10 text-sm text-on-surface">
          <p className="font-semibold flex items-center gap-1.5 text-warning"><AlertTriangle size={15} /> Ficha médica deste aluno</p>
          <ul className="mt-1 list-disc pl-5 text-xs">{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      <Field label="O que aconteceu" id="oc-desc">
        <textarea id="oc-desc" rows={4} maxLength={4000} className={inputCls} value={form.descricao} onChange={e => set('descricao', e.target.value)} />
      </Field>
      <Field label="Providências tomadas" id="oc-prov">
        <textarea id="oc-prov" rows={3} maxLength={4000} className={inputCls} value={form.providencias} onChange={e => set('providencias', e.target.value)} />
      </Field>

      <div className="space-y-2 p-3 rounded-zela-md border border-outline-variant">
        <label className="flex items-start gap-2 text-sm text-on-surface">
          <input type="checkbox" className="mt-1" checked={form.visivel_familia}
            onChange={e => setForm(f => ({ ...f, visivel_familia: e.target.checked, exige_ciencia: e.target.checked ? f.exige_ciencia : false }))} />
          <span>Mostrar à família<span className="block text-xs text-on-surface-variant">Sem isso a ocorrência fica só com a escola.</span></span>
        </label>
        <label className={`flex items-start gap-2 text-sm ${form.visivel_familia ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
          <input type="checkbox" className="mt-1" disabled={!form.visivel_familia} checked={form.exige_ciencia} onChange={e => set('exige_ciencia', e.target.checked)} />
          <span>Pedir ciência da família<span className="block text-xs text-on-surface-variant">O responsável confirma que leu.</span></span>
        </label>
      </div>

      {podeMedida && (
        <div className="space-y-2 p-3 rounded-zela-md border border-outline-variant">
          <Field label="Medida disciplinar" id="oc-medida">
            <select id="oc-medida" className={inputCls} value={form.medida} onChange={e => set('medida', e.target.value)}>
              <option value="">Nenhuma</option>
              {Object.entries(MEDIDAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {form.medida && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início" id="oc-mini"><input id="oc-mini" type="date" className={inputCls} value={form.medida_inicio} onChange={e => set('medida_inicio', e.target.value)} /></Field>
              <Field label="Fim" id="oc-mfim"><input id="oc-mfim" type="date" className={inputCls} value={form.medida_fim} onChange={e => set('medida_fim', e.target.value)} /></Field>
            </div>
          )}
        </div>
      )}

      <div>
        <input ref={inputArquivo} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={escolherArquivos} />
        <SecondaryButton type="button" onClick={() => inputArquivo.current?.click()} disabled={arquivos.length >= 5}><Paperclip size={15} /> Anexar foto ou PDF</SecondaryButton>
        {arquivos.length > 0 && (
          <ul className="mt-2 text-xs text-on-surface-variant space-y-0.5">
            {arquivos.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">{a.name}</span>
                <button type="button" className="text-error font-semibold" onClick={() => setArquivos(l => l.filter((_, j) => j !== i))}>Tirar</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-on-surface-variant/70 mt-1">Até 5 arquivos de 10 MB. Só a escola vê os anexos, e eles não podem ser apagados depois.</p>
      </div>
    </Modal>
  );
}
