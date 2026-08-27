import React, { useEffect, useState } from 'react';
import { UtensilsCrossed, Loader2, Trash2, Pencil, X, Check, Plus, FileUp, ImageUp, AlertTriangle, ArrowLeft, Calendar, Download, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { REFEICOES } from '../lib/constants';
import { parseDateTextList } from '../lib/pdfDateListParser';
import { parseCardapioImageGrid } from '../lib/imageCardapioParser';
import { parseCardapioComIA, expandCardapiosToCandidates } from '../lib/cardapioIaParser';
import { notifyFamilies } from '../lib/notifyFamilies';
import ConfirmModal from './ConfirmModal';

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getCardapioStatus(cardapio, todayStr) {
  const { ativacao_date, desativacao_date } = cardapio;
  if (ativacao_date && todayStr < ativacao_date) return { label: 'Agendado', color: 'amber' };
  if (desativacao_date && todayStr > desativacao_date) return { label: 'Expirado', color: 'slate' };
  return { label: 'Ativo', color: 'green' };
}

const STATUS_CLASSES = {
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  slate: 'bg-surface-container text-on-surface-variant border-outline-variant',
};

// Tenta identificar a refeição a partir do texto (útil na importação de PDF, onde a
// linha pode conter a refeição junto com a descrição, ex: "Almoço: Arroz e feijão").
function guessRefeicao(text) {
  const lower = text.toLowerCase();
  if (lower.includes('desjejum') || lower.includes('café') || lower.includes('cafe')) return 'Desjejum';
  if (lower.includes('jantar')) return 'Jantar';
  if (lower.includes('almoço') || lower.includes('almoco')) return 'Almoço';
  if (lower.includes('lanche') || lower.includes('colação') || lower.includes('colacao')) return 'Lanche';
  return REFEICOES[0];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Semana operacional da escola: Segunda a Sábado (o sábado "fecha" a semana, conforme
// o fluxo que a escola já usa hoje pra alternar manualmente entre semanas).
function getWeekBounds(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay(); // 0=domingo .. 6=sábado
  const diffToMonday = dow === 0 ? 1 : (1 - dow);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const fmt = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  return { start: fmt(monday), end: fmt(saturday) };
}

// Agrupa candidatos (data + descrição) em blocos semanais (Segunda a Sábado),
// numerados em ordem cronológica — vira "Semana 1", "Semana 2" etc.
function groupCandidatesByWeek(candidates) {
  const byWeekStart = new Map();
  for (const c of candidates) {
    const { start, end } = getWeekBounds(c.date);
    if (!byWeekStart.has(start)) byWeekStart.set(start, { weekStart: start, weekEnd: end, items: [] });
    byWeekStart.get(start).items.push(c);
  }
  const weeks = [...byWeekStart.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  weeks.forEach((w, i) => {
    w.id = i;
    w.titulo = `Semana ${i + 1} (${formatDateShort(w.weekStart)} a ${formatDateShort(w.weekEnd)})`;
  });
  return weeks;
}

export default function AdminCardapio({ currentUser, currentSchool }) {
  const [cardapios, setCardapios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitulo, setNewTitulo] = useState('');
  const [newAtivacao, setNewAtivacao] = useState('');
  const [newDesativacao, setNewDesativacao] = useState('');
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [deletingCardapioId, setDeletingCardapioId] = useState(null);
  const [confirmDeleteCardapioId, setConfirmDeleteCardapioId] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [isModeloMenuOpen, setIsModeloMenuOpen] = useState(false);

  // Importação de mês completo: sobe um PDF/imagem com várias semanas e o sistema
  // já separa em um cardápio por semana (Segunda a Sábado), cada um com sua própria
  // data de ativação/desativação — troca automática, sem precisar mexer toda semana.
  const [isParsingMonthPdf, setIsParsingMonthPdf] = useState(false);
  const [isParsingMonthImage, setIsParsingMonthImage] = useState(false);
  const [monthImageProgress, setMonthImageProgress] = useState(0);
  const [monthImportError, setMonthImportError] = useState('');
  const [weekGroups, setWeekGroups] = useState(null);
  const [weekGroupsFromIA, setWeekGroupsFromIA] = useState(false);
  const [isImportingMonth, setIsImportingMonth] = useState(false);

  // Importação com IA (Grok): lê PDF em formato de tabela livre (dia da
  // semana × refeição, sem data no texto — ex: cardápio real da
  // nutricionista com "Cardápio 1/2/3/4" em rotação). Depois de a IA ler,
  // o admin escolhe a partir de qual segunda-feira aplicar (e até quando);
  // o resto do fluxo (revisão semanal, confirmação) reaproveita o mesmo
  // weekGroups/handleConfirmMonthImport de baixo.
  const [isParsingIA, setIsParsingIA] = useState(false);
  const [iaError, setIaError] = useState('');
  const [iaCardapios, setIaCardapios] = useState(null);
  const [iaStartMonday, setIaStartMonday] = useState('');
  const [iaEndDate, setIaEndDate] = useState('');

  const schoolId = currentSchool?.id || currentUser?.school_id;
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const fetchCardapios = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('cardapios')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setCardapios(data || []);
    } catch (err) {
      console.error('[AdminCardapio] Erro ao buscar cardápios:', err);
      setError('Não foi possível carregar os cardápios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCardapios();
  }, [schoolId]);

  const handleCreateCardapio = async (e) => {
    e.preventDefault();
    if (!newTitulo.trim() || !schoolId) return;
    setIsSavingNew(true);
    setError('');
    try {
      const { data, error: insertError } = await supabase
        .from('cardapios')
        .insert({
          school_id: schoolId,
          titulo: newTitulo.trim(),
          ativacao_date: newAtivacao || null,
          desativacao_date: newDesativacao || null,
          created_by: currentUser.id,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      notifyFamilies({
        type: 'cardapio',
        title: 'Novo cardápio publicado',
        message: newTitulo.trim(),
        url: '/?tab=cardapio',
      });

      setCardapios(prev => [data, ...prev]);
      setShowNewForm(false);
      setNewTitulo('');
      setNewAtivacao('');
      setNewDesativacao('');
      setSelectedId(data.id);
    } catch (err) {
      console.error('[AdminCardapio] Erro ao criar cardápio:', err);
      setError('Não foi possível criar o cardápio.');
    } finally {
      setIsSavingNew(false);
    }
  };

  const handleDeleteCardapio = (id) => setConfirmDeleteCardapioId(id);

  const confirmDeleteCardapio = async () => {
    const id = confirmDeleteCardapioId;
    setDeletingCardapioId(id);
    try {
      const { error: deleteError } = await supabase.from('cardapios').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setCardapios(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      console.error('[AdminCardapio] Erro ao excluir cardápio:', err);
      setError('Não foi possível excluir o cardápio.');
    } finally {
      setDeletingCardapioId(null);
      setConfirmDeleteCardapioId(null);
    }
  };

  // Botão único "Importar" — aceita tanto o PDF exportado a partir do
  // Modelo quanto uma foto/print da tabela, e decide o parser certo pelo
  // tipo do arquivo escolhido.
  const handleMonthFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type === 'application/pdf') {
      setIsParsingMonthPdf(true);
      setMonthImportError('');
      try {
        const candidates = await parseDateTextList(file, { mergeContinuationLines: true });
        if (candidates.length === 0) {
          setMonthImportError('Nenhuma data foi encontrada nesse PDF.');
          return;
        }
        setWeekGroups(groupCandidatesByWeek(candidates.map((c, i) => ({
          id: i,
          date: c.date,
          descricao: c.title,
          refeicao: guessRefeicao(c.title),
          selected: true,
        }))));
        setWeekGroupsFromIA(false);
      } catch (err) {
        console.error('[AdminCardapio] Erro ao processar PDF do mês:', err);
        setMonthImportError('Não foi possível ler esse PDF.');
      } finally {
        setIsParsingMonthPdf(false);
      }
      return;
    }

    if (file.type.startsWith('image/')) {
      setIsParsingMonthImage(true);
      setMonthImageProgress(0);
      setMonthImportError('');
      try {
        const candidates = await parseCardapioImageGrid(file, { onProgress: setMonthImageProgress });
        if (candidates.length === 0) {
          setMonthImportError('Não foi possível reconhecer nenhuma data nessa imagem.');
          return;
        }
        setWeekGroups(groupCandidatesByWeek(candidates.map((c, i) => ({
          id: i,
          date: c.date,
          descricao: c.descricao,
          refeicao: c.refeicao || guessRefeicao(c.descricao),
          selected: true,
        }))));
        setWeekGroupsFromIA(false);
      } catch (err) {
        console.error('[AdminCardapio] Erro ao processar imagem do mês:', err);
        setMonthImportError('Não foi possível processar essa imagem.');
      } finally {
        setIsParsingMonthImage(false);
      }
      return;
    }

    setMonthImportError('Selecione um PDF ou uma imagem (JPG, PNG, etc).');
  };

  // Próxima segunda-feira a partir de hoje — sugestão inicial pro campo de
  // data de início da importação com IA.
  const getNextMonday = () => {
    const d = new Date(`${todayStr}T12:00:00`);
    const dow = d.getDay();
    const diff = dow === 1 ? 0 : ((8 - dow) % 7 || 7);
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const handleIaFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setIaError('Selecione um arquivo PDF.');
      return;
    }
    setIsParsingIA(true);
    setIaError('');
    try {
      const result = await parseCardapioComIA(file);
      if (!result.cardapios || result.cardapios.length === 0) {
        setIaError('A IA não identificou nenhum cardápio nesse PDF.');
        return;
      }
      setIaCardapios(result.cardapios);
      const start = getNextMonday();
      setIaStartMonday(start);
      const endSuggested = new Date(`${start}T12:00:00`);
      endSuggested.setDate(endSuggested.getDate() + result.cardapios.length * 7 - 2);
      setIaEndDate(`${endSuggested.getFullYear()}-${pad2(endSuggested.getMonth() + 1)}-${pad2(endSuggested.getDate())}`);
    } catch (err) {
      console.error('[AdminCardapio] Erro ao importar com IA:', err);
      setIaError(err.message || 'Não foi possível processar esse PDF com a IA.');
    } finally {
      setIsParsingIA(false);
    }
  };

  const handleConfirmIaDates = () => {
    if (!iaCardapios || !iaStartMonday || !iaEndDate) return;
    const candidates = expandCardapiosToCandidates(iaCardapios, iaStartMonday, iaEndDate);
    if (candidates.length === 0) {
      setIaError('Nenhum item ficou dentro do período escolhido — ajuste as datas.');
      return;
    }
    setWeekGroups(groupCandidatesByWeek(candidates));
    setWeekGroupsFromIA(true);
    setIaCardapios(null);
  };

  const updateWeekGroup = (weekId, patch) => {
    setWeekGroups(prev => prev.map(w => (w.id === weekId ? { ...w, ...patch } : w)));
  };

  const updateWeekItem = (weekId, itemId, patch) => {
    setWeekGroups(prev => prev.map(w => {
      if (w.id !== weekId) return w;
      return { ...w, items: w.items.map(it => (it.id === itemId ? { ...it, ...patch } : it)) };
    }));
  };

  const handleConfirmMonthImport = async () => {
    const groupsToImport = (weekGroups || [])
      .map(w => ({ ...w, items: w.items.filter(it => it.selected && it.descricao.trim() && it.date) }))
      .filter(w => w.items.length > 0 && w.titulo.trim());
    if (groupsToImport.length === 0) return;

    setIsImportingMonth(true);
    setMonthImportError('');
    try {
      for (const week of groupsToImport) {
        const { data: novoCardapio, error: insertCardapioError } = await supabase
          .from('cardapios')
          .insert({
            school_id: schoolId,
            titulo: week.titulo.trim(),
            ativacao_date: week.weekStart,
            desativacao_date: week.weekEnd,
            created_by: currentUser.id,
          })
          .select()
          .single();
        if (insertCardapioError) throw insertCardapioError;

        const rows = week.items.map(it => ({
          cardapio_id: novoCardapio.id,
          event_date: it.date,
          refeicao: it.refeicao,
          descricao: it.descricao.trim(),
        }));
        const { error: insertItensError } = await supabase
          .from('cardapio_itens')
          .upsert(rows, { onConflict: 'cardapio_id,event_date,refeicao' });
        if (insertItensError) throw insertItensError;
      }

      notifyFamilies({
        type: 'cardapio',
        title: `Cardápio atualizado (${groupsToImport.length} semana(s))`,
        message: 'A escola importou um novo cardápio.',
        url: '/?tab=cardapio',
      });

      setWeekGroups(null);
      setWeekGroupsFromIA(false);
      await fetchCardapios();
    } catch (err) {
      console.error('[AdminCardapio] Erro ao importar o mês:', err);
      setMonthImportError('Não foi possível concluir a importação. Alguns cardápios podem já ter sido criados — confira a lista.');
    } finally {
      setIsImportingMonth(false);
    }
  };

  const totalSelectedInMonth = (weekGroups || []).reduce((sum, w) => sum + w.items.filter(i => i.selected).length, 0);

  const selectedCardapio = cardapios.find(c => c.id === selectedId) || null;

  if (selectedCardapio) {
    return (
      <CardapioDetail
        cardapio={selectedCardapio}
        currentUser={currentUser}
        onBack={() => setSelectedId(null)}
        onCardapioUpdated={(patch) => setCardapios(prev => prev.map(c => (c.id === selectedCardapio.id ? { ...c, ...patch } : c)))}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
            <UtensilsCrossed size={22} />
          </div>
          <div>
            <h2 className="text-h3 text-on-surface">Cardápio</h2>
            <p className="text-on-surface-variant text-small hidden sm:block">Crie cardápios mensais, com período de ativação opcional.</p>
          </div>
        </div>
        {!showNewForm && !weekGroups && !iaCardapios && (
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 sm:justify-end">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModeloMenuOpen(v => !v)}
                className="flex items-center justify-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm w-full"
              >
                <Download size={18} className="shrink-0" />
                <span className="truncate">Modelo</span>
              </button>
              {isModeloMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsModeloMenuOpen(false)} />
                  <div className="absolute z-20 mt-1.5 w-64 bg-white border border-outline-variant rounded-zela-md shadow-lg overflow-hidden right-0">
                    <a
                      href="/modelos/Modelo_Cardapio_Simples_Zela.docx"
                      download
                      onClick={() => setIsModeloMenuOpen(false)}
                      className="block px-4 py-3 hover:bg-primary/10 transition"
                    >
                      <div className="text-sm font-bold text-on-surface">Simples</div>
                      <div className="text-xs text-on-surface-variant/70 mt-0.5">Tabela rápida — ideal pra nutricionista preencher</div>
                    </a>
                    <a
                      href="/modelos/Modelo_Cardapio_Mensal_Zela.docx"
                      download
                      onClick={() => setIsModeloMenuOpen(false)}
                      className="block px-4 py-3 hover:bg-primary/10 transition border-t border-outline-variant"
                    >
                      <div className="text-sm font-bold text-on-surface">Completo</div>
                      <div className="text-xs text-on-surface-variant/70 mt-0.5">Com instruções e mês inteiro de exemplo</div>
                    </a>
                  </div>
                </>
              )}
            </div>
            <label className={`flex items-center justify-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm cursor-pointer ${(isParsingMonthPdf || isParsingMonthImage) ? 'opacity-60 pointer-events-none' : ''}`}>
              {(isParsingMonthPdf || isParsingMonthImage) ? <Loader2 size={18} className="animate-spin shrink-0" /> : <FileUp size={18} className="shrink-0" />}
              <span className="truncate">
                {isParsingMonthPdf ? 'Lendo PDF...' : isParsingMonthImage ? `Lendo imagem... ${Math.round(monthImageProgress * 100)}%` : 'Importar'}
              </span>
              <input type="file" accept="application/pdf,image/*" onChange={handleMonthFileSelected} className="hidden" disabled={isParsingMonthPdf || isParsingMonthImage} />
            </label>
            <label
              className={`flex items-center justify-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm cursor-pointer ${isParsingIA ? 'opacity-60 pointer-events-none' : ''}`}
              title="Lê qualquer PDF de cardápio (tabela dia x refeição) usando IA, sem precisar seguir o modelo"
            >
              {isParsingIA ? <Loader2 size={18} className="animate-spin shrink-0" /> : <Sparkles size={18} className="shrink-0" />}
              <span className="truncate">{isParsingIA ? 'Lendo com IA...' : 'Importar com IA'}</span>
              <input type="file" accept="application/pdf" onChange={handleIaFileSelected} className="hidden" disabled={isParsingIA} />
            </label>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              <Plus size={18} className="shrink-0" /> Novo Cardápio
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {monthImportError && !weekGroups && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-zela-md text-sm font-medium flex gap-2 items-start">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {monthImportError}
          </div>
        )}

        {iaError && !iaCardapios && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-zela-md text-sm font-medium flex gap-2 items-start">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {iaError}
          </div>
        )}

        {iaCardapios && (
          <div className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-4">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="font-bold text-on-surface text-sm flex items-center gap-1.5"><Sparkles size={15} className="text-primary" /> A IA leu {iaCardapios.length} cardápio(s) nesse PDF</h3>
                <p className="text-on-surface-variant text-xs mt-0.5">
                  Esse cardápio não tem datas — só dias da semana. Escolha a partir de quando ele começa a valer; o sistema aplica os {iaCardapios.length} cardápio(s) em sequência, repetindo até a data final.
                </p>
              </div>
              <button onClick={() => { setIaCardapios(null); setIaError(''); }} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition shrink-0">
                <X size={18} />
              </button>
            </div>

            {iaError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{iaError}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Começa na segunda-feira</label>
                <input type="date" value={iaStartMonday} onChange={e => setIaStartMonday(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Repete até</label>
                <input type="date" value={iaEndDate} onChange={e => setIaEndDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm" />
              </div>
            </div>

            <button
              onClick={handleConfirmIaDates}
              disabled={!iaStartMonday || !iaEndDate}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white font-bold py-2.5 rounded-zela-md transition-all active:scale-95 text-sm"
            >
              <Check size={16} /> Gerar semanas pra revisão
            </button>
          </div>
        )}

        {weekGroups && (
          <div className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-4">
            {weekGroupsFromIA && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-zela-md text-xs font-medium flex gap-2 items-start">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                Esses itens foram lidos por IA e podem conter erros — nada foi publicado ainda. Confira e corrija cada linha com atenção antes de confirmar; só depois disso o cardápio fica visível pras famílias.
              </div>
            )}
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="font-bold text-on-surface text-sm">Revisar importação do mês — {weekGroups.length} semana(s) detectada(s)</h3>
                <p className="text-on-surface-variant text-xs mt-0.5">
                  Cada semana vira um cardápio separado, já com ativação na segunda e desativação no sábado. Confira antes de confirmar.
                </p>
              </div>
              <button onClick={() => { setWeekGroups(null); setWeekGroupsFromIA(false); }} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition shrink-0">
                <X size={18} />
              </button>
            </div>

            {monthImportError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{monthImportError}</div>
            )}

            <div className="max-h-[55vh] overflow-y-auto space-y-4">
              {weekGroups.map(week => (
                <div key={week.id} className="bg-white border border-outline-variant rounded-zela-md p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      type="text"
                      value={week.titulo}
                      onChange={e => updateWeekGroup(week.id, { titulo: e.target.value })}
                      className="flex-1 min-w-0 px-2.5 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-bold text-on-surface"
                    />
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface-variant shrink-0">
                      <input type="date" value={week.weekStart} onChange={e => updateWeekGroup(week.id, { weekStart: e.target.value })}
                        className="px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg" />
                      <span>até</span>
                      <input type="date" value={week.weekEnd} onChange={e => updateWeekGroup(week.id, { weekEnd: e.target.value })}
                        className="px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {week.items.map(item => (
                      <div key={item.id} className={`flex items-center gap-2 rounded-lg p-1.5 ${item.selected ? '' : 'opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={e => updateWeekItem(week.id, item.id, { selected: e.target.checked })}
                          className="w-3.5 h-3.5 accent-indigo-600 shrink-0"
                        />
                        <input
                          type="date"
                          value={item.date}
                          onChange={e => updateWeekItem(week.id, item.id, { date: e.target.value })}
                          className="px-1.5 py-1 bg-surface-container-low border border-outline-variant rounded-md text-[10px] font-semibold text-on-surface shrink-0"
                        />
                        <select
                          value={item.refeicao}
                          onChange={e => updateWeekItem(week.id, item.id, { refeicao: e.target.value })}
                          className="px-1.5 py-1 bg-surface-container-low border border-outline-variant rounded-md text-[10px] font-semibold text-on-surface shrink-0"
                        >
                          {REFEICOES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={e => updateWeekItem(week.id, item.id, { descricao: e.target.value })}
                          className="flex-1 min-w-0 px-1.5 py-1 bg-surface-container-low border border-outline-variant rounded-md text-[10px] text-on-surface"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setWeekGroups(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-on-surface font-bold py-2.5 rounded-zela-md transition-all text-sm">
                Cancelar
              </button>
              <button
                onClick={handleConfirmMonthImport}
                disabled={isImportingMonth || totalSelectedInMonth === 0}
                className="flex-[2] flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white font-bold py-2.5 rounded-zela-md transition-all active:scale-95 text-sm"
              >
                {isImportingMonth ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Criar {weekGroups.filter(w => w.items.some(i => i.selected)).length} cardápio(s) semanal(is)
              </button>
            </div>
          </div>
        )}

        {showNewForm && (
          <form onSubmit={handleCreateCardapio} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface text-sm">Novo cardápio</h3>
              <button type="button" onClick={() => setShowNewForm(false)} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Título (ex: Cardápio de Março 2026)"
              value={newTitulo}
              onChange={e => setNewTitulo(e.target.value)}
              maxLength={150}
              required
              className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-bold text-on-surface text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Ativação (opcional)</label>
                <input
                  type="date"
                  value={newAtivacao}
                  onChange={e => setNewAtivacao(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Desativação (opcional)</label>
                <input
                  type="date"
                  value={newDesativacao}
                  onChange={e => setNewDesativacao(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary font-semibold text-on-surface text-sm"
                />
              </div>
            </div>
            <p className="text-[11px] text-on-surface-variant/70">Deixe em branco pra não limitar o período — o cardápio fica sempre ativo (ou até você editar depois).</p>
            <button
              type="submit"
              disabled={isSavingNew || !newTitulo.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white px-5 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm"
            >
              {isSavingNew ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Criar e Adicionar Itens
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
        ) : cardapios.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <UtensilsCrossed className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum cardápio cadastrado ainda.</p>
          </div>
        ) : (
          cardapios.map(c => {
            const status = getCardapioStatus(c, todayStr);
            const periodo = c.ativacao_date || c.desativacao_date
              ? `${formatDateShort(c.ativacao_date) || 'Início imediato'} → ${formatDateShort(c.desativacao_date) || 'Sem fim definido'}`
              : 'Sem período definido';
            return (
              <div key={c.id} className="bg-white border border-outline-variant rounded-zela-lg p-4 sm:p-5 shadow-sm flex justify-between items-center gap-3">
                <button onClick={() => setSelectedId(c.id)} className="min-w-0 text-left flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-on-surface">{c.titulo}</h4>
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${STATUS_CLASSES[status.color]}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-xs mt-0.5 flex items-center gap-1"><Calendar size={11} /> {periodo}</p>
                </button>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                    title="Abrir"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteCardapio(c.id)}
                    disabled={deletingCardapioId === c.id}
                    className="p-2 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Excluir"
                  >
                    {deletingCardapioId === c.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {confirmDeleteCardapioId && (
        <ConfirmModal
          title="Excluir cardápio"
          message="Excluir este cardápio e todos os seus itens? Essa ação não pode ser desfeita."
          isLoading={deletingCardapioId === confirmDeleteCardapioId}
          onConfirm={confirmDeleteCardapio}
          onCancel={() => setConfirmDeleteCardapioId(null)}
        />
      )}
    </div>
  );
}

// ── Detalhe de um cardápio: título/período editáveis + itens (data/refeição/descrição) ──
function CardapioDetail({ cardapio, onBack, onCardapioUpdated }) {
  const [itens, setItens] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [titulo, setTitulo] = useState(cardapio.titulo);
  const [ativacao, setAtivacao] = useState(cardapio.ativacao_date || '');
  const [desativacao, setDesativacao] = useState(cardapio.desativacao_date || '');
  const [isSavingHeader, setIsSavingHeader] = useState(false);

  const [newDate, setNewDate] = useState('');
  const [newRefeicao, setNewRefeicao] = useState(REFEICOES[0]);
  const [newDescricao, setNewDescricao] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);

  const [editingItemId, setEditingItemId] = useState(null);
  const [editDescricao, setEditDescricao] = useState('');
  const [deletingItemId, setDeletingItemId] = useState(null);

  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [importCandidates, setImportCandidates] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const fetchItens = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('cardapio_itens')
        .select('*')
        .eq('cardapio_id', cardapio.id)
        .order('event_date', { ascending: true });
      if (fetchError) throw fetchError;
      setItens(data || []);
    } catch (err) {
      console.error('[CardapioDetail] Erro ao buscar itens:', err);
      setError('Não foi possível carregar os itens do cardápio.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItens();
  }, [cardapio.id]);

  const handleSaveHeader = async () => {
    if (!titulo.trim()) return;
    setIsSavingHeader(true);
    setError('');
    try {
      const patch = { titulo: titulo.trim(), ativacao_date: ativacao || null, desativacao_date: desativacao || null, updated_at: new Date().toISOString() };
      const { error: updateError } = await supabase.from('cardapios').update(patch).eq('id', cardapio.id);
      if (updateError) throw updateError;

      // Sem notifyFamilies aqui de propósito: título/ativação/desativação
      // são 3 campos que salvam (onBlur) de forma independente — notificar
      // a cada um gerava várias notificações repetidas pra família por uma
      // única edição de cabeçalho. Só "lançar" cardápio de verdade (criar
      // novo ou importar) deve notificar — ver handleCreateCardapio e
      // handleConfirmMonthImport.
      onCardapioUpdated(patch);
    } catch (err) {
      console.error('[CardapioDetail] Erro ao salvar cardápio:', err);
      setError('Não foi possível salvar as alterações do cardápio.');
    } finally {
      setIsSavingHeader(false);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newDate || !newDescricao.trim()) return;
    setIsAddingItem(true);
    setError('');
    try {
      const { data, error: insertError } = await supabase
        .from('cardapio_itens')
        .upsert(
          { cardapio_id: cardapio.id, event_date: newDate, refeicao: newRefeicao, descricao: newDescricao.trim() },
          { onConflict: 'cardapio_id,event_date,refeicao' }
        )
        .select()
        .single();
      if (insertError) throw insertError;
      setItens(prev => {
        const withoutDup = prev.filter(i => !(i.event_date === data.event_date && i.refeicao === data.refeicao));
        return [...withoutDup, data].sort((a, b) => a.event_date.localeCompare(b.event_date));
      });
      setNewDescricao('');
    } catch (err) {
      console.error('[CardapioDetail] Erro ao adicionar item:', err);
      setError('Não foi possível adicionar esse item.');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleSaveEdit = async (item) => {
    if (!editDescricao.trim()) return;
    try {
      const { error: updateError } = await supabase
        .from('cardapio_itens')
        .update({ descricao: editDescricao.trim() })
        .eq('id', item.id);
      if (updateError) throw updateError;
      setItens(prev => prev.map(i => (i.id === item.id ? { ...i, descricao: editDescricao.trim() } : i)));
      setEditingItemId(null);
    } catch (err) {
      console.error('[CardapioDetail] Erro ao editar item:', err);
      setError('Não foi possível salvar essa edição.');
    }
  };

  const handleDeleteItem = async (id) => {
    setDeletingItemId(id);
    try {
      const { error: deleteError } = await supabase.from('cardapio_itens').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setItens(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('[CardapioDetail] Erro ao excluir item:', err);
      setError('Não foi possível excluir esse item.');
    } finally {
      setDeletingItemId(null);
    }
  };

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
      const candidates = await parseDateTextList(file, { mergeContinuationLines: true });
      if (candidates.length === 0) {
        setImportError('Nenhuma data foi encontrada nesse PDF. Se ele for uma tabela/imagem, cadastre os itens manualmente.');
        return;
      }
      setImportCandidates(candidates.map((c, i) => ({
        id: i,
        date: c.date,
        descricao: c.title,
        refeicao: guessRefeicao(c.title),
        selected: true,
      })));
    } catch (err) {
      console.error('[CardapioDetail] Erro ao processar PDF:', err);
      setImportError('Não foi possível ler esse PDF.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleImageSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImportError('Selecione uma imagem (JPG, PNG, etc).');
      return;
    }
    setIsParsingImage(true);
    setImageProgress(0);
    setImportError('');
    try {
      const candidates = await parseCardapioImageGrid(file, { onProgress: setImageProgress });
      if (candidates.length === 0) {
        setImportError('Não foi possível reconhecer nenhuma data nessa imagem. Tente uma foto/print mais nítido, ou cadastre os itens manualmente.');
        return;
      }
      setImportCandidates(candidates.map((c, i) => ({
        id: i,
        date: c.date,
        descricao: c.descricao,
        refeicao: c.refeicao || guessRefeicao(c.descricao),
        selected: true,
      })));
    } catch (err) {
      console.error('[CardapioDetail] Erro ao processar imagem:', err);
      setImportError('Não foi possível processar essa imagem.');
    } finally {
      setIsParsingImage(false);
    }
  };

  const updateCandidate = (id, patch) => {
    setImportCandidates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleConfirmImport = async () => {
    const toImport = (importCandidates || []).filter(c => c.selected && c.descricao.trim() && c.date);
    if (toImport.length === 0) return;
    setIsImporting(true);
    setImportError('');
    try {
      const rows = toImport.map(c => ({
        cardapio_id: cardapio.id,
        event_date: c.date,
        refeicao: c.refeicao,
        descricao: c.descricao.trim(),
      }));
      const { error: insertError } = await supabase
        .from('cardapio_itens')
        .upsert(rows, { onConflict: 'cardapio_id,event_date,refeicao' });
      if (insertError) throw insertError;
      setImportCandidates(null);
      await fetchItens();
    } catch (err) {
      console.error('[CardapioDetail] Erro ao importar itens:', err);
      setImportError('Não foi possível importar os itens.');
    } finally {
      setIsImporting(false);
    }
  };

  const selectedImportCount = (importCandidates || []).filter(c => c.selected).length;

  // Agrupa por data pra exibição
  const groups = [];
  let currentDate = null;
  itens.forEach(item => {
    if (item.event_date !== currentDate) {
      groups.push({ date: item.event_date, items: [] });
      currentDate = item.event_date;
    }
    groups[groups.length - 1].items.push(item);
  });

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-outline-variant shrink-0 space-y-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition">
          <ArrowLeft size={14} /> Voltar aos cardápios
        </button>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Título</label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              onBlur={handleSaveHeader}
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white font-bold text-on-surface text-sm transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Ativação</label>
            <input
              type="date"
              value={ativacao}
              onChange={e => setAtivacao(e.target.value)}
              onBlur={handleSaveHeader}
              className="px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white font-semibold text-on-surface text-sm transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">Desativação</label>
            <input
              type="date"
              value={desativacao}
              onChange={e => setDesativacao(e.target.value)}
              onBlur={handleSaveHeader}
              className="px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white font-semibold text-on-surface text-sm transition"
            />
          </div>
          {isSavingHeader && <Loader2 size={16} className="animate-spin text-primary mb-2.5" />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{error}</div>
        )}

        {/* Importar PDF / Imagem */}
        {!importCandidates && (
          <div className="flex justify-end gap-2 flex-wrap">
            <label className={`flex items-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm cursor-pointer ${(isParsingPdf || isParsingImage) ? 'opacity-60 pointer-events-none' : ''}`}>
              {isParsingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
              {isParsingPdf ? 'Lendo PDF...' : 'Importar PDF'}
              <input type="file" accept="application/pdf" onChange={handlePdfSelected} className="hidden" disabled={isParsingPdf || isParsingImage} />
            </label>
            <label className={`flex items-center gap-2 bg-white border border-outline-variant hover:border-indigo-300 text-on-surface-variant hover:text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm cursor-pointer ${(isParsingPdf || isParsingImage) ? 'opacity-60 pointer-events-none' : ''}`}>
              {isParsingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageUp size={18} />}
              {isParsingImage ? `Lendo imagem... ${Math.round(imageProgress * 100)}%` : 'Importar Imagem'}
              <input type="file" accept="image/*" onChange={handleImageSelected} className="hidden" disabled={isParsingPdf || isParsingImage} />
            </label>
          </div>
        )}
        {importError && !importCandidates && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-zela-md text-sm font-medium flex gap-2 items-start">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {importError}
          </div>
        )}

        {importCandidates && (
          <div className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="font-bold text-on-surface text-sm">Revisar itens encontrados</h3>
                <p className="text-on-surface-variant text-xs mt-0.5">
                  {importCandidates.length} item(ns) detectado(s). Confira data, refeição e descrição antes de importar — a leitura automática pode errar, principalmente em imagens.
                </p>
              </div>
              <button onClick={() => setImportCandidates(null)} className="p-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-slate-200 rounded-lg transition shrink-0">
                <X size={18} />
              </button>
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-zela-md text-sm font-medium">{importError}</div>
            )}

            <div className="max-h-[45vh] overflow-y-auto space-y-2">
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
                  <select
                    value={c.refeicao}
                    onChange={e => updateCandidate(c.id, { refeicao: e.target.value })}
                    className="px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-semibold text-on-surface shrink-0"
                  >
                    {REFEICOES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input
                    type="text"
                    value={c.descricao}
                    onChange={e => updateCandidate(c.id, { descricao: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setImportCandidates(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-on-surface font-bold py-2.5 rounded-zela-md transition-all text-sm">
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isImporting || selectedImportCount === 0}
                className="flex-[2] flex items-center justify-center gap-2 bg-primary hover:bg-primary-container disabled:bg-slate-300 disabled:text-on-surface-variant text-white font-bold py-2.5 rounded-zela-md transition-all active:scale-95 text-sm"
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Importar {selectedImportCount} item(ns)
              </button>
            </div>
          </div>
        )}

        {/* Adicionar item manualmente */}
        <form onSubmit={handleAddItem} className="bg-surface-container-low border border-outline-variant rounded-zela-lg p-4 flex flex-col sm:flex-row gap-2 sm:items-end">
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Data</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required
              className="px-3 py-2 bg-white border border-outline-variant rounded-zela-md text-xs font-semibold text-on-surface" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Refeição</label>
            <select value={newRefeicao} onChange={e => setNewRefeicao(e.target.value)}
              className="px-3 py-2 bg-white border border-outline-variant rounded-zela-md text-xs font-semibold text-on-surface">
              {REFEICOES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wide mb-1">Descrição</label>
            <input type="text" value={newDescricao} onChange={e => setNewDescricao(e.target.value)} placeholder="Ex: Arroz, feijão, frango grelhado" required
              className="w-full px-3 py-2 bg-white border border-outline-variant rounded-zela-md text-xs text-on-surface" />
          </div>
          <button type="submit" disabled={isAddingItem || !newDate || !newDescricao.trim()}
            className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container disabled:bg-slate-300 text-white px-4 py-2 rounded-zela-md font-bold text-xs transition-all active:scale-95">
            {isAddingItem ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
          </button>
        </form>

        {/* Lista de itens agrupados por data */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <UtensilsCrossed className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum item cadastrado ainda neste cardápio.</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.date}>
              <h3 className="text-[11px] font-extrabold text-on-surface-variant/70 uppercase tracking-wider mb-2 capitalize">{formatDateLabel(group.date)}</h3>
              <div className="space-y-1.5 mb-3">
                {group.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 bg-white border border-outline-variant rounded-zela-md p-2.5">
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/20 shrink-0">
                      {item.refeicao}
                    </span>
                    {editingItemId === item.id ? (
                      <>
                        <input
                          type="text"
                          value={editDescricao}
                          onChange={e => setEditDescricao(e.target.value)}
                          autoFocus
                          className="flex-1 min-w-0 px-2 py-1 bg-surface-container-low border border-outline-variant rounded-lg text-xs text-on-surface"
                        />
                        <button onClick={() => handleSaveEdit(item)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition"><Check size={14} /></button>
                        <button onClick={() => setEditingItemId(null)} className="p-1.5 text-on-surface-variant/70 hover:bg-surface-container rounded-lg transition"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 text-xs text-on-surface-variant truncate">{item.descricao}</span>
                        <button onClick={() => { setEditingItemId(item.id); setEditDescricao(item.descricao); }} className="p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteItem(item.id)} disabled={deletingItemId === item.id} className="p-1.5 text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                          {deletingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
