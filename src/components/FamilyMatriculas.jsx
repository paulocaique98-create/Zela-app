import React, { useEffect, useState } from 'react';
import {
  FileText, Loader2, Plus, Trash2, X, Check, Upload, ChevronDown, ChevronUp,
  Clock, CheckCircle2, XCircle, User, Baby, Car, UserCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadFile, buildSafeFileName } from '../lib/storage';
import ConfirmModal from './ConfirmModal';

const BUCKET = 'matriculas-docs';
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Separado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'];
const PARENTESCOS = ['Avô(ó)', 'Tio(a)', 'Irmão(ã)', 'Cuidador(a)', 'Babá', 'Outro'];

const CICLOS = [6, 8, 10];
const PERIODOS_POR_CICLO = {
  6: [
    { label: '07:00 às 13:00', turno: 'Matutino' },
    { label: '13:00 às 19:00', turno: 'Vespertino' },
  ],
  8: [
    { label: '07:00 às 15:00', turno: 'Matutino' },
    { label: '11:00 às 19:00', turno: 'Vespertino' },
    { label: '13:00 às 19:00', turno: 'Vespertino' },
  ],
  10: [
    { label: '07:00 às 17:00', turno: 'Matutino' },
    { label: '09:00 às 19:00', turno: 'Matutino' },
  ],
};

const DOC_FIELDS = [
  { key: 'cpf_doc', label: 'CPF' },
  { key: 'rg_doc', label: 'RG' },
  { key: 'comprovante_residencia_doc', label: 'Comprovante de Residência' },
  { key: 'plano_saude_doc', label: 'Plano de Saúde / SUS' },
  { key: 'cartao_vacina_doc', label: 'Cartão de Vacina' },
];

const emptyResponsavel = () => ({
  nome: '', email: '', cpf: '', rg: '', rg_expedicao: '', rg_orgao: '',
  telefone: '', profissao: '', estado_civil: '',
});

const emptyCrianca = () => ({
  id: Date.now() + Math.random(),
  nome: '', nascimento: '', cidade_nascimento: '', certidao_doc: null,
  endereco: '', ciclo: '', periodo: '', turno: '',
});

const emptyAutorizado = () => ({ id: Date.now() + Math.random(), nome: '', telefone: '', parentesco: '' });
const emptyTransporteAutorizado = () => ({ id: Date.now() + Math.random(), nome: '' });

const inputCls = 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5';

function DocUploadButton({ label, doc, onUpload, onRemove, isUploading }) {
  const inputId = `doc-${label.replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={inputId}
        className={`flex-1 flex items-center gap-2 border border-dashed rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer transition ${
          doc ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-slate-300 hover:border-indigo-400 text-slate-500 hover:text-indigo-600'
        } ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {isUploading ? <Loader2 size={14} className="animate-spin shrink-0" /> : doc ? <Check size={14} className="shrink-0" /> : <Upload size={14} className="shrink-0" />}
        <span className="truncate">{doc ? `${label} anexado` : `Importar ${label}`}</span>
        <input id={inputId} type="file" accept={ALLOWED_TYPES.join(',')} onChange={onUpload} className="hidden" disabled={isUploading} />
      </label>
      {doc && (
        <button type="button" onClick={onRemove} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default function FamilyMatriculas({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [requestId] = useState(() => crypto.randomUUID());
  const [responsavel, setResponsavel] = useState(emptyResponsavel());
  const [temSegundo, setTemSegundo] = useState(false);
  const [segundoResponsavel, setSegundoResponsavel] = useState(emptyResponsavel());
  const [criancas, setCriancas] = useState([emptyCrianca()]);
  const [autorizados, setAutorizados] = useState([emptyAutorizado()]);
  const [temTransporte, setTemTransporte] = useState(false);
  const [transporteAutorizados, setTransporteAutorizados] = useState([emptyTransporteAutorizado()]);

  const [uploadingKey, setUploadingKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const limits = { autorizados_por_responsavel: 2, autorizados_transporte: 1, ...(currentSchool?.limits || {}) };
  const maxAutorizados = limits.autorizados_por_responsavel * (temSegundo ? 2 : 1);
  const maxTransporte = limits.autorizados_transporte;

  const fetchSolicitacoes = async () => {
    if (!currentUser?.id) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('matricula_solicitacoes')
        .select('*')
        .eq('family_id', currentUser.id)
        .order('submitted_at', { ascending: false });
      if (fetchError) throw fetchError;
      setSolicitacoes(data || []);
    } catch (err) {
      console.error('[FamilyMatriculas] Erro ao buscar:', err);
      setError('Não foi possível carregar suas solicitações.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitacoes();
  }, [currentUser?.id]);

  // Se o 2º Responsável for desmarcado, o limite de autorizados cai pela metade —
  // corta o excesso pra não deixar a lista acima do permitido.
  useEffect(() => {
    setAutorizados(prev => (prev.length > maxAutorizados ? prev.slice(0, maxAutorizados) : prev));
  }, [maxAutorizados]);

  const resetForm = () => {
    setShowForm(false);
    setResponsavel(emptyResponsavel());
    setTemSegundo(false);
    setSegundoResponsavel(emptyResponsavel());
    setCriancas([emptyCrianca()]);
    setAutorizados([emptyAutorizado()]);
    setTemTransporte(false);
    setTransporteAutorizados([emptyTransporteAutorizado()]);
    setFormError('');
  };

  const uploadResponsavelDoc = async (docKey, file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFormError(`Tipo de arquivo não permitido: ${file.name}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFormError(`Arquivo muito grande (máx. 15MB): ${file.name}`);
      return;
    }
    setUploadingKey(docKey);
    setFormError('');
    try {
      const path = `${schoolId}/${currentUser.id}/${requestId}/${docKey}-${buildSafeFileName(file)}`;
      await uploadFile(BUCKET, path, file);
      setResponsavel(prev => ({ ...prev, [docKey]: { path, name: file.name } }));
    } catch (err) {
      console.error('[FamilyMatriculas] Erro ao subir documento:', err);
      setFormError('Não foi possível enviar esse documento.');
    } finally {
      setUploadingKey(null);
    }
  };

  const uploadCriancaDoc = async (criancaId, file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFormError(`Tipo de arquivo não permitido: ${file.name}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFormError(`Arquivo muito grande (máx. 15MB): ${file.name}`);
      return;
    }
    const uploadKey = `crianca-${criancaId}`;
    setUploadingKey(uploadKey);
    setFormError('');
    try {
      const path = `${schoolId}/${currentUser.id}/${requestId}/certidao-${criancaId}-${buildSafeFileName(file)}`;
      await uploadFile(BUCKET, path, file);
      setCriancas(prev => prev.map(c => (c.id === criancaId ? { ...c, certidao_doc: { path, name: file.name } } : c)));
    } catch (err) {
      console.error('[FamilyMatriculas] Erro ao subir certidão:', err);
      setFormError('Não foi possível enviar a certidão de nascimento.');
    } finally {
      setUploadingKey(null);
    }
  };

  const updateCrianca = (id, patch) => {
    setCriancas(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch };
      if (patch.ciclo !== undefined) { next.periodo = ''; next.turno = ''; }
      if (patch.periodo !== undefined) {
        const opt = (PERIODOS_POR_CICLO[Number(next.ciclo)] || []).find(p => p.label === patch.periodo);
        next.turno = opt?.turno || '';
      }
      return next;
    }));
  };

  const addCrianca = () => setCriancas(prev => [...prev, emptyCrianca()]);
  const removeCrianca = (id) => setCriancas(prev => prev.filter(c => c.id !== id));

  const addTransporteAutorizado = () => setTransporteAutorizados(prev => (prev.length >= maxTransporte ? prev : [...prev, emptyTransporteAutorizado()]));
  const removeTransporteAutorizado = (id) => setTransporteAutorizados(prev => prev.filter(t => t.id !== id));
  const updateTransporteAutorizado = (id, nome) => setTransporteAutorizados(prev => prev.map(t => (t.id === id ? { ...t, nome } : t)));

  const addAutorizado = () => setAutorizados(prev => (prev.length >= maxAutorizados ? prev : [...prev, emptyAutorizado()]));
  const removeAutorizado = (id) => setAutorizados(prev => prev.filter(a => a.id !== id));
  const updateAutorizado = (id, patch) => setAutorizados(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const validate = () => {
    if (!responsavel.nome.trim() || !responsavel.email.trim() || !responsavel.cpf.trim() || !responsavel.telefone.trim()) {
      return 'Preencha ao menos nome, e-mail, CPF e telefone do responsável financeiro.';
    }
    if (temSegundo && !segundoResponsavel.nome.trim()) {
      return 'Preencha ao menos o nome do segundo responsável, ou desmarque a opção.';
    }
    const validCriancas = criancas.filter(c => c.nome.trim());
    if (validCriancas.length === 0) {
      return 'Adicione ao menos uma criança.';
    }
    for (const c of validCriancas) {
      if (!c.nascimento || !c.ciclo || !c.periodo) {
        return `Complete os dados de ${c.nome} (data de nascimento, ciclo e período).`;
      }
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }

    setIsSubmitting(true);
    setFormError('');
    try {
      const payload = {
        id: requestId,
        school_id: schoolId,
        family_id: currentUser.id,
        status: 'pending',
        responsavel_financeiro: responsavel,
        segundo_responsavel: temSegundo ? segundoResponsavel : null,
        criancas: criancas.filter(c => c.nome.trim()).map(({ id, ...rest }) => rest),
        autorizados: autorizados.filter(a => a.nome.trim()).map(({ id, ...rest }) => rest),
        transporte_autorizados: temTransporte ? transporteAutorizados.filter(t => t.nome.trim()).map(t => ({ nome: t.nome })) : [],
      };
      const { error: insertError } = await supabase.from('matricula_solicitacoes').insert(payload);
      if (insertError) throw insertError;
      resetForm();
      await fetchSolicitacoes();
    } catch (err2) {
      console.error('[FamilyMatriculas] Erro ao enviar solicitação:', err2);
      setFormError('Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('matricula_solicitacoes').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setSolicitacoes(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('[FamilyMatriculas] Erro ao excluir:', err);
      setError('Não foi possível excluir essa solicitação.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Matrículas</h2>
            <p className="text-slate-500 text-sm hidden sm:block">Preencha e acompanhe as matrículas dos seus filhos.</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Nova Solicitação</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Nova solicitação de Matrícula</h3>
              <button type="button" onClick={resetForm} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{formError}</div>
            )}

            {/* Responsável Financeiro */}
            <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2"><User size={16} className="text-indigo-600" /> Responsável Financeiro</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nome completo *</label>
                  <input className={inputCls} value={responsavel.nome} onChange={e => setResponsavel(p => ({ ...p, nome: e.target.value }))} required />
                </div>
                <div>
                  <label className={labelCls}>E-mail *</label>
                  <input type="email" className={inputCls} value={responsavel.email} onChange={e => setResponsavel(p => ({ ...p, email: e.target.value }))} required />
                </div>
                <div>
                  <label className={labelCls}>Telefone *</label>
                  <input className={inputCls} value={responsavel.telefone} onChange={e => setResponsavel(p => ({ ...p, telefone: e.target.value }))} required />
                </div>
                <div>
                  <label className={labelCls}>CPF *</label>
                  <input className={inputCls} value={responsavel.cpf} onChange={e => setResponsavel(p => ({ ...p, cpf: e.target.value }))} required />
                </div>
                <div>
                  <label className={labelCls}>RG</label>
                  <input className={inputCls} value={responsavel.rg} onChange={e => setResponsavel(p => ({ ...p, rg: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Data de Expedição</label>
                  <input type="date" className={inputCls} value={responsavel.rg_expedicao} onChange={e => setResponsavel(p => ({ ...p, rg_expedicao: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Órgão Expedidor</label>
                  <input className={inputCls} value={responsavel.rg_orgao} onChange={e => setResponsavel(p => ({ ...p, rg_orgao: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Profissão</label>
                  <input className={inputCls} value={responsavel.profissao} onChange={e => setResponsavel(p => ({ ...p, profissao: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Estado Civil</label>
                  <select className={inputCls} value={responsavel.estado_civil} onChange={e => setResponsavel(p => ({ ...p, estado_civil: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {ESTADO_CIVIL.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <label className={labelCls}>Documentos</label>
                {DOC_FIELDS.map(({ key, label }) => (
                  <DocUploadButton
                    key={key}
                    label={label}
                    doc={responsavel[key]}
                    isUploading={uploadingKey === key}
                    onUpload={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadResponsavelDoc(key, f); }}
                    onRemove={() => setResponsavel(p => ({ ...p, [key]: null }))}
                  />
                ))}
              </div>
            </section>

            {/* Segundo Responsável */}
            <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={temSegundo} onChange={e => setTemSegundo(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                <span className="font-bold text-slate-800 text-sm flex items-center gap-2"><User size={16} className="text-indigo-600" /> Adicionar Segundo Responsável</span>
              </label>
              {temSegundo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Nome completo *</label>
                    <input className={inputCls} value={segundoResponsavel.nome} onChange={e => setSegundoResponsavel(p => ({ ...p, nome: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>E-mail</label>
                    <input type="email" className={inputCls} value={segundoResponsavel.email} onChange={e => setSegundoResponsavel(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Telefone</label>
                    <input className={inputCls} value={segundoResponsavel.telefone} onChange={e => setSegundoResponsavel(p => ({ ...p, telefone: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>CPF</label>
                    <input className={inputCls} value={segundoResponsavel.cpf} onChange={e => setSegundoResponsavel(p => ({ ...p, cpf: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>RG</label>
                    <input className={inputCls} value={segundoResponsavel.rg} onChange={e => setSegundoResponsavel(p => ({ ...p, rg: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Data de Expedição</label>
                    <input type="date" className={inputCls} value={segundoResponsavel.rg_expedicao} onChange={e => setSegundoResponsavel(p => ({ ...p, rg_expedicao: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Órgão Expedidor</label>
                    <input className={inputCls} value={segundoResponsavel.rg_orgao} onChange={e => setSegundoResponsavel(p => ({ ...p, rg_orgao: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Profissão</label>
                    <input className={inputCls} value={segundoResponsavel.profissao} onChange={e => setSegundoResponsavel(p => ({ ...p, profissao: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Estado Civil</label>
                    <select className={inputCls} value={segundoResponsavel.estado_civil} onChange={e => setSegundoResponsavel(p => ({ ...p, estado_civil: e.target.value }))}>
                      <option value="">Selecionar...</option>
                      {ESTADO_CIVIL.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </section>

            {/* Crianças */}
            <section className="space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Baby size={16} className="text-indigo-600" /> Informações da Criança</h4>
              {criancas.map((c, idx) => {
                const periodoOptions = PERIODOS_POR_CICLO[Number(c.ciclo)] || [];
                return (
                  <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">Criança {idx + 1}</span>
                      {criancas.length > 1 && (
                        <button type="button" onClick={() => removeCrianca(c.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Nome completo *</label>
                        <input className={inputCls} value={c.nome} onChange={e => updateCrianca(c.id, { nome: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Data de Nascimento *</label>
                        <input type="date" className={inputCls} value={c.nascimento} onChange={e => updateCrianca(c.id, { nascimento: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Cidade de Nascimento</label>
                        <input className={inputCls} value={c.cidade_nascimento} onChange={e => updateCrianca(c.id, { cidade_nascimento: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Endereço completo</label>
                        <input className={inputCls} placeholder="Rua, número, complemento, bairro, cidade/UF - CEP" value={c.endereco} onChange={e => updateCrianca(c.id, { endereco: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Ciclo (Horas/Dia) *</label>
                        <select className={inputCls} value={c.ciclo} onChange={e => updateCrianca(c.id, { ciclo: e.target.value })}>
                          <option value="">Selecionar...</option>
                          {CICLOS.map(h => <option key={h} value={h}>{h}h/dia</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Período *</label>
                        <select className={inputCls} value={c.periodo} onChange={e => updateCrianca(c.id, { periodo: e.target.value })} disabled={!c.ciclo}>
                          <option value="">{c.ciclo ? 'Selecionar...' : '← Primeiro o Ciclo'}</option>
                          {periodoOptions.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Turno</label>
                        <input className={`${inputCls} bg-slate-100 text-slate-500`} value={c.turno} readOnly placeholder="Automático" />
                      </div>
                    </div>
                    <DocUploadButton
                      label="Certidão de Nascimento"
                      doc={c.certidao_doc}
                      isUploading={uploadingKey === `crianca-${c.id}`}
                      onUpload={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCriancaDoc(c.id, f); }}
                      onRemove={() => updateCrianca(c.id, { certidao_doc: null })}
                    />
                  </div>
                );
              })}
              <button type="button" onClick={addCrianca} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-bold text-sm px-3 py-2">
                <Plus size={16} /> Adicionar Criança
              </button>
            </section>

            {/* Autorizados */}
            <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2"><UserCheck size={16} className="text-indigo-600" /> Informações do Autorizado</h4>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{autorizados.length}/{maxAutorizados}</span>
              </div>
              <div className="space-y-3">
                {autorizados.map((a, idx) => (
                  <div key={a.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end bg-white border border-slate-200 rounded-xl p-3">
                    <div>
                      <label className={labelCls}>Nome completo</label>
                      <input className={inputCls} value={a.nome} onChange={e => updateAutorizado(a.id, { nome: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Telefone</label>
                      <input className={inputCls} value={a.telefone} onChange={e => updateAutorizado(a.id, { telefone: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className={labelCls}>Parentesco</label>
                        <select className={inputCls} value={a.parentesco} onChange={e => updateAutorizado(a.id, { parentesco: e.target.value })}>
                          <option value="">Selecionar...</option>
                          {PARENTESCOS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      {autorizados.length > 1 && (
                        <button type="button" onClick={() => removeAutorizado(a.id)} className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {autorizados.length < maxAutorizados && (
                  <button type="button" onClick={addAutorizado} className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-bold text-xs px-2 py-1">
                    <Plus size={14} /> Adicionar autorizado {temSegundo ? '(até 2 por responsável)' : ''}
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={temTransporte}
                  onChange={e => setTemTransporte(e.target.checked)}
                  disabled={maxTransporte === 0}
                  className="w-4 h-4 accent-indigo-600 disabled:opacity-40"
                />
                <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><Car size={15} className="text-indigo-600" /> Outros autorizados pelo transporte?</span>
              </label>
              {temTransporte && (
                <div className="space-y-2 pt-1">
                  {transporteAutorizados.map((t, idx) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <input
                        className={inputCls}
                        placeholder={`Nome do autorizado ${idx + 1}`}
                        value={t.nome}
                        onChange={e => updateTransporteAutorizado(t.id, e.target.value)}
                      />
                      {transporteAutorizados.length > 1 && (
                        <button type="button" onClick={() => removeTransporteAutorizado(t.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  {transporteAutorizados.length < maxTransporte && (
                    <button type="button" onClick={addTransporteAutorizado} className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-bold text-xs px-2 py-1">
                      <Plus size={14} /> Adicionar outro
                    </button>
                  )}
                </div>
              )}
            </section>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-3 rounded-xl font-bold transition-all active:scale-95 text-sm"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Enviar Solicitação
            </button>
          </form>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : solicitacoes.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600">Nenhuma solicitação enviada ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {solicitacoes.map(s => (
                  <SolicitacaoCard key={s.id} solicitacao={s} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {confirmDeleteId && (
        <ConfirmModal
          title="Excluir solicitação"
          message="Excluir esta solicitação pendente?"
          isLoading={deletingId === confirmDeleteId}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

const STATUS_INFO = {
  pending: { label: 'Em análise', icon: Clock, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Aprovada', icon: CheckCircle2, cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejeitada', icon: XCircle, cls: 'bg-red-50 text-red-700 border-red-200' },
};

function SolicitacaoCard({ solicitacao, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_INFO[solicitacao.status] || STATUS_INFO.pending;
  const StatusIcon = status.icon;
  const criancas = solicitacao.criancas || [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between p-4 text-left">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 text-sm truncate">
            {criancas.map(c => c.nome).join(', ') || 'Solicitação'}
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            Enviado em {new Date(solicitacao.submitted_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg border ${status.cls}`}>
            <StatusIcon size={11} /> {status.label}
          </span>
          {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {solicitacao.status === 'rejected' && solicitacao.rejection_reason && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-xs font-medium">
              Motivo: {solicitacao.rejection_reason}
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Responsável Financeiro</p>
            <p className="text-sm text-slate-700">{solicitacao.responsavel_financeiro?.nome}</p>
          </div>
          {criancas.map((c, i) => (
            <div key={i}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Criança {i + 1}</p>
              <p className="text-sm text-slate-700">{c.nome} — {c.ciclo}h/dia, {c.periodo} ({c.turno})</p>
            </div>
          ))}
          {solicitacao.status === 'pending' && (
            <button
              onClick={() => onDelete(solicitacao.id)}
              className="flex items-center gap-1.5 text-red-500 hover:text-red-600 font-bold text-xs pt-1"
            >
              <Trash2 size={13} /> Excluir solicitação
            </button>
          )}
        </div>
      )}
    </div>
  );
}
