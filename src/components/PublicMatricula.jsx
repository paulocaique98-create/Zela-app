import React, { useState } from 'react';
import {
  ShieldCheck, Mail, Lock, Plus, Trash2, CheckCircle2, ArrowLeft,
  User, Baby, Car, UserCheck, MapPin, Upload, Check, X, Loader2, Camera, FileText, ChevronDown,
  ImageIcon, HeartPulse,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadFileWithSignedUrl, buildSafeFileName } from '../lib/storage';
import { compressImage } from '../lib/imageCompression';
import { navigateTo } from '../utils/navigate';
import { formatPersonName } from '../utils/formatName';
import {
  ESTADO_CIVIL, PARENTESCOS, CICLOS, PERIODOS_POR_CICLO,
  RESPONSAVEL_DOC_FIELDS, CRIANCA_DOC_FIELDS,
  emptyResponsavel, emptyCrianca, emptyAutorizado, emptyTransporteAutorizado,
  montarEndereco, inputCls, labelCls,
} from '../lib/matriculaFields';

// Tela pública de Matrícula — só é alcançada por um link que o Admin gera e
// distribui (ver AdminMatriculas.jsx), não é anunciada em lugar nenhum do
// login. Diferente do autocadastro simples (/cadastro), aqui a família ainda
// não tem vínculo nenhum com a escola: cria a conta do responsável (pendente,
// mesmo padrão do /cadastro) e uma solicitação em matricula_solicitacoes
// (tipo='matricula'), revisada pelo admin no mesmo fluxo que já existe pra
// Rematrícula (approve_matricula). Documentos usam a Edge Function
// public-matricula-doc-upload pra conseguir subir arquivo pro Storage antes
// de a conta do responsável existir (URL de upload assinada com service
// role, já que a RLS normal do bucket exige auth.uid()).
//
// Layout e ordem das seções seguem o protótipo aprovado (canvas "Protótipo —
// Formulário de Matrícula Zela"): Dados da Criança > Endereço > Responsável
// Financeiro > 2º Responsável > Autorizados e Contato de Emergência >
// Autorização de Imagem > Saúde e Alimentação > Documentos. Autorização de
// imagem e as perguntas de saúde são novas AQUI dentro da matrícula (antes só
// existiam em telas separadas, pós-login) -- guardadas como campos extras
// dentro dos mesmos jsonb (responsavel_financeiro/criancas) que a solicitação
// já usa, sem precisar de nenhuma coluna nova no banco.

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const DOC_BUCKET = 'matriculas-docs';

// Cada documento vira uma linha com DUAS ações explícitas — "Escolher
// arquivo" (galeria/arquivos do aparelho) e "Tirar foto" (abre a câmera
// direto, via capture="environment") — em vez de depender do picker nativo
// do navegador, que varia de comportamento entre aparelhos/SOs.
function DocUploadRow({ label, doc, onFile, onRemove, isUploading }) {
  const uid = Math.random().toString(36).slice(2, 8);
  const galleryId = `pub-doc-gallery-${uid}`;
  const cameraId = `pub-doc-camera-${uid}`;

  return (
    <div className="border border-outline-variant rounded-zela-md p-3 space-y-2 bg-white">
      <p className="text-xs font-bold text-on-surface">{label}</p>
      {doc ? (
        <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-zela-md px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-bold text-green-700 truncate">
            <Check size={14} className="shrink-0" /> <span className="truncate">{doc.name}</span>
          </span>
          <button type="button" onClick={onRemove} className="p-1 text-green-700/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0">
            <X size={15} />
          </button>
        </div>
      ) : isUploading ? (
        <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant px-3 py-2.5">
          <Loader2 size={14} className="animate-spin" /> Enviando...
        </div>
      ) : (
        <div className="flex gap-2">
          <label htmlFor={galleryId} className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-300 hover:border-indigo-400 text-on-surface-variant hover:text-primary rounded-zela-md px-2 py-2.5 text-[11px] font-bold cursor-pointer transition">
            <Upload size={13} /> Escolher arquivo
            <input id={galleryId} type="file" accept={ALLOWED_TYPES.join(',')} onChange={onFile} className="hidden" />
          </label>
          <label htmlFor={cameraId} className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-300 hover:border-indigo-400 text-on-surface-variant hover:text-primary rounded-zela-md px-2 py-2.5 text-[11px] font-bold cursor-pointer transition">
            <Camera size={13} /> Tirar foto
            <input id={cameraId} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
          </label>
        </div>
      )}
    </div>
  );
}

// Seção retrátil (acordeão) — mesmo padrão já usado em Editar Cadastro
// (AdminUserRegistration.jsx > toggleSection).
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

// Pílulas de ciclo (6h/8h/10h) — igual ao protótipo, no lugar do select.
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

// Radio simples de duas opções, usado na Autorização de Imagem/Emergência.
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

function getSchoolCodeFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('codigo') || '';
  } catch {
    return '';
  }
}

export default function PublicMatricula() {
  const codeFromUrl = getSchoolCodeFromUrl();
  const [schoolCode, setSchoolCode] = useState(codeFromUrl);
  // Quando o código já vem pelo link (o caso normal — o Admin distribui
  // /matricula-publica?codigo=XXXX), trava o campo pra evitar edição por
  // engano ou tentativa de adivinhar o código de outra escola. Só fica
  // editável se alguém abrir a página sem nenhum código na URL.
  const schoolCodeLocked = !!codeFromUrl;
  const [email, setEmail] = useState('');
  // Senha inicial padrão — a pessoa troca depois em Configurações, já
  // logada. Evita mais um campo pra preencher/errar num formulário já longo.
  const DEFAULT_PASSWORD = '123456';
  const [responsavel, setResponsavel] = useState(emptyResponsavel());
  const [temSegundo, setTemSegundo] = useState(false);
  const [segundoResponsavel, setSegundoResponsavel] = useState(emptyResponsavel());
  const [criancas, setCriancas] = useState([emptyCrianca()]);
  const [autorizados, setAutorizados] = useState([emptyAutorizado()]);
  const [temTransporte, setTemTransporte] = useState(false);
  const [transporteAutorizados, setTransporteAutorizados] = useState([emptyTransporteAutorizado()]);
  // Autorização de imagem e de emergência médica — do responsável, valem
  // pra todos os filhos dessa matrícula. '' = ainda não respondido.
  const [autorizacaoImagem, setAutorizacaoImagem] = useState('');
  const [autorizacaoEmergencia, setAutorizacaoEmergencia] = useState('');

  // Só uma seção aberta por vez, igual ao mesmo padrão de Editar Cadastro —
  // todas fechadas ao entrar (e continuam fechadas mesmo depois de
  // atualizar a página).
  const [openSection, setOpenSection] = useState(null);
  const toggleSection = (id) => setOpenSection(prev => (prev === id ? null : id));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);

  // Identifica esta sessão de preenchimento no Storage (path
  // {school_id}/pending-matricula/{requestToken}/...) antes de existir
  // qualquer family_id — estável durante toda a visita à página.
  const [requestToken] = useState(() => crypto.randomUUID());
  const [uploadingKey, setUploadingKey] = useState(null);

  const uploadDoc = async (docKey, file) => {
    if (!schoolCode.trim()) {
      setFormError('Informe o código da escola antes de anexar documentos.');
      return null;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFormError(`Tipo de arquivo não permitido: ${file.name}`);
      return null;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFormError(`Arquivo muito grande (máx. 15MB): ${file.name}`);
      return null;
    }
    setUploadingKey(docKey);
    setFormError('');
    try {
      const compressed = await compressImage(file);
      const { data, error } = await supabase.functions.invoke('public-matricula-doc-upload', {
        body: { school_code: schoolCode.trim(), request_token: requestToken, doc_key: docKey, file_name: buildSafeFileName(compressed) },
      });
      if (error || !data || data.error) {
        throw new Error(data?.error || error?.message || 'Erro ao preparar o envio do documento.');
      }
      await uploadFileWithSignedUrl(DOC_BUCKET, data.path, data.token, compressed);
      return { path: data.path, name: file.name };
    } catch (err) {
      console.error('[PublicMatricula] Erro ao subir documento:', err);
      setFormError('Não foi possível enviar esse documento.');
      return null;
    } finally {
      setUploadingKey(null);
    }
  };

  const uploadResponsavelDoc = async (docKey, file) => {
    const doc = await uploadDoc(docKey, file);
    if (doc) setResponsavel(p => ({ ...p, [docKey]: doc }));
  };

  const uploadCriancaDoc = async (criancaId, docField, file) => {
    const doc = await uploadDoc(`crianca-${criancaId}-${docField}`, file);
    if (doc) setCriancas(prev => prev.map(c => (c.id === criancaId ? { ...c, [docField]: doc } : c)));
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

  const addAutorizado = () => setAutorizados(prev => [...prev, emptyAutorizado()]);
  const removeAutorizado = (id) => setAutorizados(prev => prev.filter(a => a.id !== id));
  const updateAutorizado = (id, patch) => setAutorizados(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const addTransporteAutorizado = () => setTransporteAutorizados(prev => [...prev, emptyTransporteAutorizado()]);
  const removeTransporteAutorizado = (id) => setTransporteAutorizados(prev => prev.filter(t => t.id !== id));
  const updateTransporteAutorizado = (id, nome) => setTransporteAutorizados(prev => prev.map(t => (t.id === id ? { ...t, nome } : t)));

  const validate = () => {
    if (!schoolCode.trim()) return 'Informe o código da escola.';
    if (!email.trim()) return 'Informe um e-mail.';
    if (!responsavel.nome.trim() || !responsavel.telefone.trim()) return 'Preencha ao menos nome e telefone do responsável financeiro.';
    const validCriancas = criancas.filter(c => c.nome.trim());
    if (validCriancas.length === 0) return 'Adicione ao menos uma criança.';
    for (const c of validCriancas) {
      if (!c.nascimento || !c.ciclo || !c.periodo) return `Complete os dados de ${c.nome} (data de nascimento, ciclo e período).`;
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
      const { data, error } = await supabase.functions.invoke('public-matricula-request', {
        body: {
          school_code: schoolCode.trim(),
          email: email.trim().toLowerCase(),
          password: DEFAULT_PASSWORD,
          responsavel: {
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
        },
      });

      if (error || !data || data.error) {
        let serverMsg = data?.error;
        if (!serverMsg && error?.context && typeof error.context.json === 'function') {
          try {
            const body = await error.context.json();
            serverMsg = body?.error;
          } catch {
            // corpo não era JSON — segue com a mensagem genérica abaixo
          }
        }
        throw new Error(serverMsg || error?.message || 'Erro ao enviar a matrícula.');
      }

      setDone(true);
    } catch (err2) {
      setFormError(err2.message || 'Não foi possível enviar a matrícula. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-surface-container-lowest">
      {/* Cabeçalho — mesmo estilo do protótipo aprovado (faixa em gradiente
          na cor da marca, símbolo + nome do Zela, boas-vindas da escola). */}
      <div className="bg-gradient-to-br from-primary to-primary-container px-5 sm:px-8 py-8 sm:py-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-white/15 rounded-zela-lg flex items-center justify-center shrink-0">
              <ShieldCheck className="text-white" size={18} />
            </div>
            <span className="text-lg font-extrabold text-white tracking-tight">Zela</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1.5 tracking-tight">Requerimento de Matrícula</h1>
          <p className="text-sm text-white/85 leading-relaxed max-w-xl">
            Obrigada por escolher educar para a paz. Preencha os dados abaixo com atenção — todos os campos marcados são obrigatórios.
          </p>
        </div>
      </div>

      <div className="w-full flex justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl flex flex-col -mt-4 sm:-mt-6">

          {done ? (
            <div className="bg-white border border-outline-variant rounded-zela-lg p-8 text-center flex flex-col items-center gap-4 shadow-sm">
              <CheckCircle2 className="text-emerald-500" size={48} />
              <div>
                <h1 className="text-h2 text-on-surface mb-2">Matrícula enviada!</h1>
                <p className="text-body text-on-surface-variant">
                  Sua solicitação foi recebida e está aguardando aprovação da escola.
                  Você poderá acessar o Zela assim que a matrícula for aprovada, usando o e-mail informado e a senha <strong>123456</strong> (você pode trocá-la depois em Configurações).
                </p>
              </div>
              <button type="button" onClick={() => navigateTo('/')} className="mt-2 text-small text-primary font-medium hover:underline underline-offset-4">
                Voltar para o login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex justify-end">
                <button type="button" onClick={() => navigateTo('/')} className="flex items-center gap-1 text-small text-on-surface-variant hover:text-primary shrink-0">
                  <ArrowLeft size={16} /> Voltar
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {formError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{formError}</div>
                )}

                <section className="bg-white border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3 shadow-sm">
                  <h4 className="font-bold text-on-surface text-sm">Código da Escola</h4>
                  <div>
                    <label className={labelCls}>Código da Escola *</label>
                    <input
                      className={`${inputCls} ${schoolCodeLocked ? 'bg-surface-container text-on-surface-variant cursor-not-allowed' : ''}`}
                      value={schoolCode}
                      onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                      placeholder="Código fornecido pela escola"
                      readOnly={schoolCodeLocked}
                      required
                    />
                  </div>
                  <p className="text-[11px] text-on-surface-variant/70 flex items-center gap-1.5">
                    <Lock size={12} className="shrink-0" /> Sua senha inicial de acesso será <strong>123456</strong>. Você pode alterá-la depois em Configurações, assim que sua matrícula for aprovada.
                  </p>
                </section>

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
                    <div>
                      <label className={labelCls}>Nome Completo *</label>
                      <input className={inputCls} value={responsavel.nome} onChange={e => setResponsavel(p => ({ ...p, nome: e.target.value }))} required />
                    </div>
                    <div>
                      <label className={labelCls}>E-mail *</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={16} />
                        <input type="email" className={`${inputCls} pl-9`} value={email} onChange={e => setEmail(e.target.value)} required />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Telefone 1 *</label>
                      <input className={inputCls} value={responsavel.telefone} onChange={e => setResponsavel(p => ({ ...p, telefone: e.target.value }))} required />
                    </div>
                    <div>
                      <label className={labelCls}>Telefone 2</label>
                      <input className={inputCls} value={responsavel.telefone2} onChange={e => setResponsavel(p => ({ ...p, telefone2: e.target.value }))} />
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
                    <div>
                      <label className={labelCls}>CPF *</label>
                      <input className={inputCls} placeholder="Somente números" value={responsavel.cpf} onChange={e => setResponsavel(p => ({ ...p, cpf: e.target.value }))} />
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
                  </div>

                  <div className="pt-2 space-y-2">
                    <label className={labelCls}>Documentos do Responsável Financeiro</label>
                    {RESPONSAVEL_DOC_FIELDS.map(({ key, label }) => (
                      <DocUploadRow
                        key={key}
                        label={label}
                        doc={responsavel[key]}
                        isUploading={uploadingKey === key}
                        onFile={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadResponsavelDoc(key, f); }}
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
                        <label className={labelCls}>Nome completo</label>
                        <input className={inputCls} value={segundoResponsavel.nome} onChange={e => setSegundoResponsavel(p => ({ ...p, nome: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>E-mail *</label>
                        <input type="email" className={inputCls} value={segundoResponsavel.email} onChange={e => setSegundoResponsavel(p => ({ ...p, email: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Telefone 1</label>
                        <input className={inputCls} value={segundoResponsavel.telefone} onChange={e => setSegundoResponsavel(p => ({ ...p, telefone: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Telefone 2</label>
                        <input className={inputCls} value={segundoResponsavel.telefone2} onChange={e => setSegundoResponsavel(p => ({ ...p, telefone2: e.target.value }))} />
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
                  <p className="text-[11px] text-on-surface-variant/70 -mt-1">Quem mais pode buscar a criança. Também é quem entramos em contato em caso de emergência, quando não conseguirmos falar com os responsáveis.</p>
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
                    <button type="button" onClick={addAutorizado} className="flex items-center gap-1.5 text-primary hover:text-primary font-bold text-xs px-2 py-1">
                      <Plus size={14} /> Adicionar autorizado
                    </button>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input type="checkbox" checked={temTransporte} onChange={e => setTemTransporte(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                    <span className="font-bold text-on-surface text-sm flex items-center gap-2"><Car size={15} className="text-primary" /> Outros autorizados pelo transporte?</span>
                  </label>
                  {temTransporte && (
                    <div className="space-y-2 pt-1">
                      {transporteAutorizados.map((t, idx) => (
                        <div key={t.id} className="flex items-center gap-2">
                          <input className={inputCls} placeholder={`Nome do autorizado ${idx + 1}`} value={t.nome} onChange={e => updateTransporteAutorizado(t.id, e.target.value)} />
                          {transporteAutorizados.length > 1 && (
                            <button type="button" onClick={() => removeTransporteAutorizado(t.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={addTransporteAutorizado} className="flex items-center gap-1.5 text-primary hover:text-primary font-bold text-xs px-2 py-1">
                        <Plus size={14} /> Adicionar outro
                      </button>
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

                {/* 8. DOCUMENTOS — só os da criança aqui (certidão e cartão de
                    vacina); os do responsável já ficam dentro da seção dele. */}
                <AccordionSection id="documentos" title="8. Documentos da Criança" icon={<FileText size={16} className="text-primary" />} openId={openSection} onToggle={toggleSection}>
                  <div className="space-y-2">
                    {criancas.map((c, idx) => (
                      <React.Fragment key={c.id}>
                        {CRIANCA_DOC_FIELDS.map(({ key, label }) => (
                          <DocUploadRow
                            key={key}
                            label={criancas.length > 1 ? `${label} · ${c.nome.trim() || `Filho(a) ${idx + 1}`}` : label}
                            doc={c[key]}
                            isUploading={uploadingKey === `crianca-${c.id}-${key}`}
                            onFile={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCriancaDoc(c.id, key, f); }}
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
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-3.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm mt-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {isSubmitting ? 'Enviando...' : 'Enviar Matrícula'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
