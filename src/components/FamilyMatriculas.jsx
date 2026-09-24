import React, { useEffect, useState } from 'react';
import {
  FileText, Loader2, Plus, Trash2, X, Check, Upload, ChevronDown, ChevronUp,
  Clock, CheckCircle2, XCircle, User, Baby, Car, UserCheck, MapPin,
  HeartPulse, Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadFile, buildSafeFileName } from '../lib/storage';
import { compressImage } from '../lib/imageCompression';
import { formatPersonName } from '../utils/formatName';
import ConfirmModal from './ConfirmModal';
import {
  ESTADO_CIVIL, PARENTESCOS, CICLOS, PERIODOS_POR_CICLO,
  RESPONSAVEL_DOC_FIELDS, CRIANCA_DOC_FIELDS,
  emptyResponsavel, emptyCrianca, emptyAutorizado, emptyTransporteAutorizado,
  montarEndereco, inputCls, labelCls,
} from '../lib/matriculaFields';

const BUCKET = 'matriculas-docs';
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

function DocUploadButton({ label, doc, onUpload, onRemove, isUploading }) {
  const inputId = `doc-${label.replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={inputId}
        className={`flex-1 flex items-center gap-2 border border-dashed rounded-zela-md px-3 py-2.5 text-xs font-bold cursor-pointer transition ${
          doc ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-slate-300 hover:border-indigo-400 text-on-surface-variant hover:text-primary'
        } ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {isUploading ? <Loader2 size={14} className="animate-spin shrink-0" /> : doc ? <Check size={14} className="shrink-0" /> : <Upload size={14} className="shrink-0" />}
        <span className="truncate">{doc ? `${label} anexado` : `Importar ${label}`}</span>
        <input id={inputId} type="file" accept={ALLOWED_TYPES.join(',')} onChange={onUpload} className="hidden" disabled={isUploading} />
      </label>
      {doc && (
        <button type="button" onClick={onRemove} className="p-2 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// Seção retrátil (acordeão) — mesmo padrão de Editar Cadastro
// (AdminUserRegistration.jsx > toggleSection) e do formulário de Matrícula
// nova (PublicMatricula.jsx), reaproveitado aqui pra unificar os dois.
function AccordionSection({ id, title, icon, openId, onToggle, children }) {
  const isOpen = openId === id;
  return (
    <div className="border border-outline-variant rounded-zela-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3.5 bg-surface-container-low hover:bg-surface-container transition text-left"
      >
        <h4 className="font-bold text-on-surface text-sm flex items-center gap-2">{icon} {title}</h4>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180 text-primary' : 'text-on-surface-variant/50'}`} />
      </button>
      {isOpen && (
        <div className="p-4 sm:p-5 space-y-3 animate-in fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

function CicloPills({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {CICLOS.map(h => (
        <button
          key={h}
          type="button"
          onClick={() => onChange(String(h))}
          className={`flex-1 text-center py-2.5 px-2 rounded-zela-md text-xs font-bold border-2 transition-all ${
            String(value) === String(h) ? 'bg-primary text-white border-indigo-600' : 'bg-white text-on-surface-variant border-outline-variant hover:border-indigo-300'
          }`}
        >
          {h} horas
        </button>
      ))}
    </div>
  );
}

function RadioRow({ selected, onSelect, label }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-start gap-2.5 p-3 rounded-zela-md border-2 text-left transition-all ${
        selected ? 'border-primary bg-primary/5' : 'border-outline-variant bg-white hover:border-indigo-200'
      }`}
    >
      <span className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 ${selected ? 'border-primary bg-primary shadow-[inset_0_0_0_2.5px_#fff]' : 'border-outline-variant'}`} />
      <span className="text-sm text-on-surface">{label}</span>
    </button>
  );
}

export default function FamilyMatriculas({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // A opção de "Matrícula" (família nova) saiu daqui — agora só existe pelo
  // link público que o Admin distribui (PublicMatricula.jsx), porque quem já
  // tem login aqui dentro necessariamente já é família da escola. Only
  // 'rematricula' é usado neste componente; `tipo` fica gravado na
  // solicitação mesmo assim, pro Admin distinguir de que veio cada uma.
  const [step, setStep] = useState('list'); // 'list' | 'form'
  const [tipo] = useState('rematricula');
  const [isLoadingPrefill, setIsLoadingPrefill] = useState(false);
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
  const [autorizacaoImagem, setAutorizacaoImagem] = useState('');
  const [autorizacaoEmergencia, setAutorizacaoEmergencia] = useState('');

  // Só uma seção aberta por vez, e nenhuma aberta sozinha ao entrar na tela
  // (nem depois de atualizar a página ou sair e voltar) — mesmo padrão do
  // formulário de Matrícula.
  const [openSection, setOpenSection] = useState(null);
  const toggleSection = (id) => setOpenSection(prev => (prev === id ? null : id));

  const [uploadingKey, setUploadingKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const limits = { autorizados_por_responsavel: 2, autorizados_transporte: 1, ...currentSchool?.limits };
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
    setStep('list');
    setResponsavel(emptyResponsavel());
    setTemSegundo(false);
    setSegundoResponsavel(emptyResponsavel());
    setCriancas([emptyCrianca()]);
    setAutorizados([emptyAutorizado()]);
    setTemTransporte(false);
    setTransporteAutorizados([emptyTransporteAutorizado()]);
    setAutorizacaoImagem('');
    setAutorizacaoEmergencia('');
    setFormError('');
    setOpenSection(null);
  };

  // Rematrícula: pré-preenche com o que já existe de verdade no banco pra
  // essa família, tudo continua editável. Ficha Médica continua sendo
  // editada na tela própria também — aqui é só a "foto do momento" que vai
  // junto da solicitação de rematrícula.
  const fetchRematriculaData = async () => {
    setIsLoadingPrefill(true);
    try {
      const STUDENT_FIELDS = 'id, name, birth_date, turno, periodo, contracted_hours, cidade_nascimento, autorizacao_imagem, autorizacao_emergencia_medica';
      const [{ data: ownStudents }, { data: guardianLinks }, { data: existingAuthorized }, { data: ownUser }] = await Promise.all([
        supabase.from('students').select(STUDENT_FIELDS).eq('family_id', currentUser.id),
        supabase.from('student_guardians').select('student_id, guardian_id').eq('guardian_id', currentUser.id),
        supabase.from('authorized_persons').select('name, relation').eq('family_id', currentUser.id).eq('school_id', schoolId),
        // Busca fresca do próprio responsável -- currentUser (sessão já
        // carregada) não tem CPF/RG/endereço/documentos, só nome/email/telefone.
        supabase.from('users').select('doc_number, street, number, complement, neighborhood, city, state, zip_code, profession, civil_status, documents').eq('id', currentUser.id).single(),
      ]);

      const guardianStudentIds = (guardianLinks || []).map(g => g.student_id);
      let linkedStudents = [];
      if (guardianStudentIds.length > 0) {
        const { data } = await supabase.from('students').select(STUDENT_FIELDS).in('id', guardianStudentIds);
        linkedStudents = data || [];
      }
      // Achado real de teste: o titular às vezes também aparece vinculado ao
      // próprio filho em student_guardians (efeito colateral do fluxo "Novo
      // Usuário" — ver commit e27b5d6), o que duplicava a mesma criança nas
      // duas listas. Deduplica por id.
      const byId = new Map();
      [...(ownStudents || []), ...linkedStudents].forEach(s => byId.set(s.id, s));
      const allStudents = [...byId.values()];

      const documents = ownUser?.documents || {};
      setResponsavel(prev => ({
        ...prev,
        nome: currentUser.name || '',
        email: currentUser.email || '',
        telefone: currentUser.phone || '',
        cpf: ownUser?.doc_number || '',
        rg_expedicao: documents.rg_expedicao || '',
        rg_orgao: documents.rg_orgao || '',
        profissao: ownUser?.profession || '',
        estado_civil: ownUser?.civil_status || '',
      }));

      if (allStudents.length > 0) {
        setCriancas(allStudents.map(s => ({
          ...emptyCrianca(),
          id: s.id,
          nome: s.name || '',
          nascimento: s.birth_date || '',
          cidade_nascimento: s.cidade_nascimento || '',
          ciclo: s.contracted_hours ? String(s.contracted_hours) : '',
          periodo: s.periodo || '',
          turno: s.turno || '',
          // Endereço vive no cadastro do responsável (users), mas o
          // formulário coleta por criança -- replica o mesmo endereço da
          // família em cada filho, como o resto do formulário já espera.
          cep: ownUser?.zip_code || '',
          rua: ownUser?.street || '',
          numero: ownUser?.number || '',
          complemento: ownUser?.complement || '',
          bairro: ownUser?.neighborhood || '',
          cidade: ownUser?.city || '',
          uf: ownUser?.state || '',
        })));
      }

      // Autorização de imagem/emergência é por família (não por filho) --
      // usa o que já está gravado no primeiro filho que tiver essa resposta.
      const comAutorizacao = allStudents.find(s => s.autorizacao_imagem !== null && s.autorizacao_imagem !== undefined);
      if (comAutorizacao) setAutorizacaoImagem(comAutorizacao.autorizacao_imagem ? 'sim' : 'nao');
      const comEmergencia = allStudents.find(s => s.autorizacao_emergencia_medica !== null && s.autorizacao_emergencia_medica !== undefined);
      if (comEmergencia) setAutorizacaoEmergencia(comEmergencia.autorizacao_emergencia_medica ? 'sim' : 'nao');

      // 2º responsável -- vínculo não financeiro já existente pra algum dos
      // filhos dessa família. RLS de `users` só deixa a família ler a própria
      // linha, então buscar o 2º responsável direto pelo client sempre volta
      // vazio em silêncio -- por isso é uma RPC (SECURITY DEFINER), que
      // valida que quem chama é mesmo responsável de algum desses alunos
      // antes de devolver o outro responsável.
      const studentIdsParaSegundo = allStudents.map(s => s.id);
      if (studentIdsParaSegundo.length > 0) {
        const { data: segundoRows } = await supabase.rpc('get_segundo_responsavel', { p_student_ids: studentIdsParaSegundo });
        const segundoUser = segundoRows?.[0];
        if (segundoUser) {
          const segDocs = segundoUser.documents || {};
          setTemSegundo(true);
          setSegundoResponsavel({
            ...emptyResponsavel(),
            nome: segundoUser.name || '',
            email: segundoUser.email || '',
            telefone: segundoUser.phone || '',
            cpf: segundoUser.doc_number || '',
            rg_expedicao: segDocs.rg_expedicao || '',
            rg_orgao: segDocs.rg_orgao || '',
            profissao: segundoUser.profession || '',
            estado_civil: segundoUser.civil_status || '',
          });
        }
      }

      // A entrada "(Titular)" em authorized_persons representa o próprio
      // responsável (ver AdminUserRegistration.jsx), não um autorizado real.
      const autorizadosReais = (existingAuthorized || []).filter(a => !a.relation?.includes('(Titular)'));
      if (autorizadosReais.length > 0) {
        setAutorizados(autorizadosReais.map(a => ({ id: Date.now() + Math.random(), nome: a.name || '', telefone: '', parentesco: '' })));
      }
    } catch (err) {
      console.error('[FamilyMatriculas] Erro ao pré-carregar dados de rematrícula:', err);
    } finally {
      setIsLoadingPrefill(false);
    }
  };

  const chooseTipo = async () => {
    setStep('form');
    await fetchRematriculaData();
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
      const compressed = await compressImage(file);
      const path = `${schoolId}/${currentUser.id}/${requestId}/${docKey}-${buildSafeFileName(compressed)}`;
      await uploadFile(BUCKET, path, compressed);
      setResponsavel(prev => ({ ...prev, [docKey]: { path, name: file.name } }));
    } catch (err) {
      console.error('[FamilyMatriculas] Erro ao subir documento:', err);
      setFormError('Não foi possível enviar esse documento.');
    } finally {
      setUploadingKey(null);
    }
  };

  const uploadCriancaDoc = async (criancaId, docField, file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFormError(`Tipo de arquivo não permitido: ${file.name}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFormError(`Arquivo muito grande (máx. 15MB): ${file.name}`);
      return;
    }
    const uploadKey = `crianca-${criancaId}-${docField}`;
    setUploadingKey(uploadKey);
    setFormError('');
    try {
      const compressed = await compressImage(file);
      const path = `${schoolId}/${currentUser.id}/${requestId}/${docField}-${criancaId}-${buildSafeFileName(compressed)}`;
      await uploadFile(BUCKET, path, compressed);
      setCriancas(prev => prev.map(c => (c.id === criancaId ? { ...c, [docField]: { path, name: file.name } } : c)));
    } catch (err) {
      console.error('[FamilyMatriculas] Erro ao subir documento da criança:', err);
      setFormError('Não foi possível enviar esse documento.');
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
      // Normaliza nomes (Título) no envio — independente de como a família
      // digitou (CAIXA ALTA, minúsculo, misturado).
      const payload = {
        id: requestId,
        school_id: schoolId,
        family_id: currentUser.id,
        status: 'pending',
        tipo,
        responsavel_financeiro: {
          ...responsavel,
          nome: formatPersonName(responsavel.nome),
          autorizacao_imagem: autorizacaoImagem,
          autorizacao_emergencia: autorizacaoEmergencia,
        },
        segundo_responsavel: temSegundo ? { ...segundoResponsavel, nome: formatPersonName(segundoResponsavel.nome) } : null,
        criancas: criancas.filter(c => c.nome.trim()).map(({ id: _id, cep, rua, numero, complemento, bairro, cidade, uf, ...rest }) => ({
          ...rest,
          nome: formatPersonName(rest.nome),
          endereco: montarEndereco({ cep, rua, numero, complemento, bairro, cidade, uf }),
        })),
        autorizados: autorizados.filter(a => a.nome.trim()).map(({ id: _id, ...rest }) => ({ ...rest, nome: formatPersonName(rest.nome) })),
        transporte_autorizados: temTransporte ? transporteAutorizados.filter(t => t.nome.trim()).map(t => ({ nome: formatPersonName(t.nome) })) : [],
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
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 rounded-none sm:rounded-zela-xl border-0 sm:border sm:border-outline-variant md:rounded-none md:shadow-none md:border-0 shadow-none sm:shadow-sm overflow-hidden">
      {/* Título "Matrículas" e ícone removidos (o Header do app já mostra o
          nome da tela dinamicamente); só a descrição, direto. */}
      <div className="flex items-center justify-between p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <p className="text-on-surface-variant text-small hidden sm:block">Preencha e acompanhe as matrículas dos seus filhos.</p>
        {step === 'list' && (
          <button
            onClick={() => chooseTipo()}
            className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm ml-auto"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Nova Solicitação</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {step === 'form' ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface">Nova solicitação de Rematrícula</h3>
              <button type="button" onClick={resetForm} className="p-1.5 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-lg transition">
                <X size={20} />
              </button>
            </div>

            {isLoadingPrefill && (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant bg-surface-container-low p-3 rounded-zela-md">
                <Loader2 size={16} className="animate-spin" /> Carregando seus dados já cadastrados...
              </div>
            )}

            {formError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{formError}</div>
            )}

            {/* 1. DADOS DA CRIANÇA */}
            <AccordionSection id="criancas" title="1. Dados da Criança" icon={<Baby size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              {criancas.map((c, idx) => {
                const periodoOptions = PERIODOS_POR_CICLO[Number(c.ciclo)] || [];
                return (
                  <div key={c.id} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-primary uppercase tracking-wider">Criança {idx + 1}</span>
                      {criancas.length > 1 && (
                        <button type="button" onClick={() => removeCrianca(c.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Nome completo *</label>
                      <input className={inputCls} value={c.nome} onChange={e => updateCrianca(c.id, { nome: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Cidade de Nascimento *</label>
                        <input className={inputCls} value={c.cidade_nascimento} onChange={e => updateCrianca(c.id, { cidade_nascimento: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Data de Nascimento *</label>
                        <input type="date" className={inputCls} value={c.nascimento} onChange={e => updateCrianca(c.id, { nascimento: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Ciclo *</label>
                      <CicloPills value={c.ciclo} onChange={(v) => updateCrianca(c.id, { ciclo: v })} />
                    </div>
                    <div>
                      <label className={labelCls}>Período *</label>
                      <select className={inputCls} value={c.periodo} onChange={e => updateCrianca(c.id, { periodo: e.target.value })} disabled={!c.ciclo}>
                        <option value="">{c.ciclo ? 'Selecionar...' : '← Primeiro o Ciclo'}</option>
                        {periodoOptions.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={addCrianca} className="flex items-center gap-2 text-primary hover:text-primary font-bold text-sm px-3 py-2">
                <Plus size={16} /> Adicionar Criança
              </button>
            </AccordionSection>

            {/* 2. ENDEREÇO */}
            <AccordionSection id="endereco" title="2. Endereço" icon={<MapPin size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              <p className="text-[11px] text-on-surface-variant/70 -mt-1">Endereço onde a criança reside.</p>
              {criancas.map((c, idx) => (
                <div key={c.id} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
                  {criancas.length > 1 && <span className="text-xs font-black text-primary uppercase tracking-wider">{c.nome.trim() || `Criança ${idx + 1}`}</span>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>CEP *</label>
                      <input className={inputCls} placeholder="Somente números" value={c.cep} onChange={e => updateCrianca(c.id, { cep: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Rua / Logradouro *</label>
                      <input className={inputCls} value={c.rua} onChange={e => updateCrianca(c.id, { rua: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Número *</label>
                      <input className={inputCls} value={c.numero} onChange={e => updateCrianca(c.id, { numero: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Complemento</label>
                      <input className={inputCls} placeholder="Apto, Bloco, etc." value={c.complemento} onChange={e => updateCrianca(c.id, { complemento: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Bairro *</label>
                      <input className={inputCls} value={c.bairro} onChange={e => updateCrianca(c.id, { bairro: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <div>
                        <label className={labelCls}>Cidade *</label>
                        <input className={inputCls} value={c.cidade} onChange={e => updateCrianca(c.id, { cidade: e.target.value })} />
                      </div>
                      <div className="w-20">
                        <label className={labelCls}>UF *</label>
                        <input className={inputCls} maxLength={2} placeholder="ES" value={c.uf} onChange={e => updateCrianca(c.id, { uf: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </AccordionSection>

            {/* 3. RESPONSÁVEL FINANCEIRO */}
            <AccordionSection id="responsavel" title="3. Responsável Financeiro" icon={<User size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              <p className="text-[11px] text-on-surface-variant/70 -mt-1">É em nome desta pessoa que sai a nota fiscal, para posterior declaração do Imposto de Renda.</p>
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
                  <input className={inputCls} placeholder="Somente números" value={responsavel.cpf} onChange={e => setResponsavel(p => ({ ...p, cpf: e.target.value }))} required />
                </div>
                <div>
                  <label className={labelCls}>RG *</label>
                  <input className={inputCls} value={responsavel.rg} onChange={e => setResponsavel(p => ({ ...p, rg: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Data de Expedição *</label>
                  <input type="date" className={inputCls} value={responsavel.rg_expedicao} onChange={e => setResponsavel(p => ({ ...p, rg_expedicao: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Órgão Expedidor *</label>
                  <input className={inputCls} placeholder="Ex: SSP ES" value={responsavel.rg_orgao} onChange={e => setResponsavel(p => ({ ...p, rg_orgao: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Profissão *</label>
                  <input className={inputCls} value={responsavel.profissao} onChange={e => setResponsavel(p => ({ ...p, profissao: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Estado Civil *</label>
                  <select className={inputCls} value={responsavel.estado_civil} onChange={e => setResponsavel(p => ({ ...p, estado_civil: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {ESTADO_CIVIL.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <label className={labelCls}>Documentos do Responsável Financeiro</label>
                {RESPONSAVEL_DOC_FIELDS.map(({ key, label }) => (
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
            </AccordionSection>

            {/* 4. SEGUNDO RESPONSÁVEL */}
            <AccordionSection id="segundo" title="4. Segundo Responsável" icon={<User size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={temSegundo} onChange={e => setTemSegundo(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                <span className="font-bold text-on-surface text-sm">Esta matrícula tem um segundo responsável</span>
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
                    <label className={labelCls}>Profissão</label>
                    <input className={inputCls} value={segundoResponsavel.profissao} onChange={e => setSegundoResponsavel(p => ({ ...p, profissao: e.target.value }))} />
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
                    <input className={inputCls} placeholder="Ex: SSP ES" value={segundoResponsavel.rg_orgao} onChange={e => setSegundoResponsavel(p => ({ ...p, rg_orgao: e.target.value }))} />
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
            </AccordionSection>

            {/* 5. AUTORIZADOS E CONTATO DE EMERGÊNCIA */}
            <AccordionSection id="autorizados" title="5. Autorizados e Contato de Emergência" icon={<UserCheck size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              <div className="flex items-center justify-between -mt-1">
                <p className="text-[11px] text-on-surface-variant/70">Quem mais pode buscar a criança. Também é quem entramos em contato em caso de emergência.</p>
                <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase shrink-0 ml-2">{autorizados.length}/{maxAutorizados}</span>
              </div>
              <div className="space-y-3">
                {autorizados.map((a) => (
                  <div key={a.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end bg-white border border-outline-variant rounded-zela-md p-3">
                    <div>
                      <label className={labelCls}>Nome completo *</label>
                      <input className={inputCls} value={a.nome} onChange={e => updateAutorizado(a.id, { nome: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Telefone *</label>
                      <input className={inputCls} value={a.telefone} onChange={e => updateAutorizado(a.id, { telefone: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className={labelCls}>Parentesco *</label>
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
                  <button type="button" onClick={addAutorizado} className="flex items-center gap-1.5 text-primary hover:text-primary font-bold text-xs px-2 py-1">
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
                <span className="font-bold text-on-surface text-sm flex items-center gap-2"><Car size={15} className="text-primary" /> Outros autorizados pelo transporte?</span>
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
                    <button type="button" onClick={addTransporteAutorizado} className="flex items-center gap-1.5 text-primary hover:text-primary font-bold text-xs px-2 py-1">
                      <Plus size={14} /> Adicionar outro
                    </button>
                  )}
                </div>
              )}
            </AccordionSection>

            {/* 6. AUTORIZAÇÃO DE IMAGEM */}
            <AccordionSection id="imagem" title="6. Autorização de Imagem" icon={<ImageIcon size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              <div className="space-y-2">
                <RadioRow
                  selected={autorizacaoImagem === 'nao'}
                  onSelect={() => setAutorizacaoImagem('nao')}
                  label="Não autorizo o uso da imagem do meu filho(a)"
                />
                <RadioRow
                  selected={autorizacaoImagem === 'sim'}
                  onSelect={() => setAutorizacaoImagem('sim')}
                  label="Autorizo o(a) aluno(a) a ser fotografado e suas imagens publicadas no site e nas redes sociais da escola"
                />
              </div>

              <h5 className="flex items-center gap-1.5 text-xs font-bold text-on-surface uppercase tracking-wide pt-3">
                <HeartPulse size={13} className="text-primary" /> Emergência Médica
              </h5>
              <p className="text-[11px] text-on-surface-variant/70">Em caso de acidente considerado grave.</p>
              <div className="space-y-2">
                <RadioRow
                  selected={autorizacaoEmergencia === 'sim'}
                  onSelect={() => setAutorizacaoEmergencia('sim')}
                  label="Autorizo encaminhar o(a) aluno(a) ao hospital ou pronto-socorro mais próximo"
                />
                <RadioRow
                  selected={autorizacaoEmergencia === 'nao'}
                  onSelect={() => setAutorizacaoEmergencia('nao')}
                  label="Não autorizo"
                />
              </div>
            </AccordionSection>

            {/* 7. SAÚDE E ALIMENTAÇÃO */}
            <AccordionSection id="saude" title="7. Saúde e Alimentação" icon={<HeartPulse size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              {criancas.map((c, idx) => (
                <div key={c.id} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
                  {criancas.length > 1 && <span className="text-xs font-black text-primary uppercase tracking-wider">{c.nome.trim() || `Criança ${idx + 1}`}</span>}
                  <div>
                    <label className={labelCls}>Possui restrição ou alergia alimentar? Quais? *</label>
                    <textarea className={`${inputCls} h-16 resize-none`} placeholder="Descreva ou 'Não possui'" value={c.restricao_alimentar} onChange={e => updateCrianca(c.id, { restricao_alimentar: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Alimentação Atual — como se alimenta, o que costuma comer *</label>
                    <textarea className={`${inputCls} h-16 resize-none`} placeholder="Descreva a rotina alimentar da criança" value={c.alimentacao_atual} onChange={e => updateCrianca(c.id, { alimentacao_atual: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Possui restrição de saúde? *</label>
                    <textarea className={`${inputCls} h-16 resize-none`} placeholder="Descreva ou 'Não possui'" value={c.restricao_saude} onChange={e => updateCrianca(c.id, { restricao_saude: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Já consultou algum especialista? *</label>
                    <textarea className={`${inputCls} h-16 resize-none`} placeholder="Qual especialista e motivo" value={c.especialista} onChange={e => updateCrianca(c.id, { especialista: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Faz algum tratamento? *</label>
                    <textarea className={`${inputCls} h-16 resize-none`} placeholder="Descreva ou 'Não faz'" value={c.tratamento} onChange={e => updateCrianca(c.id, { tratamento: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Possui alguma alergia? Qual? Precisa de medicamento? *</label>
                    <textarea className={`${inputCls} h-16 resize-none`} placeholder="Descreva a alergia e o medicamento, se houver" value={c.alergia} onChange={e => updateCrianca(c.id, { alergia: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>A criança possui algum hábito importante? *</label>
                    <textarea className={`${inputCls} h-16 resize-none`} placeholder="Ex: usa chupeta, tem objeto de apego..." value={c.habito_importante} onChange={e => updateCrianca(c.id, { habito_importante: e.target.value })} />
                  </div>
                </div>
              ))}
            </AccordionSection>

            {/* 8. DOCUMENTOS DA CRIANÇA */}
            <AccordionSection id="documentos" title="8. Documentos da Criança" icon={<FileText size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
              <div className="space-y-2">
                {criancas.map((c, idx) => (
                  <React.Fragment key={c.id}>
                    {CRIANCA_DOC_FIELDS.map(({ key, label }) => (
                      <DocUploadButton
                        key={key}
                        label={criancas.length > 1 ? `${label} · ${c.nome.trim() || `Filho(a) ${idx + 1}`}` : label}
                        doc={c[key]}
                        isUploading={uploadingKey === `crianca-${c.id}-${key}`}
                        onUpload={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCriancaDoc(c.id, key, f); }}
                        onRemove={() => updateCrianca(c.id, { [key]: null })}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </AccordionSection>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-3 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Enviar Solicitação
            </button>
          </form>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : solicitacoes.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant/70">
                <FileText className="mx-auto h-12 w-12 text-outline-variant mb-3" />
                <p className="text-sm font-semibold text-on-surface-variant">Nenhuma solicitação enviada ainda.</p>
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
    <div className="bg-white border border-outline-variant rounded-zela-lg overflow-hidden">
      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between p-4 text-left">
        <div className="min-w-0">
          <p className="font-bold text-on-surface text-sm truncate">
            {criancas.map(c => c.nome).join(', ') || 'Solicitação'}
          </p>
          <p className="text-on-surface-variant/70 text-xs mt-0.5">
            Enviado em {new Date(solicitacao.submitted_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg border ${status.cls}`}>
            <StatusIcon size={11} /> {status.label}
          </span>
          {expanded ? <ChevronUp size={18} className="text-on-surface-variant/70" /> : <ChevronDown size={18} className="text-on-surface-variant/70" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-outline-variant pt-3">
          {solicitacao.status === 'rejected' && solicitacao.rejection_reason && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-xs font-medium">
              Motivo: {solicitacao.rejection_reason}
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wide mb-1">Responsável Financeiro</p>
            <p className="text-sm text-on-surface">{solicitacao.responsavel_financeiro?.nome}</p>
          </div>
          {criancas.map((c, i) => (
            <div key={i}>
              <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wide mb-1">Criança {i + 1}</p>
              <p className="text-sm text-on-surface">{c.nome} · {c.ciclo}h/dia, {c.periodo} ({c.turno})</p>
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
