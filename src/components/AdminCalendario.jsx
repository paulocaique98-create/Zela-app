import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2, Trash2, Pencil, X, Check, Plus, FileUp, AlertTriangle, Download, Sparkles, ListChecks } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EVENTO_TIPOS } from '../lib/constants';
import { parseDateTextList } from '../lib/pdfDateListParser';
import { parseCalendarioComIA } from '../lib/calendarioIaParser';
import { notifyFamilies } from '../lib/notifyFamilies';
import { DIAS_SEMANA, OCORRENCIAS_MES, formatRecorrencia } from '../lib/aulasEspeciaisUtils';
import ConfirmModal from './ConfirmModal';

const TIPO_BY_VALUE = Object.fromEntries(EVENTO_TIPOS.map(t => [t.value, t]));

const COLOR_CLASSES = {
  slate: 'bg-surface-container text-on-surface-variant border-outline-variant',
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  indigo: 'bg-primary/10 text-primary border-primary/20',
  green: 'bg-green-50 text-green-700 border-green-200',
};

function formatDateLabel(dateStr) {
  // event_date vem como "YYYY-MM-DD" — monta a data em UTC-noon pra evitar o dia
  // "voltar" por causa da conversão de fuso ao formatar.
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
}

export default function AdminCalendario({ currentUser, currentSchool }) {
  const [eventos, setEventos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState('geral');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Seleção múltipla pra exclusão em massa
  const [isSelectingEventos, setIsSelectingEventos] = useState(false);
  const [selectedEventoIds, setSelectedEventoIds] = useState(new Set());
  const [isBulkDeletingEventos, setIsBulkDeletingEventos] = useState(false);
  const [confirmBulkDeleteEventos, setConfirmBulkDeleteEventos] = useState(false);

  // Importação de PDF: extrai datas + títulos candidatos e mostra pra revisão
  // antes de gravar em lote — evita que um PDF mal formatado gere lixo direto no
  // calendário sem chance de correção.
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [importCandidates, setImportCandidates] = useState(null); // null = painel fechado
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [isModeloMenuOpen, setIsModeloMenuOpen] = useState(false);

  // Importação com IA (Gemini): lê qualquer layout de PDF de calendário
  // (lista + mini-calendário gráfico, como o modelo real da escola) sem
  // exigir o formato "data - título" que o parser de texto precisa. Cai na
  // mesma tela de revisão (importCandidates) de baixo.
  const [isParsingIA, setIsParsingIA] = useState(false);
  const [importFromIA, setImportFromIA] = useState(false);

  // ── Aulas Especiais: grade recorrente, separada dos eventos de data fixa ──
  const [activeTab, setActiveTab] = useState('eventos'); // 'eventos' | 'aulas'
  const [aulas, setAulas] = useState([]);
  const [isLoadingAulas, setIsLoadingAulas] = useState(true);
  const [aulaError, setAulaError] = useState('');

  const [showAulaForm, setShowAulaForm] = useState(false);
  const [editingAulaId, setEditingAulaId] = useState(null);
  const [aulaNome, setAulaNome] = useState('');
  const [aulaCategoria, setAulaCategoria] = useState('geral');
  const [aulaFrequencia, setAulaFrequencia] = useState('semanal');
  const [aulaDiasSemana, setAulaDiasSemana] = useState([]);
  const [aulaOcorrencias, setAulaOcorrencias] = useState([]);
  const [isSavingAula, setIsSavingAula] = useState(false);
  const [deletingAulaId, setDeletingAulaId] = useState(null);
  const [confirmDeleteAulaId, setConfirmDeleteAulaId] = useState(null);

  // Seleção múltipla pra exclusão em massa
  const [isSelectingAulas, setIsSelectingAulas] = useState(false);
  const [selectedAulaIds, setSelectedAulaIds] = useState(new Set());
  const [isBulkDeletingAulas, setIsBulkDeletingAulas] = useState(false);
  const [confirmBulkDeleteAulas, setConfirmBulkDeleteAulas] = useState(false);

  // Aulas especiais sugeridas pela IA junto do PDF do calendário — revisão
  // separada da de eventos, mesma exigência de conferência humana antes de gravar.
  const [iaAulaCandidates, setIaAulaCandidates] = useState(null);
  const [isImportingAulas, setIsImportingAulas] = useState(false);

  const schoolId = currentSchool?.id || currentUser?.school_id;

  const fetchEventos = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('eventos_calendario')
        .select('*')
        .eq('school_id', schoolId)
        .order('event_date', { ascending: true });

      if (fetchError) throw fetchError;
      setEventos(data || []);
    } catch (err) {
      console.error('[AdminCalendario] Erro ao buscar:', err);
      setError('Não foi possível carregar os eventos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEventos();
  }, [schoolId]);

  const fetchAulas = async () => {
    if (!schoolId) return;
    setIsLoadingAulas(true);
    setAulaError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('aulas_especiais')
        .select('*')
        .eq('school_id', schoolId)
        .order('nome', { ascending: true });
      if (fetchError) throw fetchError;
      setAulas(data || []);
    } catch (err) {
      console.error('[AdminCalendario] Erro ao buscar aulas especiais:', err);
      setAulaError('Não foi possível carregar as aulas especiais.');
    } finally {
      setIsLoadingAulas(false);
    }
  };

  useEffect(() => {
    fetchAulas();
  }, [schoolId]);

  const resetAulaForm = () => {
    setShowAulaForm(false);
    setEditingAulaId(null);
    setAulaNome('');
    setAulaCategoria('geral');
    setAulaFrequencia('semanal');
    setAulaDiasSemana([]);
    setAulaOcorrencias([]);
  };

  const handleEditAula = (aula) => {
    setEditingAulaId(aula.id);
    setAulaNome(aula.nome);
    setAulaCategoria(aula.categoria);
    setAulaFrequencia(aula.frequencia);
    setAulaDiasSemana(aula.dias_semana || []);
    setAulaOcorrencias(aula.ocorrencias_mes || []);
    setShowAulaForm(true);
  };

  const toggleAulaDia = (dia) => {
    setAulaDiasSemana(prev => (prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]));
  };

  const toggleAulaOcorrencia = (val) => {
    setAulaOcorrencias(prev => (prev.includes(val) ? prev.filter(o => o !== val) : [...prev, val]));
  };

  const handleSubmitAula = async (e) => {
    e.preventDefault();
    if (!aulaNome.trim() || aulaDiasSemana.length === 0 || !schoolId) return;
    if (aulaFrequencia === 'mensal' && aulaOcorrencias.length === 0) return;

    setIsSavingAula(true);
    setAulaError('');
    try {
      const payload = {
        nome: aulaNome.trim(),
        categoria: aulaCategoria,
        frequencia: aulaFrequencia,
        dias_semana: aulaDiasSemana,
        ocorrencias_mes: aulaFrequencia === 'mensal' ? aulaOcorrencias : [],
      };

      if (editingAulaId) {
        const { error: updateError } = await supabase
          .from('aulas_especiais')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingAulaId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('aulas_especiais')
          .insert({ school_id: schoolId, ...payload, created_by: currentUser.id });
        if (insertError) throw insertError;
      }
      resetAulaForm();
      await fetchAulas();
    } catch (err) {
      console.error('[AdminCalendario] Erro ao salvar aula especial:', err);
      setAulaError('Não foi possível salvar a aula especial.');
    } finally {
      setIsSavingAula(false);
    }
  };

  const handleDeleteAula = (id) => setConfirmDeleteAulaId(id);

  const confirmDeleteAula = async () => {
    const id = confirmDeleteAulaId;
    setDeletingAulaId(id);
    try {
      const { error: deleteError } = await supabase.from('aulas_especiais').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setAulas(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('[AdminCalendario] Erro ao excluir aula especial:', err);
      setAulaError('Não foi possível excluir a aula especial.');
    } finally {
      setDeletingAulaId(null);
      setConfirmDeleteAulaId(null);
    }
  };

  const toggleSelectAula = (id) => {
    setSelectedAulaIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllAulas = () => {
    setSelectedAulaIds(prev => (prev.size === aulas.length ? new Set() : new Set(aulas.map(a => a.id))));
  };

  const exitSelectAulas = () => {
    setIsSelectingAulas(false);
    setSelectedAulaIds(new Set());
  };

  const handleBulkDeleteAulas = async () => {
    setIsBulkDeletingAulas(true);
    try {
      const ids = [...selectedAulaIds];
      const { error: deleteError } = await supabase.from('aulas_especiais').delete().in('id', ids);
      if (deleteError) throw deleteError;
      setAulas(prev => prev.filter(a => !selectedAulaIds.has(a.id)));
      exitSelectAulas();
    } catch (err) {
      console.error('[AdminCalendario] Erro ao excluir aulas especiais em massa:', err);
      setAulaError('Não foi possível excluir as aulas selecionadas.');
    } finally {
      setIsBulkDeletingAulas(false);
      setConfirmBulkDeleteAulas(false);
    }
  };

  const handleConfirmIaAulas = async () => {
    const toImport = (iaAulaCandidates || []).filter(c => c.selected && c.nome.trim() && c.dias_semana.length > 0);
    if (toImport.length === 0) return;
    setIsImportingAulas(true);
    setAulaError('');
    try {
      const rows = toImport.map(c => ({
        school_id: schoolId,
        nome: c.nome.trim(),
        categoria: c.categoria,
        frequencia: c.frequencia,
        dias_semana: c.dias_semana,
        ocorrencias_mes: c.frequencia === 'mensal' ? c.ocorrencias_mes : [],
        created_by: currentUser.id,
      }));
      const { error: insertError } = await supabase.from('aulas_especiais').insert(rows);
      if (insertError) throw insertError;
      setIaAulaCandidates(null);
      await fetchAulas();
    } catch (err) {
      console.error('[AdminCalendario] Erro ao importar aulas especiais:', err);
      setAulaError('Não foi possível importar as aulas especiais.');
    } finally {
      setIsImportingAulas(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setDescription('');
    setEventDate('');
    setEventType('geral');
  };

  const handleEdit = (evento) => {
    setEditingId(evento.id);
    setTitle(evento.title);
    setDescription(evento.description || '');
    setEventDate(evento.event_date);
    setEventType(evento.event_type || 'geral');
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !eventDate || !schoolId) return;

    setIsSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        event_date: eventDate,
        event_type: eventType,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('eventos_calendario')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('eventos_calendario')
          .insert({ school_id: schoolId, ...payload, created_by: currentUser.id });
        if (insertError) throw insertError;

        notifyFamilies({
          type: 'calendario',
          title: 'Novo evento no calendário',
          message: `${payload.title} · ${formatDateLabel(payload.event_date)}`,
          url: '/?tab=calendario',
        });
      }
      resetForm();
      await fetchEventos();
    } catch (err) {
      console.error('[AdminCalendario] Erro ao salvar:', err);
      setError('Não foi possível salvar o evento.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('eventos_calendario').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setEventos(prev => prev.filter(ev => ev.id !== id));
    } catch (err) {
      console.error('[AdminCalendario] Erro ao excluir:', err);
      setError('Não foi possível excluir o evento.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const toggleSelectEvento = (id) => {
    setSelectedEventoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllEventos = () => {
    setSelectedEventoIds(prev => (prev.size === eventos.length ? new Set() : new Set(eventos.map(e => e.id))));
  };

  const exitSelectEventos = () => {
    setIsSelectingEventos(false);
    setSelectedEventoIds(new Set());
  };

  const handleBulkDeleteEventos = async () => {
    setIsBulkDeletingEventos(true);
    try {
      const ids = [...selectedEventoIds];
      const { error: deleteError } = await supabase.from('eventos_calendario').delete().in('id', ids);
      if (deleteError) throw deleteError;
      setEventos(prev => prev.filter(ev => !selectedEventoIds.has(ev.id)));
      exitSelectEventos();
    } catch (err) {
      console.error('[AdminCalendario] Erro ao excluir eventos em massa:', err);
      setError('Não foi possível excluir os eventos selecionados.');
    } finally {
      setIsBulkDeletingEventos(false);
      setConfirmBulkDeleteEventos(false);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const handlePdfSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setImportError('Selecione um arquivo PDF.');
      return;
    }

    setIsParsingPdf(true);
    setImportError('');
    try {
      const candidates = await parseDateTextList(file);
      if (candidates.length === 0) {
        setImportError('Nenhuma data foi encontrada nesse PDF. Ele pode estar em formato de imagem (não é possível extrair texto automaticamente). Cadastre os eventos manualmente.');
        return;
      }
      setImportCandidates(candidates.map((c, i) => ({ ...c, id: i, selected: true, event_type: 'geral' })));
      setImportFromIA(false);
    } catch (err) {
      console.error('[AdminCalendario] Erro ao processar PDF:', err);
      setImportError('Não foi possível ler esse PDF.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleIaFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setImportError('Selecione um arquivo PDF.');
      return;
    }
    setIsParsingIA(true);
    setImportError('');
    try {
      const result = await parseCalendarioComIA(file);
      if (!result.eventos || result.eventos.length === 0) {
        setImportError('A IA não identificou nenhum evento nesse PDF.');
        return;
      }
      setImportCandidates(result.eventos.map((ev, i) => ({
        id: i,
        date: ev.date,
        title: ev.title,
        event_type: EVENTO_TIPOS.some(t => t.value === ev.tipo) ? ev.tipo : 'geral',
        selected: true,
      })));
      setImportFromIA(true);

      if (result.aulas_especiais && result.aulas_especiais.length > 0) {
        setIaAulaCandidates(result.aulas_especiais.map((a, i) => ({
          id: i,
          nome: a.nome || '',
          categoria: a.categoria === 'integral' ? 'integral' : 'geral',
          frequencia: a.frequencia === 'mensal' ? 'mensal' : 'semanal',
          dias_semana: (a.dias_semana || []).filter(d => DIAS_SEMANA.includes(d)),
          ocorrencias_mes: (a.ocorrencias_mes || []).filter(o => OCORRENCIAS_MES.some(om => om.value === o)),
          selected: true,
        })));
      }
    } catch (err) {
      console.error('[AdminCalendario] Erro ao importar com IA:', err);
      setImportError(err.message || 'Não foi possível processar esse PDF com a IA.');
    } finally {
      setIsParsingIA(false);
    }
  };

  const updateCandidate = (id, patch) => {
    setImportCandidates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleConfirmImport = async () => {
    const toImport = (importCandidates || []).filter(c => c.selected && c.title.trim() && c.date);
    if (toImport.length === 0) return;

    setIsImporting(true);
    setImportError('');
    try {
      const rows = toImport.map(c => ({
        school_id: schoolId,
        title: c.title.trim(),
        event_date: c.date,
        event_type: c.event_type || 'geral',
        created_by: currentUser.id,
      }));
      const { error: insertError } = await supabase.from('eventos_calendario').insert(rows);
      if (insertError) throw insertError;

      notifyFamilies({
        type: 'calendario',
        title: `${rows.length} novo(s) evento(s) no calendário`,
        message: 'A escola atualizou o calendário escolar.',
        url: '/?tab=calendario',
      });

      setImportCandidates(null);
      setImportFromIA(false);
      await fetchEventos();
    } catch (err) {
      console.error('[AdminCalendario] Erro ao importar eventos:', err);
      setImportError('Não foi possível importar os eventos.');
    } finally {
      setIsImporting(false);
    }
  };

  const selectedImportCount = (importCandidates || []).filter(c => c.selected).length;

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
            <CalendarDays size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Calendário</h2>
            <p className="text-on-surface-variant text-small hidden sm:block">Adicione, edite e remova eventos do calendário escolar.</p>
          </div>
        </div>
        {activeTab === 'eventos' && !showForm && !importCandidates && !isSelectingEventos && (
          <div className="flex flex-wrap gap-2 justify-end">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModeloMenuOpen(v => !v)}
                className="flex items-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
              >
                <Download size={18} />
                <span className="hidden sm:inline">Modelo</span>
              </button>
              {isModeloMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsModeloMenuOpen(false)} />
                  <div className="absolute z-20 mt-1.5 w-64 bg-white border border-outline-variant rounded-zela-md shadow-lg overflow-hidden right-0">
                    <a
                      href="/modelos/Modelo_Calendario_Zela.docx"
                      download
                      onClick={() => setIsModeloMenuOpen(false)}
                      className="block px-4 py-3 hover:bg-primary/10 transition"
                    >
                      <div className="text-sm font-bold text-on-surface">Baixar modelo</div>
                      <div className="text-xs text-on-surface-variant/70 mt-0.5">Formato de lista, pronto pra preencher</div>
                    </a>
                  </div>
                </>
              )}
            </div>
            <label className={`flex items-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm cursor-pointer ${isParsingPdf ? 'opacity-60 pointer-events-none' : ''}`}>
              {isParsingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
              <span className="hidden sm:inline">{isParsingPdf ? 'Lendo PDF...' : 'Importar'}</span>
              <input type="file" accept="application/pdf" onChange={handlePdfSelected} className="hidden" disabled={isParsingPdf} />
            </label>
            <label
              className={`flex items-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm cursor-pointer ${isParsingIA ? 'opacity-60 pointer-events-none' : ''}`}
              title="Lê qualquer PDF de calendário (mesmo em layout gráfico) usando IA, sem precisar seguir o modelo"
            >
              {isParsingIA ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              <span className="hidden sm:inline">{isParsingIA ? 'Lendo com IA...' : 'Importar com IA'}</span>
              <input type="file" accept="application/pdf" onChange={handleIaFileSelected} className="hidden" disabled={isParsingIA} />
            </label>
            {eventos.length > 0 && (
              <button
                onClick={() => setIsSelectingEventos(true)}
                className="flex items-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
              >
                <ListChecks size={18} /> <span className="hidden sm:inline">Selecionar</span>
              </button>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              <Plus size={18} /> <span className="hidden sm:inline">Novo Evento</span>
            </button>
          </div>
        )}
        {activeTab === 'eventos' && isSelectingEventos && (
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <label className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant cursor-pointer select-none">
              <input
                type="checkbox"
                checked={eventos.length > 0 && selectedEventoIds.size === eventos.length}
                onChange={toggleSelectAllEventos}
                className="w-4 h-4 accent-indigo-600"
              />
              Todos
            </label>
            <span className="text-xs font-bold text-on-surface-variant">{selectedEventoIds.size} selecionado(s)</span>
            <button
              onClick={() => setConfirmBulkDeleteEventos(true)}
              disabled={selectedEventoIds.size === 0}
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:pointer-events-none text-red-600 px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              <Trash2 size={16} /> <span className="hidden sm:inline">Excluir selecionados</span>
            </button>
            <button
              onClick={exitSelectEventos}
              className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-on-surface px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              Cancelar
            </button>
          </div>
        )}
        {activeTab === 'aulas' && !showAulaForm && !iaAulaCandidates && !isSelectingAulas && (
          <div className="flex flex-wrap gap-2 justify-end">
            {aulas.length > 0 && (
              <button
                onClick={() => setIsSelectingAulas(true)}
                className="flex items-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
              >
                <ListChecks size={18} /> <span className="hidden sm:inline">Selecionar</span>
              </button>
            )}
            <button
              onClick={() => setShowAulaForm(true)}
              className="flex items-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              <Plus size={18} /> <span className="hidden sm:inline">Nova Aula Especial</span>
            </button>
          </div>
        )}
        {activeTab === 'aulas' && isSelectingAulas && (
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <label className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant cursor-pointer select-none">
              <input
                type="checkbox"
                checked={aulas.length > 0 && selectedAulaIds.size === aulas.length}
                onChange={toggleSelectAllAulas}
                className="w-4 h-4 accent-indigo-600"
              />
              Todas
            </label>
            <span className="text-xs font-bold text-on-surface-variant">{selectedAulaIds.size} selecionada(s)</span>
            <button
              onClick={() => setConfirmBulkDeleteAulas(true)}
              disabled={selectedAulaIds.size === 0}
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:pointer-events-none text-red-600 px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              <Trash2 size={16} /> <span className="hidden sm:inline">Excluir selecionadas</span>
            </button>
            <button
              onClick={exitSelectAulas}
              className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-on-surface px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-5 sm:px-6 pt-4 border-b border-outline-variant shrink-0">
        <button
          onClick={() => setActiveTab('eventos')}
          className={`px-3 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'eventos' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
        >
          Eventos
        </button>
        <button
          onClick={() => setActiveTab('aulas')}
          className={`relative px-3 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'aulas' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
        >
          Aulas Especiais
          {iaAulaCandidates && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black align-middle">
              {iaAulaCandidates.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'eventos' && (
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {importError && !importCandidates && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-zela-md text-sm font-medium flex gap-2 items-start">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {importError}
          </div>
        )}

        {importCandidates && (
          <div className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            {importFromIA && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-zela-md text-xs font-medium flex gap-2 items-start">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                Esses eventos foram lidos por IA e podem conter erros. Nada foi publicado ainda. Confira e corrija cada linha com atenção antes de confirmar; só depois disso o calendário fica visível pras famílias.
              </div>
            )}
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="font-bold text-on-surface text-sm">Revisar eventos encontrados no PDF</h3>
                <p className="text-on-surface-variant text-xs mt-0.5">
                  {importCandidates.length} evento(s) detectado(s). Confira as datas e títulos antes de importar: a extração automática pode errar em PDFs com layout complexo.
                </p>
              </div>
              <button onClick={() => { setImportCandidates(null); setImportFromIA(false); }} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition shrink-0">
                <X size={18} />
              </button>
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{importError}</div>
            )}

            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {importCandidates.map(c => (
                <div key={c.id} className={`flex items-center gap-2 bg-white border rounded-zela-md p-2.5 ${c.selected ? 'border-outline-variant' : 'border-outline-variant opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={e => updateCandidate(c.id, { selected: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 shrink-0"
                  />
                  <input
                    type="date"
                    value={c.date}
                    onChange={e => updateCandidate(c.id, { date: e.target.value })}
                    className="px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-semibold text-on-surface shrink-0"
                  />
                  <input
                    type="text"
                    value={c.title}
                    onChange={e => updateCandidate(c.id, { title: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface"
                  />
                  <select
                    value={c.event_type}
                    onChange={e => updateCandidate(c.id, { event_type: e.target.value })}
                    className="px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-semibold text-on-surface shrink-0"
                  >
                    {EVENTO_TIPOS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setImportCandidates(null); setImportFromIA(false); }}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-on-surface font-bold py-2.5 rounded-zela-md transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isImporting || selectedImportCount === 0}
                className="flex-[2] flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white font-bold py-2.5 rounded-zela-md transition-all active:scale-95 text-sm"
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Importar {selectedImportCount} evento(s)
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface text-sm">{editingId ? 'Editar evento' : 'Novo evento'}</h3>
              <button type="button" onClick={resetForm} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Título do evento"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={150}
              required
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-bold text-on-surface text-sm"
            />

            <textarea
              placeholder="Descrição (opcional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-on-surface text-sm resize-none"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Data</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Tipo</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm"
                >
                  {EVENTO_TIPOS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving || !title.trim() || !eventDate}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Salvar alterações' : 'Adicionar Evento'}
            </button>
          </form>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : eventos.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <CalendarDays className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum evento cadastrado ainda.</p>
          </div>
        ) : (
          eventos.map(ev => {
            const tipo = TIPO_BY_VALUE[ev.event_type] || TIPO_BY_VALUE.geral;
            const isPast = ev.event_date < todayStr;
            return (
              <div
                key={ev.id}
                onClick={() => isSelectingEventos && toggleSelectEvento(ev.id)}
                className={`bg-white border rounded-zela-lg p-4 sm:p-5 shadow-sm ${isPast ? 'opacity-60' : ''} ${isSelectingEventos ? 'cursor-pointer' : ''} ${isSelectingEventos && selectedEventoIds.has(ev.id) ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-outline-variant'}`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {isSelectingEventos && (
                      <input
                        type="checkbox"
                        checked={selectedEventoIds.has(ev.id)}
                        onChange={() => toggleSelectEvento(ev.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 mt-1 accent-indigo-600 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-on-surface">{ev.title}</h4>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${COLOR_CLASSES[tipo.color]}`}>
                          {tipo.label}
                        </span>
                        {ev.event_date === todayStr && (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-primary text-white">Hoje</span>
                        )}
                      </div>
                      <p className="text-on-surface-variant text-xs mt-0.5 capitalize">{formatDateLabel(ev.event_date)}</p>
                    </div>
                  </div>
                  {!isSelectingEventos && (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handleEdit(ev)}
                        className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(ev.id)}
                        disabled={deletingId === ev.id}
                        className="p-2 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Excluir"
                      >
                        {deletingId === ev.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  )}
                </div>
                {ev.description && (
                  <p className="text-on-surface-variant text-sm mt-3 whitespace-pre-wrap">{ev.description}</p>
                )}
              </div>
            );
          })
        )}
      </div>
      )}

      {activeTab === 'aulas' && (
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {aulaError && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{aulaError}</div>
        )}

        {iaAulaCandidates && (
          <div className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-zela-md text-xs font-medium flex gap-2 items-start">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              A IA também encontrou aulas especiais nesse PDF. Confira antes de importar.
            </div>
            <div className="flex justify-between items-start gap-3">
              <h3 className="font-bold text-on-surface text-sm">{iaAulaCandidates.length} aula(s) especial(is) detectada(s)</h3>
              <button onClick={() => setIaAulaCandidates(null)} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {iaAulaCandidates.map(c => (
                <div key={c.id} className={`flex items-start gap-2 bg-white border rounded-zela-md p-2.5 ${c.selected ? 'border-outline-variant' : 'border-outline-variant opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={e => setIaAulaCandidates(prev => prev.map(x => (x.id === c.id ? { ...x, selected: e.target.checked } : x)))}
                    className="w-4 h-4 mt-1 accent-indigo-600 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={c.nome}
                      onChange={e => setIaAulaCandidates(prev => prev.map(x => (x.id === c.id ? { ...x, nome: e.target.value } : x)))}
                      className="w-full px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-bold text-on-surface mb-1"
                    />
                    <p className="text-[11px] text-on-surface-variant/70">
                      {c.categoria === 'integral' ? 'Integral' : 'Geral'} · {formatRecorrencia(c)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIaAulaCandidates(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-on-surface font-bold py-2.5 rounded-zela-md transition-all text-sm">
                Cancelar
              </button>
              <button
                onClick={handleConfirmIaAulas}
                disabled={isImportingAulas || iaAulaCandidates.filter(c => c.selected).length === 0}
                className="flex-[2] flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white font-bold py-2.5 rounded-zela-md transition-all active:scale-95 text-sm"
              >
                {isImportingAulas ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Importar {iaAulaCandidates.filter(c => c.selected).length} aula(s)
              </button>
            </div>
          </div>
        )}

        {showAulaForm && (
          <form onSubmit={handleSubmitAula} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface text-sm">{editingAulaId ? 'Editar aula especial' : 'Nova aula especial'}</h3>
              <button type="button" onClick={resetAulaForm} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Nome da aula (ex: Yoga)"
              value={aulaNome}
              onChange={e => setAulaNome(e.target.value)}
              maxLength={100}
              required
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-bold text-on-surface text-sm"
            />

            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Categoria</label>
              <div className="flex gap-2">
                {[{ v: 'geral', l: 'Geral (todos os alunos)' }, { v: 'integral', l: 'Integral' }].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setAulaCategoria(opt.v)}
                    className={`flex-1 py-2.5 px-3 rounded-zela-md text-xs font-bold border-2 transition-all ${aulaCategoria === opt.v ? 'bg-primary text-white border-indigo-600' : 'bg-white text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Frequência</label>
              <div className="flex gap-2">
                {[{ v: 'semanal', l: 'Toda semana' }, { v: 'mensal', l: 'Semana(s) específica(s) do mês' }].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setAulaFrequencia(opt.v)}
                    className={`flex-1 py-2.5 px-3 rounded-zela-md text-xs font-bold border-2 transition-all ${aulaFrequencia === opt.v ? 'bg-primary text-white border-indigo-600' : 'bg-white text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Dia(s) da semana</label>
              <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map(dia => (
                  <button key={dia} type="button" onClick={() => toggleAulaDia(dia)}
                    className={`px-3 py-1.5 rounded-zela-md text-xs font-bold border-2 transition-all ${aulaDiasSemana.includes(dia) ? 'bg-primary text-white border-indigo-600' : 'bg-white text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}>
                    {dia}
                  </button>
                ))}
              </div>
            </div>

            {aulaFrequencia === 'mensal' && (
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Qual(is) semana(s) do mês</label>
                <div className="flex flex-wrap gap-2">
                  {OCORRENCIAS_MES.map(oc => (
                    <button key={oc.value} type="button" onClick={() => toggleAulaOcorrencia(oc.value)}
                      className={`px-3 py-1.5 rounded-zela-md text-xs font-bold border-2 transition-all ${aulaOcorrencias.includes(oc.value) ? 'bg-primary text-white border-indigo-600' : 'bg-white text-on-surface-variant border-outline-variant hover:border-indigo-300'}`}>
                      {oc.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingAula || !aulaNome.trim() || aulaDiasSemana.length === 0 || (aulaFrequencia === 'mensal' && aulaOcorrencias.length === 0)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              {isSavingAula ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingAulaId ? 'Salvar alterações' : 'Adicionar Aula Especial'}
            </button>
          </form>
        )}

        {isLoadingAulas ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : aulas.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <CalendarDays className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhuma aula especial cadastrada ainda.</p>
          </div>
        ) : (
          [{ key: 'geral', label: 'Geral (todos os alunos)' }, { key: 'integral', label: 'Integral' }].map(grupo => {
            const items = aulas.filter(a => a.categoria === grupo.key);
            if (items.length === 0) return null;
            return (
              <div key={grupo.key} className="space-y-2">
                <h3 className="text-[11px] font-extrabold text-on-surface-variant/70 uppercase tracking-wider">{grupo.label}</h3>
                {items.map(aula => (
                  <div
                    key={aula.id}
                    onClick={() => isSelectingAulas && toggleSelectAula(aula.id)}
                    className={`bg-white border rounded-zela-lg p-4 shadow-sm flex justify-between items-center gap-3 ${isSelectingAulas ? 'cursor-pointer' : ''} ${isSelectingAulas && selectedAulaIds.has(aula.id) ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-outline-variant'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isSelectingAulas && (
                        <input
                          type="checkbox"
                          checked={selectedAulaIds.has(aula.id)}
                          onChange={() => toggleSelectAula(aula.id)}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 accent-indigo-600 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <h4 className="font-bold text-on-surface text-sm">{aula.nome}</h4>
                        <p className="text-on-surface-variant text-xs mt-0.5">{formatRecorrencia(aula)}</p>
                      </div>
                    </div>
                    {!isSelectingAulas && (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => handleEditAula(aula)} className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition" title="Editar">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDeleteAula(aula.id)} disabled={deletingAulaId === aula.id} className="p-2 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Excluir">
                          {deletingAulaId === aula.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Excluir evento"
          message="Excluir este evento do calendário? Essa ação não pode ser desfeita."
          isLoading={deletingId === confirmDeleteId}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {confirmDeleteAulaId && (
        <ConfirmModal
          title="Excluir aula especial"
          message="Excluir esta aula especial da grade? Essa ação não pode ser desfeita."
          isLoading={deletingAulaId === confirmDeleteAulaId}
          onConfirm={confirmDeleteAula}
          onCancel={() => setConfirmDeleteAulaId(null)}
        />
      )}

      {confirmBulkDeleteEventos && (
        <ConfirmModal
          title="Excluir eventos selecionados"
          message={`Excluir ${selectedEventoIds.size} evento(s) do calendário? Essa ação não pode ser desfeita.`}
          isLoading={isBulkDeletingEventos}
          onConfirm={handleBulkDeleteEventos}
          onCancel={() => setConfirmBulkDeleteEventos(false)}
        />
      )}

      {confirmBulkDeleteAulas && (
        <ConfirmModal
          title="Excluir aulas especiais selecionadas"
          message={`Excluir ${selectedAulaIds.size} aula(s) especial(is) da grade? Essa ação não pode ser desfeita.`}
          isLoading={isBulkDeletingAulas}
          onConfirm={handleBulkDeleteAulas}
          onCancel={() => setConfirmBulkDeleteAulas(false)}
        />
      )}
    </div>
  );
}
