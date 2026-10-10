import React, { useState, useEffect, useRef } from 'react';
import CamposEnderecoEscola, { enderecoDaEscola } from './CamposEnderecoEscola';
import { Save, Upload, AlertCircle, Building2, Trash2, School, Plus, Minus, X, Loader2, Pencil, Image as ImageIcon, Clock, CalendarX, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import { mergeBillingConfig, mergeAbsenceAlertConfig } from '../utils/attendanceUtils';
import { formatarCnpj, formatarCpf, cnpjValido, cpfValido, somenteDigitos } from '../lib/documentos';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB, pós-compressão

// Gestão de turmas pela própria escola (admin principal) -- antes disso, só
// o developer podia adicionar/remover uma turma (schools.turmas), deixando
// a escola dependente de suporte manual pra algo tão básico quanto abrir
// uma turma nova. A RPC update_school_turmas valida uso antes de permitir
// remover: bloqueia se a turma ainda estiver associada a algum aluno,
// professor, mural, comunicado, matéria ou frequência.
export function TurmasSection({ currentUser, currentSchool, onUpdate, noBorder = false }) {
  const [turmas, setTurmas] = useState(currentSchool?.turmas || []);
  const [newTurma, setNewTurma] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [removingTurma, setRemovingTurma] = useState(null);
  const [error, setError] = useState('');
  const [editingTurma, setEditingTurma] = useState(null); // nome original sendo editado
  const [editValue, setEditValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');

  useEffect(() => {
    setTurmas(currentSchool?.turmas || []);
  }, [currentSchool?.turmas]);

  const canManage = ['developer', 'gestao', 'gestao_pedagogica'].includes(currentUser?.role);

  const saveTurmas = async (nextTurmas) => {
    setError('');
    const { data, error: rpcError } = await supabase.rpc('update_school_turmas', { p_turmas: nextTurmas });
    if (rpcError) {
      setError(rpcError.message);
      return false;
    }
    setTurmas(data.turmas);
    if (onUpdate) onUpdate();
    return true;
  };

  const handleAddTurma = async () => {
    const trimmed = newTurma.trim();
    if (!trimmed) return;
    if (turmas.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setError('Essa turma já existe.');
      return;
    }
    setIsSaving(true);
    const ok = await saveTurmas([...turmas, trimmed]);
    setIsSaving(false);
    if (ok) setNewTurma('');
  };

  const handleRemoveTurma = async (turma) => {
    setRemovingTurma(turma);
    await saveTurmas(turmas.filter(t => t !== turma));
    setRemovingTurma(null);
  };

  const openRenameModal = (turma) => {
    setEditingTurma(turma);
    setEditValue(turma);
    setRenameError('');
  };

  const closeRenameModal = () => {
    setEditingTurma(null);
    setEditValue('');
    setRenameError('');
  };

  const handleRename = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === editingTurma) {
      closeRenameModal();
      return;
    }
    setIsRenaming(true);
    setRenameError('');
    const { data, error: rpcError } = await supabase.rpc('rename_school_turma', {
      p_old_name: editingTurma,
      p_new_name: trimmed,
    });
    setIsRenaming(false);
    if (rpcError) {
      setRenameError(rpcError.message);
      return;
    }
    setTurmas(data.turmas);
    if (onUpdate) onUpdate();
    closeRenameModal();
  };

  if (!canManage) return null;

  return (
    <div className={noBorder ? '' : 'pt-4 border-t border-outline-variant'}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
          <School size={15} className="text-primary" /> Turmas
          <span className="text-xs font-semibold text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-sm px-2 py-0.5">{turmas.length}</span>
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          As turmas aparecem na matrícula de alunos, no vínculo de professores e nos filtros de mural, comunicados e frequência.
          <span className="hidden sm:inline"> Use o lápis para corrigir o nome de uma turma (atualiza todos os registros vinculados automaticamente) ou o X para remover uma turma que não está mais em uso.</span>
        </p>
      </div>

      <div className="flex gap-2 mb-4 sm:max-w-md">
        <input
          type="text"
          value={newTurma}
          onChange={e => setNewTurma(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTurma(); } }}
          placeholder="Nova turma, ex: Kids III"
          aria-label="Nome da nova turma"
          disabled={isSaving}
          className="flex-1 min-w-0 h-10 px-3 bg-surface-container-lowest border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary focus:outline-none text-sm"
        />
        <button
          type="button"
          onClick={handleAddTurma}
          disabled={isSaving || !newTurma.trim()}
          className="flex items-center justify-center gap-1.5 h-10 px-4 bg-primary text-white hover:bg-primary-container rounded-zela-md text-sm font-semibold transition disabled:opacity-50 shrink-0"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Adicionar
        </button>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {turmas.map(turma => (
          <li key={turma} className="flex items-center justify-between gap-2 pl-3.5 pr-1.5 py-1.5 bg-surface-container-lowest border border-outline-variant rounded-zela-md hover:border-primary/30 transition">
            <span className="text-sm font-semibold text-on-surface truncate" title={turma}>{turma}</span>
            <span className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => openRenameModal(turma)}
                disabled={removingTurma === turma}
                title={`Renomear ${turma}`}
                aria-label={`Renomear ${turma}`}
                className="h-9 w-9 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md transition disabled:opacity-50"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveTurma(turma)}
                disabled={removingTurma === turma}
                title={`Remover ${turma}`}
                aria-label={`Remover ${turma}`}
                className="h-9 w-9 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 rounded-zela-md transition disabled:opacity-50"
              >
                {removingTurma === turma ? <Loader2 size={15} className="animate-spin" /> : <X size={16} />}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {turmas.length === 0 && (
        <p className="text-xs text-on-surface-variant italic">Nenhuma turma cadastrada ainda.</p>
      )}

      {error && (
        <div className="mt-2 p-2 bg-error/10 border border-error/40 rounded-zela-md text-xs text-error font-medium flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {editingTurma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={closeRenameModal}>
          <div className="bg-white rounded-zela-lg shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-on-surface mb-1">Renomear turma</h4>
            <p className="text-xs text-on-surface-variant mb-3">
              Renomear "{editingTurma}" atualiza automaticamente todos os registros vinculados: alunos, professores, mural de fotos, comunicados, matérias e frequência.
            </p>
            <input
              type="text"
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRename(); } if (e.key === 'Escape') closeRenameModal(); }}
              disabled={isRenaming}
              className="w-full p-2 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm mb-2"
            />
            {renameError && (
              <div className="mb-2 p-2 bg-error/10 border border-error/40 rounded-zela-md text-xs text-error font-medium flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                {renameError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={closeRenameModal}
                disabled={isRenaming}
                className="px-3 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low rounded-zela-md transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRename}
                disabled={isRenaming || !editValue.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white hover:bg-primary-container rounded-zela-md text-sm font-bold transition disabled:opacity-50"
              >
                {isRenaming ? <Loader2 size={15} className="animate-spin" /> : null} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Imagem de login por escola (admin principal) -- antes disso, a imagem
// central da tela de login era só GLOBAL (developer, ConfiguracoesPanel),
// a mesma pra qualquer escola. schools.login_image_url deixa cada escola
// ter a própria (a global vira fallback, usada quando a escola não
// configurou nenhuma ou quando ninguém informa o código dela na tela de
// login). Mesmo padrão de upload já usado pra logo_url: base64 direto
// numa coluna text, sem Storage.
//
// Controlado pelo pai (AdminSettings): valor e setter vêm por prop, sem
// save próprio. Achado ao investigar "não consigo trocar a imagem": essa
// seção tinha um botão "Salvar" PRÓPRIO, separado do botão "Salvar
// Alterações" do topo da tela -- mesmo estando dentro do mesmo <form>,
// era type="button" (não submit), então clicar no botão do topo (o
// comportamento esperado nessa tela, que já salva nome/telefone/logo)
// nunca persistia a imagem trocada. O preview mudava, o usuário clicava
// no botão errado (o óbvio, de cima), e a imagem voltava pra antiga no
// próximo carregamento -- sem erro nenhum visível. Corrigido: agora é só
// mais um campo do mesmo formulário único, com um só "Salvar".
function LoginImageSection({ currentUser, imageUrl, onImageChange, noBorder = false }) {
  const fileInputRef = useRef(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState('');

  const canManage = ['developer', 'gestao'].includes(currentUser?.role);

  // Comprime antes de converter pra base64 -- guardado numa coluna text, uma
  // foto de celular sem compressão (3-5MB comum) infla a linha da escola e
  // pesa no carregamento da tela de login (que baixa a linha inteira via
  // get_school_login_image toda vez que alguém abre com o código
  // preenchido). MAX_IMAGE_SIZE é o limite PÓS-compressão -- se ainda assim
  // passar disso (imagem já pequena mas de dimensão exótica, por exemplo),
  // bloqueia com mensagem clara em vez de gravar uma linha gigante.
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setIsCompressing(true);
    try {
      const compressed = await compressImage(file, { maxDimension: 1200 });
      if (compressed.size > MAX_IMAGE_SIZE) {
        setError(`Imagem muito grande (${(compressed.size / 1024 / 1024).toFixed(1)}MB mesmo após compressão). Tente uma imagem menor.`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => onImageChange(reader.result);
      reader.readAsDataURL(compressed);
    } finally {
      setIsCompressing(false);
      e.target.value = ''; // permite re-selecionar o mesmo arquivo depois de um erro
    }
  };

  if (!canManage) return null;

  return (
    <div className={noBorder ? '' : 'pt-3 border-t border-outline-variant'}>
      <div className="mb-2">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5"><ImageIcon size={15} className="text-primary" /> Imagem de Login</h3>
        <p className="text-xs text-on-surface-variant">
          Aparece do lado esquerdo da tela de login quando alguém informa o código desta escola.
          Sem imagem própria configurada, a tela de login usa a imagem padrão do sistema.
          Escolha o arquivo e clique em "Salvar" no topo da tela pra confirmar.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="w-24 h-24 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant flex items-center justify-center shrink-0 overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt="Imagem de login" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="text-on-surface-variant/50" size={28} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={isCompressing} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isCompressing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-outline-variant rounded-lg text-xs font-bold text-on-surface-variant hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition shrink-0 disabled:opacity-50"
            >
              {isCompressing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {isCompressing ? 'Comprimindo...' : (imageUrl ? 'Trocar imagem' : 'Enviar imagem')}
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={() => onImageChange('')}
                title="Remover imagem"
                className="p-1.5 text-on-surface-variant/70 hover:text-error hover:bg-error/10 rounded-lg transition shrink-0"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {error && (
            <div className="p-2 bg-error/10 border border-error/40 rounded-zela-md text-xs text-error font-medium flex items-start gap-2 max-w-sm">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Config de cobrança de hora extra por escola (schools.billing_config) --
// valores que eram fixos no código (tolerância de 15min pro check-out,
// R$30/h) viram configuráveis por escola, com esses mesmos números como
// default. Controlado pelo pai, mesmo padrão de LoginImageSection: entra no
// mesmo "Salvar" único da tela, sem botão próprio (o bug de
// "não consigo trocar a imagem" foi exatamente um botão de salvar separado
// que não persistia -- não repetir aqui).
function BillingConfigSection({ currentUser, config, onConfigChange, noBorder = false }) {
  const canManage = ['developer', 'gestao'].includes(currentUser?.role);
  if (!canManage) return null;

  const set = (field, value) => onConfigChange({ ...config, [field]: value });

  const campo = 'w-full h-10 bg-surface-container-lowest border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary outline-none text-base font-semibold';
  const rotulo = 'block text-xs font-semibold text-on-surface-variant mb-1.5';

  return (
    <div className={`bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-4 max-w-2xl ${noBorder ? '' : 'mt-3'}`}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center"><Clock size={20} /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-on-surface">Cobrança de Hora Extra</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Margens de tolerância e valor da hora usados no cálculo automático de cobrança (check-in antecipado e check-out tardio).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="hx-in" className={rotulo}>Tolerância de check-in</label>
          <div className="relative">
            <input id="hx-in" type="number" min="0" max="60" value={config.early_checkin_tolerance_min}
              onChange={e => set('early_checkin_tolerance_min', Number(e.target.value))} className={`${campo} pl-3 pr-11`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant pointer-events-none">min</span>
          </div>
        </div>
        <div>
          <label htmlFor="hx-out" className={rotulo}>Tolerância de check-out</label>
          <div className="relative">
            <input id="hx-out" type="number" min="0" max="60" value={config.late_checkout_tolerance_min}
              onChange={e => set('late_checkout_tolerance_min', Number(e.target.value))} className={`${campo} pl-3 pr-11`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant pointer-events-none">min</span>
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="hx-rate" className={rotulo}>Valor da hora</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant pointer-events-none">R$</span>
            <input id="hx-rate" type="number" min="0" step="0.01" value={(config.hourly_rate_cents / 100).toFixed(2)}
              onChange={e => set('hourly_rate_cents', Math.round(Number(e.target.value) * 100))} className={`${campo} pl-10 pr-3`} />
          </div>
        </div>
      </div>

      <label className={`flex items-center justify-between gap-3 rounded-zela-md border p-3 cursor-pointer select-none transition ${config.charge_early_checkin ? 'border-primary/40 bg-primary/5' : 'border-outline-variant bg-surface-container-low'}`}>
        <span className="text-sm font-medium text-on-surface">Cobrar também check-in antecipado (além de check-out tardio)</span>
        <span className="relative shrink-0">
          <input type="checkbox" checked={config.charge_early_checkin} onChange={e => set('charge_early_checkin', e.target.checked)} className="peer sr-only" />
          <span className="block w-11 h-6 rounded-full bg-outline-variant peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 transition" />
          <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
      </label>
    </div>
  );
}

// Item #35 do roadmap: alerta de ausência prolongada -- quando um aluno
// acumula N dias letivos consecutivos sem nenhum check-in, os admins da
// escola recebem um aviso (in-app + push), pra poderem checar o bem-estar
// da criança/entrar em contato com a família. N é configurável aqui; o
// cálculo de verdade roda na edge function check-attendance-delays (mesma
// que já cuida do atraso no mesmo dia).
function AbsenceAlertSection({ currentUser, config, onConfigChange, noBorder = false }) {
  const canManage = ['developer', 'gestao', 'gestao_pedagogica'].includes(currentUser?.role);
  if (!canManage) return null;

  const set = (field, value) => onConfigChange({ ...config, [field]: value });

  const dias = config.consecutive_days_threshold;
  const mudarDias = (n) => set('consecutive_days_threshold', Math.min(30, Math.max(1, n)));
  const botaoDias = 'w-10 h-10 shrink-0 flex items-center justify-center rounded-zela-md border border-outline-variant bg-surface-container-low text-on-surface font-bold text-lg hover:bg-primary/10 hover:text-primary transition disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className={`bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-4 max-w-2xl ${noBorder ? '' : 'mt-3'}`}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center"><CalendarX size={20} /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-on-surface">Ausência Prolongada</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Avisa os administradores da escola quando um aluno passa muitos dias letivos seguidos sem nenhum check-in registrado.
          </p>
        </div>
      </div>

      <label className={`flex items-center justify-between gap-3 rounded-zela-md border p-3 cursor-pointer select-none transition ${config.enabled ? 'border-primary/40 bg-primary/5' : 'border-outline-variant bg-surface-container-low'}`}>
        <span className="text-sm font-medium text-on-surface">Alertar administradores por ausência prolongada</span>
        <span className="relative shrink-0">
          <input type="checkbox" checked={config.enabled} onChange={e => set('enabled', e.target.checked)} className="peer sr-only" />
          <span className="block w-11 h-6 rounded-full bg-outline-variant peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 transition" />
          <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
      </label>

      <div className={config.enabled ? '' : 'opacity-60'}>
        <label htmlFor="absence-days" className="block text-xs font-semibold text-on-surface-variant mb-1.5">Dias letivos consecutivos sem comparecer</label>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Diminuir" disabled={!config.enabled || dias <= 1} onClick={() => mudarDias(dias - 1)} className={botaoDias}><Minus size={16} /></button>
          <input
            id="absence-days"
            type="number" min="1" max="30"
            disabled={!config.enabled}
            value={dias}
            onChange={e => mudarDias(Number(e.target.value) || 1)}
            className="w-20 h-10 px-2 bg-surface-container-lowest border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary outline-none text-base font-semibold text-center disabled:cursor-not-allowed"
          />
          <button type="button" aria-label="Aumentar" disabled={!config.enabled || dias >= 30} onClick={() => mudarDias(dias + 1)} className={botaoDias}><Plus size={16} /></button>
          <span className="text-sm text-on-surface-variant">{dias === 1 ? 'dia' : 'dias'}</span>
        </div>
      </div>
    </div>
  );
}

// Dados da escola no formulário (30/09/2026): nome fantasia (name), dados
// legais do contrato e da nota fiscal, endereço por campos.
function dadosDaEscola(school) {
  return {
    name: school?.name || '',
    razao_social: school?.razao_social || '',
    cnpj: formatarCnpj(school?.cnpj || ''),
    inscricao_municipal: school?.inscricao_municipal || '',
    email: school?.email || '',
    phone: school?.phone || '',
    ...enderecoDaEscola(school),
    director_name: school?.director_name || '',
    encarregado_dados_nome: school?.encarregado_dados_nome || '',
    encarregado_dados_email: school?.encarregado_dados_email || '',
  };
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ICONES_DAS_ABAS = {
  dados: Building2,
  responsaveis: Users,
  identidade: ImageIcon,
};

// `only` (opcional): lista de abas a exibir; `showSchoolData` (padrão true):
// logo e dados da escola. Usados pelo Portal da Gestão pra dividir
// Configurações em Escola / Acadêmico / Financeiro reaproveitando esta tela.
export default function AdminSettings({ currentUser, currentSchool, onUpdate, only = null, showSchoolData = true }) {
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState(() => dadosDaEscola(currentSchool));
  // Responsável legal (quem assina o contrato): tabela própria, só a Gestão lê.
  const [responsavelLegal, setResponsavelLegal] = useState({ nome: '', cpf: '', cargo: '' });

  const [logoUrl, setLogoUrl] = useState(
    currentSchool?.logo_url || ''
  );
  const [loginImageUrl, setLoginImageUrl] = useState(currentSchool?.login_image_url || '');
  const [billingConfig, setBillingConfig] = useState(mergeBillingConfig(currentSchool?.billing_config));
  const [absenceAlertConfig, setAbsenceAlertConfig] = useState(mergeAbsenceAlertConfig(currentSchool?.absence_alert_config));
  const canManageSchool = ['developer', 'gestao'].includes(currentUser?.role);
  // Coordenação e Direção (29/09/2026): só o alerta de faltas.
  const ehGestaoPedagogica = currentUser?.role === 'gestao_pedagogica';
  // Configurações da Escola em abas (30/09/2026, pra evitar rolagem): dados
  // e endereço numa aba; logo e imagem de login em outra.
  const configTabs = [
    ...(showSchoolData ? [
      { id: 'dados', label: 'Dados da escola' },
      ...(canManageSchool ? [{ id: 'responsaveis', label: 'Responsáveis' }] : []),
      { id: 'identidade', label: canManageSchool ? 'Logo e Imagem de Login' : 'Logo' },
    ] : []),
    ...(canManageSchool ? [
      { id: 'turmas', label: 'Turmas' },
      { id: 'login_image', label: 'Imagem de Login' },
      { id: 'billing', label: 'Cobrança de Hora Extra' },
      { id: 'absence_alert', label: 'Faltas' },
    ] : ehGestaoPedagogica ? [{ id: 'absence_alert', label: 'Faltas' }] : []),
    // "Personalizar Menu" saiu em 30/09/2026: o que a escola tem é decidido
    // em Módulos (Portal do Dev) e o que a Recepção faz, em Permissões
    // (Gestão). A preferência era só do navegador de quem clicava.
  ].filter(t => ['dados', 'responsaveis', 'identidade'].includes(t.id) || ((!only || only.includes(t.id)) && !(showSchoolData && t.id === 'login_image')));
  const [activeConfigTab, setActiveConfigTab] = useState(configTabs[0]?.id || 'dados');

  const features = currentSchool?.features_enabled || {};
  // Responsável legal: carrega só para quem pode ver (Gestão e suporte).
  useEffect(() => {
    if (!canManageSchool || !currentSchool?.id) return;
    supabase.from('escola_responsavel_legal').select('nome, cpf, cargo').eq('school_id', currentSchool.id).maybeSingle()
      .then(({ data }) => setResponsavelLegal({ nome: data?.nome || '', cpf: formatarCpf(data?.cpf || ''), cargo: data?.cargo || '' }));
  }, [canManageSchool, currentSchool?.id]);

  useEffect(() => {
    if (currentSchool) {
      setLogoUrl(currentSchool.logo_url || '');
      setLoginImageUrl(currentSchool.login_image_url || '');
      setBillingConfig(mergeBillingConfig(currentSchool.billing_config));
      setAbsenceAlertConfig(mergeAbsenceAlertConfig(currentSchool.absence_alert_config));
      setFormData(dadosDaEscola(currentSchool));
    }
  }, [currentSchool]);


  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      if (canManageSchool) {
        if (formData.cnpj && !cnpjValido(formData.cnpj)) throw new Error('CNPJ inválido. Confira os números.');
        if (responsavelLegal.cpf && !cpfValido(responsavelLegal.cpf)) throw new Error('CPF do responsável legal inválido. Confira os números.');
        for (const email of [formData.email, formData.encarregado_dados_email]) {
          if (email && !EMAIL_OK.test(email.trim())) throw new Error(`E-mail inválido: ${email}`);
        }
        if ((responsavelLegal.cpf || responsavelLegal.cargo) && !responsavelLegal.nome.trim()) {
          throw new Error('Informe o nome do responsável legal.');
        }
      }

      // 2. Update Supabase
      // login_image_url/billing_config incluídos sempre -- pra quem não é
      // admin principal/developer, as seções correspondentes nem renderizam
      // (o estado nunca diverge do valor de currentSchool), então isso
      // nunca aciona a checagem da trigger de proteção pra esses roles; é
      // um no-op inofensivo.
      // Coordenação e Direção só mudam o alerta de faltas: manda só ele (o
      // banco recusa qualquer outra coluna para esse perfil).
      const updates = ehGestaoPedagogica ? { absence_alert_config: absenceAlertConfig } : {
        name: formData.name,
        phone: formData.phone,
        // Endereço por campos; o texto completo (schools.address, usado no
        // contrato) o banco monta sozinho.
        ...enderecoDaEscola(formData),
        director_name: formData.director_name,
        // Dados legais: só a Gestão e o suporte alteram (o banco confere).
        ...(canManageSchool ? {
          razao_social: formData.razao_social.trim(),
          cnpj: formData.cnpj,
          inscricao_municipal: formData.inscricao_municipal.trim(),
          email: formData.email.trim(),
          encarregado_dados_nome: formData.encarregado_dados_nome.trim(),
          encarregado_dados_email: formData.encarregado_dados_email.trim(),
        } : {}),
        logo_url: logoUrl || null,
        login_image_url: loginImageUrl || null,
        billing_config: billingConfig,
        absence_alert_config: absenceAlertConfig,
      };

      const { error } = await supabase
        .from('schools')
        .update(updates)
        .eq('id', currentUser.school_id);

      if (error) throw error;

      if (canManageSchool && !ehGestaoPedagogica) {
        const legal = { nome: responsavelLegal.nome.trim(), cpf: somenteDigitos(responsavelLegal.cpf), cargo: responsavelLegal.cargo.trim() };
        const { error: legalError } = legal.nome
          ? await supabase.from('escola_responsavel_legal').upsert({ school_id: currentUser.school_id, ...legal })
          : await supabase.from('escola_responsavel_legal').delete().eq('school_id', currentUser.school_id);
        if (legalError) throw legalError;
      }

      setSuccessMsg('Configurações atualizadas com sucesso! A página será atualizada.');
      if (onUpdate) onUpdate();
      
      // O header e componentes irao atualizar reativamente via React e banco de dados

    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao atualizar dados: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 p-2.5 sm:p-3 md:p-4 rounded-none sm:rounded-zela-xl shadow-none sm:shadow-sm border-0 sm:border sm:border-outline-variant md:rounded-none md:shadow-none md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Título "Configurações da Escola" e ícone removidos (o Header do app
          já mostra o nome da tela dinamicamente); botão de salvar sozinho
          na linha, alinhado à direita a partir de sm. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 pb-3 border-b border-outline-variant shrink-0">
        {/* Abas no topo, à esquerda, do mesmo tamanho do Salvar (30/09/2026). */}
        <div className="flex gap-2 overflow-x-auto min-w-0">
          {configTabs.length > 1 && configTabs.map(tab => {
            const Icone = ICONES_DAS_ABAS[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveConfigTab(tab.id)}
                className={`px-5 py-2.5 font-bold rounded-zela-md transition flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
                  activeConfigTab === tab.id
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {Icone && <Icone size={18} />}
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          type="submit"
          form="admin-settings-form"
          disabled={isLoading}
          className="px-5 py-2.5 bg-primary hover:bg-primary-container disabled:opacity-50 text-white font-bold rounded-zela-md shadow-md transition flex items-center justify-center gap-2 shrink-0"
        >
          <Save size={18} />
          {isLoading ? 'Salvando' : 'Salvar'}
        </button>
      </div>

      <form id="admin-settings-form" onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3">

          {/* Abas horizontais: Turmas / Imagem de Login / Cobrança de Hora Extra /
              Personalizar Menu -- continuam dentro do mesmo <form>, só trocando o
              que fica visível; nenhuma delas tem save próprio (mesmo "Salvar
              Alterações" único do topo salva a aba ativa e as outras já editadas). */}
          {configTabs.length > 0 && (
          <div>
            <div>
              {activeConfigTab === 'dados' && (() => {
                const lbl = 'block text-xs font-bold text-on-surface-variant mb-1';
                const inp = 'w-full p-2 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm disabled:bg-surface-container-low disabled:text-on-surface-variant';
                const set = (campo) => (e) => setFormData({ ...formData, [campo]: e.target.value });
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 content-start">
                    <div>
                      <label htmlFor="escola-nome" className={lbl}>Nome fantasia</label>
                      <input id="escola-nome" required type="text" value={formData.name} onChange={set('name')} className={inp} />
                    </div>
                    <div>
                      <label htmlFor="escola-razao" className={lbl}>Razão social</label>
                      <input id="escola-razao" type="text" value={formData.razao_social} onChange={set('razao_social')} disabled={!canManageSchool} placeholder="Como está no CNPJ" className={inp} />
                    </div>
                    <div>
                      <label htmlFor="escola-cnpj" className={lbl}>CNPJ</label>
                      <input id="escola-cnpj" type="text" inputMode="numeric" value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: formatarCnpj(e.target.value) })} disabled={!canManageSchool} placeholder="00.000.000/0000-00" className={inp} />
                    </div>
                    <div>
                      <label htmlFor="escola-im" className={lbl}>Inscrição municipal</label>
                      <input id="escola-im" type="text" value={formData.inscricao_municipal} onChange={set('inscricao_municipal')} disabled={!canManageSchool} placeholder="Usada na nota fiscal" className={inp} />
                    </div>
                    <div>
                      <label htmlFor="escola-email" className={lbl}>E-mail oficial</label>
                      <input id="escola-email" type="email" value={formData.email} onChange={set('email')} disabled={!canManageSchool} className={inp} />
                    </div>
                    <div>
                      <label htmlFor="escola-telefone" className={lbl}>Telefone</label>
                      <input id="escola-telefone" type="tel" value={formData.phone} onChange={set('phone')} className={inp} />
                    </div>
                    {!canManageSchool && (
                      <p className="sm:col-span-2 text-[11px] text-on-surface-variant">Razão social, CNPJ, inscrição municipal e e-mail oficial só a Gestão altera.</p>
                    )}
                    <div className="sm:col-span-2 pt-1">
                      <p className="text-xs font-bold text-on-surface-variant mb-1">Endereço (sai no contrato)</p>
                      <CamposEnderecoEscola
                        prefixoId="config-escola"
                        valores={enderecoDaEscola(formData)}
                        onChange={endereco => setFormData({ ...formData, ...endereco })}
                        labelCls="block text-[11px] font-bold text-on-surface-variant mb-1"
                        inputCls="w-full p-2 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm"
                      />
                    </div>
                  </div>
                );
              })()}
              {activeConfigTab === 'responsaveis' && (() => {
                const lbl = 'block text-xs font-bold text-on-surface-variant mb-1';
                const inp = 'w-full p-2 bg-white border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm';
                const titulo = 'text-sm font-bold text-on-surface';
                const ajuda = 'text-xs text-on-surface-variant mb-2';
                return (
                  <div className="flex flex-col gap-4">
                    <section>
                      <h3 className={titulo}>Responsável legal</h3>
                      <p className={ajuda}>Quem assina o contrato em nome da escola (sócio administrador ou gestor). Os dados ficam visíveis só para a Gestão e para quem gera contratos.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label htmlFor="legal-nome" className={lbl}>Nome</label>
                          <input id="legal-nome" type="text" value={responsavelLegal.nome} onChange={e => setResponsavelLegal({ ...responsavelLegal, nome: e.target.value })} className={inp} />
                        </div>
                        <div>
                          <label htmlFor="legal-cpf" className={lbl}>CPF</label>
                          <input id="legal-cpf" type="text" inputMode="numeric" value={responsavelLegal.cpf} onChange={e => setResponsavelLegal({ ...responsavelLegal, cpf: formatarCpf(e.target.value) })} placeholder="000.000.000-00" className={inp} />
                        </div>
                        <div>
                          <label htmlFor="legal-cargo" className={lbl}>Cargo</label>
                          <input id="legal-cargo" type="text" value={responsavelLegal.cargo} onChange={e => setResponsavelLegal({ ...responsavelLegal, cargo: e.target.value })} placeholder="Ex: Sócia administradora" className={inp} />
                        </div>
                      </div>
                    </section>
                    <section className="pt-3 border-t border-outline-variant">
                      <h3 className={titulo}>Diretora pedagógica</h3>
                      <p className={ajuda}>Assina os documentos pedagógicos, como o Relatório de Mitigação.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label htmlFor="escola-diretora" className={lbl}>Nome</label>
                          <input id="escola-diretora" type="text" value={formData.director_name} onChange={e => setFormData({ ...formData, director_name: e.target.value })} placeholder="Ex: Vanessa Ramalho" className={inp} />
                        </div>
                      </div>
                    </section>
                    <section className="pt-3 border-t border-outline-variant">
                      <h3 className={titulo}>Encarregado de dados (LGPD)</h3>
                      <p className={ajuda}>Quem responde pelos dados pessoais das famílias e dos alunos.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label htmlFor="lgpd-nome" className={lbl}>Nome</label>
                          <input id="lgpd-nome" type="text" value={formData.encarregado_dados_nome} onChange={e => setFormData({ ...formData, encarregado_dados_nome: e.target.value })} className={inp} />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="lgpd-email" className={lbl}>E-mail</label>
                          <input id="lgpd-email" type="email" value={formData.encarregado_dados_email} onChange={e => setFormData({ ...formData, encarregado_dados_email: e.target.value })} className={inp} />
                        </div>
                      </div>
                    </section>
                  </div>
                );
              })()}
              {activeConfigTab === 'identidade' && (
                <div className="flex flex-col gap-4">
                  {/* LOGO */}
                  <div>
                    <div className="mb-2">
                      <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5"><Building2 size={15} className="text-primary" /> Logo da escola</h3>
                      <p className="text-xs text-on-surface-variant">
                        Aparece no topo do sistema, ao lado do nome da escola. Escolha o arquivo e clique em "Salvar" no topo da tela pra confirmar.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-24 bg-surface-container-low rounded-full border border-dashed border-outline-variant flex items-center justify-center shrink-0 overflow-hidden">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <Building2 className="text-on-surface-variant/50" size={28} />
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-outline-variant rounded-lg text-xs font-bold text-on-surface-variant hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition shrink-0"
                        >
                          <Upload size={13} /> {logoUrl ? 'Trocar logo' : 'Enviar logo'}
                        </button>
                        {logoUrl && (
                          <button
                            type="button"
                            onClick={() => setLogoUrl('')}
                            title="Remover logo"
                            className="p-1.5 text-on-surface-variant/70 hover:text-error hover:bg-error/10 rounded-lg transition shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {canManageSchool && (
                    <LoginImageSection currentUser={currentUser} imageUrl={loginImageUrl} onImageChange={setLoginImageUrl} />
                  )}
                </div>
              )}
              {activeConfigTab === 'turmas' && (
                <TurmasSection currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdate} noBorder />
              )}
              {activeConfigTab === 'login_image' && (
                <LoginImageSection currentUser={currentUser} imageUrl={loginImageUrl} onImageChange={setLoginImageUrl} noBorder />
              )}
              {activeConfigTab === 'billing' && (
                <BillingConfigSection currentUser={currentUser} config={billingConfig} onConfigChange={setBillingConfig} noBorder />
              )}
              {activeConfigTab === 'absence_alert' && (
                <AbsenceAlertSection currentUser={currentUser} config={absenceAlertConfig} onConfigChange={setAbsenceAlertConfig} noBorder />
              )}
            </div>
          </div>
          )}

          {errorMsg && (
            <div className="p-2 bg-error/10 border border-error/40 rounded-zela-md text-sm text-error font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-2 bg-success/10 border border-success/40 rounded-zela-md text-sm text-success font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {successMsg}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}


