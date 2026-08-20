import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2, Trash2, Pencil, X, Check, Plus, FileUp, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EVENTO_TIPOS } from '../lib/constants';
import { parseDateTextList } from '../lib/pdfDateListParser';
import { notifyFamilies } from '../lib/notifyFamilies';

const TIPO_BY_VALUE = Object.fromEntries(EVENTO_TIPOS.map(t => [t.value, t]));

const COLOR_CLASSES = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
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

  // Importação de PDF: extrai datas + títulos candidatos e mostra pra revisão
  // antes de gravar em lote — evita que um PDF mal formatado gere lixo direto no
  // calendário sem chance de correção.
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [importCandidates, setImportCandidates] = useState(null); // null = painel fechado
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

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
          message: `${payload.title} — ${formatDateLabel(payload.event_date)}`,
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

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este evento do calendário? Essa ação não pode ser desfeita.')) return;
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
        setImportError('Nenhuma data foi encontrada nesse PDF. Ele pode estar em formato de imagem (não é possível extrair texto automaticamente) — cadastre os eventos manualmente.');
        return;
      }
      setImportCandidates(candidates.map((c, i) => ({ ...c, id: i, selected: true, event_type: 'geral' })));
    } catch (err) {
      console.error('[AdminCalendario] Erro ao processar PDF:', err);
      setImportError('Não foi possível ler esse PDF.');
    } finally {
      setIsParsingPdf(false);
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
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <CalendarDays size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Calendário</h2>
            <p className="text-slate-500 text-sm hidden sm:block">Adicione, edite e remova eventos do calendário escolar.</p>
          </div>
        </div>
        {!showForm && !importCandidates && (
          <div className="flex gap-2">
            <label className={`flex items-center gap-2 bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm cursor-pointer ${isParsingPdf ? 'opacity-60 pointer-events-none' : ''}`}>
              {isParsingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
              <span className="hidden sm:inline">{isParsingPdf ? 'Lendo PDF...' : 'Importar PDF'}</span>
              <input type="file" accept="application/pdf" onChange={handlePdfSelected} className="hidden" disabled={isParsingPdf} />
            </label>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
            >
              <Plus size={18} /> <span className="hidden sm:inline">Novo Evento</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {importError && !importCandidates && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-sm font-medium flex gap-2 items-start">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {importError}
          </div>
        )}

        {importCandidates && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Revisar eventos encontrados no PDF</h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  {importCandidates.length} evento(s) detectado(s). Confira as datas e títulos antes de importar — a extração automática pode errar em PDFs com layout complexo.
                </p>
              </div>
              <button onClick={() => setImportCandidates(null)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition shrink-0">
                <X size={18} />
              </button>
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{importError}</div>
            )}

            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {importCandidates.map(c => (
                <div key={c.id} className={`flex items-center gap-2 bg-white border rounded-xl p-2.5 ${c.selected ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
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
                    className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shrink-0"
                  />
                  <input
                    type="text"
                    value={c.title}
                    onChange={e => updateCandidate(c.id, { title: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                  />
                  <select
                    value={c.event_type}
                    onChange={e => updateCandidate(c.id, { event_type: e.target.value })}
                    className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shrink-0"
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
                onClick={() => setImportCandidates(null)}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 rounded-xl transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isImporting || selectedImportCount === 0}
                className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-2.5 rounded-xl transition-all active:scale-95 text-sm"
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Importar {selectedImportCount} evento(s)
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">{editingId ? 'Editar evento' : 'Novo evento'}</h3>
              <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition">
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
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-sm"
            />

            <textarea
              placeholder="Descrição (opcional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm resize-none"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Data</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tipo</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 text-sm"
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
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editingId ? 'Salvar alterações' : 'Adicionar Evento'}
            </button>
          </form>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : eventos.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CalendarDays className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhum evento cadastrado ainda.</p>
          </div>
        ) : (
          eventos.map(ev => {
            const tipo = TIPO_BY_VALUE[ev.event_type] || TIPO_BY_VALUE.geral;
            const isPast = ev.event_date < todayStr;
            return (
              <div key={ev.id} className={`bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm ${isPast ? 'opacity-60' : ''}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-800">{ev.title}</h4>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${COLOR_CLASSES[tipo.color]}`}>
                        {tipo.label}
                      </span>
                      {ev.event_date === todayStr && (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-indigo-600 text-white">Hoje</span>
                      )}
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5 capitalize">{formatDateLabel(ev.event_date)}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleEdit(ev)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      title="Editar"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={deletingId === ev.id}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="Excluir"
                    >
                      {deletingId === ev.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
                {ev.description && (
                  <p className="text-slate-600 text-sm mt-3 whitespace-pre-wrap">{ev.description}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
