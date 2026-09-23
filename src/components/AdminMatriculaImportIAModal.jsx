import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
import {
  X, Upload, Sparkles, CheckCircle2, AlertTriangle, Loader2, ArrowLeft, Send,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Importação com IA -- diferente do AdminMatriculaImportModal.jsx (que exige
// o modelo exato baixado em "Baixar Modelo"), aqui a planilha pode ter
// QUALQUER formato de coluna: o Gemini interpreta linha a linha e agrupa em
// famílias. O resultado nunca vira solicitação direto -- fica como RASCUNHO
// (matricula_import_drafts) pro admin revisar o resumo da IA e confirmar
// cada família manualmente antes de qualquer conta ser criada.
function sheetToGenericRows(workbook) {
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));
}

export default function AdminMatriculaImportIAModal({ onClose, onDraftsCreated }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'analyzing' | 'review' | 'saving' | 'done'
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [families, setFamilies] = useState([]);
  const [resumoGeral, setResumoGeral] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape' && step !== 'analyzing' && step !== 'saving') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [step, onClose]);

  const processFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Formato inválido. Selecione um arquivo .xlsx, .xls ou .csv.');
      return;
    }
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const rows = sheetToGenericRows(workbook);
        if (rows.length === 0) {
          setError('A planilha parece estar vazia.');
          return;
        }

        setStep('analyzing');
        const { data: resp, error: fnError } = await supabase.functions.invoke('import-matricula-ai', { body: { rows } });
        if (fnError || !resp) {
          // O supabase-js só devolve uma mensagem genérica ("non-2xx status
          // code") em fnError.message -- o corpo real do erro (o que a
          // function jogou no throw) vem em fnError.context, a Response
          // crua. Sem isso, todo erro parece igual pro admin.
          let detalhe = '';
          try { detalhe = (await fnError?.context?.json())?.error || ''; } catch (_) { /* corpo não era JSON (timeout/erro de infra) */ }
          throw new Error(detalhe || fnError?.message || 'Erro ao consultar a IA.');
        }
        if (resp.error) throw new Error(resp.error);

        setFamilies((resp.families || []).map((f) => ({ ...f, incluir: true })));
        setResumoGeral(resp.resumo_geral || '');
        setStep('review');
      } catch (err) {
        setError(err.message || 'Erro ao processar o arquivo.');
        setStep('upload');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); }, [processFile]);
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleFileChange = (e) => processFile(e.target.files[0]);

  const toggleFamilia = (idx) => {
    setFamilies((prev) => prev.map((f, i) => (i === idx ? { ...f, incluir: !f.incluir } : f)));
  };

  const handleSaveDrafts = async () => {
    const selecionadas = families.filter((f) => f.incluir);
    if (selecionadas.length === 0) { setError('Selecione ao menos uma família pra salvar como rascunho.'); return; }

    setStep('saving');
    setError('');
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from('users').select('school_id').eq('id', authData.user.id).single();

      const rows = selecionadas.map((f) => ({
        school_id: userRow.school_id,
        payload: {
          responsavel: f.responsavel,
          segundo_responsavel: f.segundo_responsavel || null,
          criancas: f.criancas || [],
          autorizados: f.autorizados || [],
        },
        resumo_ia: f.resumo || '',
        status: 'draft',
        created_by: authData.user.id,
      }));

      const { error: insertError } = await supabase.from('matricula_import_drafts').insert(rows);
      if (insertError) throw new Error(insertError.message);

      setSavedCount(selecionadas.length);
      setStep('done');
      if (onDraftsCreated) onDraftsCreated();
    } catch (err) {
      setError(err.message || 'Erro ao salvar rascunhos.');
      setStep('review');
    }
  };

  const totalCriancas = families.reduce((sum, f) => sum + (f.criancas?.length || 0), 0);
  const selecionadasCount = families.filter((f) => f.incluir).length;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={step !== 'analyzing' && step !== 'saving' ? onClose : undefined}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-violet-100 p-2.5 rounded-xl text-violet-600">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Importar com IA</h2>
              <p className="text-xs text-slate-400">
                {step === 'upload' && 'Envie qualquer planilha antiga, sem precisar seguir um modelo fixo'}
                {step === 'analyzing' && 'A IA está lendo e organizando a planilha…'}
                {step === 'review' && `${families.length} família(s) encontradas · revise antes de salvar como rascunho`}
                {step === 'saving' && 'Salvando rascunhos…'}
                {step === 'done' && `${savedCount} rascunho(s) salvos`}
              </p>
            </div>
          </div>
          {step !== 'analyzing' && step !== 'saving' && (
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition" title="Fechar">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {step === 'upload' && (
            <div className="p-6 space-y-5">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all select-none ${
                  isDragging ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50/40'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                <div className={`mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? 'bg-violet-100' : 'bg-white border border-slate-200'}`}>
                  <Upload size={26} className={isDragging ? 'text-violet-500' : 'text-slate-400'} />
                </div>
                <p className="font-semibold text-slate-700 text-sm">{isDragging ? 'Solte o arquivo aqui' : 'Arraste a planilha aqui'}</p>
                <p className="text-xs text-slate-400 mt-1">ou clique para selecionar · <span className="font-mono">.xlsx</span> / <span className="font-mono">.xls</span> / <span className="font-mono">.csv</span></p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-xs text-violet-700 leading-relaxed">
                A IA lê a planilha do jeito que ela estiver, sem precisar de um modelo fixo, e monta um resumo pra cada família encontrada. Nada é criado ainda nessa etapa: o resultado fica salvo como rascunho até você revisar e clicar em Enviar, família por família.
              </div>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="p-10 flex flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="animate-spin text-violet-500" size={36} />
              <p className="text-sm text-slate-500">Lendo <span className="font-mono">{fileName}</span> e organizando por família… isso pode levar um minuto.</p>
            </div>
          )}

          {step === 'review' && (
            <div className="p-6 space-y-4">
              {resumoGeral && (
                <div className="flex items-start gap-2.5 p-3.5 bg-violet-50 border border-violet-100 rounded-xl text-sm text-violet-700">
                  <Sparkles size={15} className="mt-0.5 shrink-0" />
                  <span>{resumoGeral}</span>
                </div>
              )}
              <div className="text-xs text-slate-400">
                {families.length} família(s) · {totalCriancas} criança(s) · {selecionadasCount} selecionada(s) pra salvar como rascunho
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                {families.map((f, idx) => (
                  <label
                    key={idx}
                    className={`block border rounded-2xl p-4 cursor-pointer transition-colors ${
                      f.incluir ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200 bg-slate-50/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={f.incluir}
                        onChange={() => toggleFamilia(idx)}
                        className="mt-1 w-4 h-4 accent-violet-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm">{f.responsavel?.nome || 'Responsável não identificado'}</div>
                        <div className="text-[11px] text-slate-400">{f.responsavel?.email || 'sem e-mail identificado'}{f.cpf_responsavel ? ` · CPF ${f.cpf_responsavel}` : ' · CPF não identificado'}</div>
                        <div className="text-xs text-slate-600 mt-1">{(f.criancas || []).map((c) => c.nome).join(', ') || 'Nenhuma criança identificada'}</div>
                        {f.resumo && <div className="text-[11px] text-slate-500 mt-2 leading-relaxed border-t border-slate-200/70 pt-2">{f.resumo}</div>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 'saving' && (
            <div className="p-10 flex flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="animate-spin text-violet-500" size={36} />
              <p className="text-sm text-slate-500">Salvando rascunhos…</p>
            </div>
          )}

          {step === 'done' && (
            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
                <div className="text-4xl font-black text-emerald-700">{savedCount}</div>
                <div className="text-xs text-emerald-600 font-medium mt-1">Rascunho(s) salvo(s)</div>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700">
                Os rascunhos aparecem em "Rascunhos (IA)" — revise cada um e clique em Enviar pra virar solicitação pendente de verdade.
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div>
            {step === 'review' && (
              <button
                onClick={() => { setStep('upload'); setFamilies([]); setFileName(''); setError(''); }}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
              >
                <ArrowLeft size={15} /> Outro arquivo
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step !== 'analyzing' && step !== 'saving' && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl transition">
                {step === 'done' ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={handleSaveDrafts}
                disabled={selecionadasCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition shadow-sm"
              >
                <Send size={14} /> Salvar {selecionadasCount} rascunho(s)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
