import React, { useState } from 'react';
import { QrCode, Loader2, RefreshCw, Printer, CheckCircle2, ListChecks, X } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { printCarteirinhasQr } from '../lib/printCarteirinhaQr';

// Fase 1 do plano de Check-in por QR Code -- gera e imprime a carteirinha
// de cada aluno. O QR nunca carrega o id interno do aluno, só o payload
// assinado devolvido pela RPC generate_student_qr_token (ver migração
// 20260922_add_qr_checkin.sql) -- perder um cartão físico não expõe nada
// além de um token opaco e rotacionável.
//
// Geração fica centralizada aqui (não em cada card) pra permitir imprimir
// vários alunos de uma vez -- selecionar quem ainda não tem QR gerado e
// clicar em "Imprimir selecionados" precisa gerar sob demanda pra quem
// falta, sequencialmente, antes de abrir a folha de impressão.
function StudentQrCard({ student, dataUrl, isGenerating, error, onGenerate, selectMode, checked, onToggleCheck, currentSchool }) {
  const hasQr = Boolean(student.checkin_qr_token);

  return (
    <div className={`bg-white border rounded-zela-lg p-4 flex flex-col gap-3 transition ${checked ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {selectMode && (
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleCheck(student.id)}
              className="w-4 h-4 shrink-0 accent-primary"
            />
          )}
          <div className="min-w-0">
            <p className="font-bold text-on-surface text-sm truncate">{student.name}</p>
            {student.turma && <p className="text-xs text-on-surface-variant/70">{student.turma}</p>}
          </div>
        </div>
        {hasQr && !dataUrl && (
          <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg border bg-green-50 text-green-700 border-green-200 shrink-0 flex items-center gap-1">
            <CheckCircle2 size={12} /> Gerado
          </span>
        )}
      </div>

      {dataUrl && (
        <div className="flex flex-col items-center gap-2 py-2">
          <img src={dataUrl} alt={`QR Code de ${student.name}`} className="w-32 h-32" />
        </div>
      )}

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => onGenerate(student.id)}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-2 rounded-zela-md transition disabled:opacity-50"
        >
          {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {hasQr ? 'Gerar novo QR' : 'Gerar QR'}
        </button>
        {dataUrl && (
          <button
            onClick={() => printCarteirinhasQr([{ name: student.name, turma: student.turma, qrDataUrl: dataUrl }], currentSchool)}
            className="flex items-center justify-center gap-1.5 text-xs font-bold text-on-surface-variant bg-surface-container-low hover:bg-surface-container px-3 py-2 rounded-zela-md transition"
          >
            <Printer size={14} /> Imprimir
          </button>
        )}
      </div>

      {hasQr && !dataUrl && (
        <p className="text-[11px] text-on-surface-variant/70">
          Já existe um QR gerado. Gerar um novo invalida o anterior na hora.
        </p>
      )}
    </div>
  );
}

export default function AdminQrCheckin({ students, currentSchool }) {
  const [dataUrls, setDataUrls] = useState({}); // { [studentId]: dataUrl }
  const [generatingIds, setGeneratingIds] = useState(new Set());
  const [errors, setErrors] = useState({}); // { [studentId]: message }
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isPrintingBulk, setIsPrintingBulk] = useState(false);

  const generateForStudent = async (studentId) => {
    setGeneratingIds(prev => new Set(prev).add(studentId));
    setErrors(prev => ({ ...prev, [studentId]: '' }));
    try {
      const { data: payload, error: rpcError } = await supabase.rpc('generate_student_qr_token', {
        p_student_id: studentId,
      });
      if (rpcError) throw rpcError;

      const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
      setDataUrls(prev => ({ ...prev, [studentId]: dataUrl }));
      return dataUrl;
    } catch (err) {
      console.error('[AdminQrCheckin] Erro ao gerar QR:', err);
      setErrors(prev => ({ ...prev, [studentId]: err.message || 'Não foi possível gerar o QR Code.' }));
      return null;
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    }
  };

  const toggleSelectMode = () => {
    setSelectMode(m => !m);
    setSelectedIds(new Set());
  };

  const toggleCheck = (studentId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  };

  // QR já existente (checkin_qr_token) não precisa ser regenerado só pra
  // imprimir de novo -- mas como o payload assinado nunca é guardado (só o
  // token bruto no banco), reimprimir um QR já gerado antes NESTA sessão
  // exige gerar um novo aqui também (equivalente, na prática, a "gerar
  // novo QR" pra quem ainda não tinha aberto o card individualmente).
  const handlePrintSelected = async () => {
    setIsPrintingBulk(true);
    try {
      const selectedStudents = students.filter(s => selectedIds.has(s.id));
      const cards = [];
      for (const student of selectedStudents) {
        let dataUrl = dataUrls[student.id];
        if (!dataUrl) {
          dataUrl = await generateForStudent(student.id);
        }
        if (dataUrl) cards.push({ name: student.name, turma: student.turma, qrDataUrl: dataUrl });
      }
      if (cards.length > 0) {
        printCarteirinhasQr(cards, currentSchool);
      }
    } finally {
      setIsPrintingBulk(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-zela-xl shadow-none sm:shadow-sm border-0 sm:border sm:border-outline-variant overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-3 mb-6 shrink-0 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-primary/10 p-2 rounded-zela-md text-primary shrink-0">
            <QrCode size={18} />
          </div>
          <p className="text-small text-on-surface-variant">
            Gere a carteirinha de check-in de cada aluno. O QR identifica só a criança -- no totem, depois de escanear, é preciso confirmar com 1 toque quem está entregando ou buscando.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectMode && (
            <button
              onClick={handlePrintSelected}
              disabled={selectedIds.size === 0 || isPrintingBulk}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-primary hover:brightness-110 px-3.5 py-2 rounded-zela-md transition disabled:opacity-40"
            >
              {isPrintingBulk ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              Imprimir selecionados ({selectedIds.size})
            </button>
          )}
          <button
            onClick={toggleSelectMode}
            className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-zela-md border transition ${
              selectMode ? 'bg-surface-container text-on-surface border-outline-variant' : 'bg-primary/10 text-primary border-transparent hover:bg-primary/15'
            }`}
          >
            {selectMode ? <X size={14} /> : <ListChecks size={14} />}
            {selectMode ? 'Cancelar' : 'Selecionar'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {(students || []).length === 0 ? (
          <div className="text-center py-12 bg-surface-container-low rounded-zela-lg border border-dashed border-outline-variant">
            <QrCode className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-on-surface-variant font-medium">Nenhum aluno cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {students.map(student => (
              <StudentQrCard
                key={student.id}
                student={student}
                dataUrl={dataUrls[student.id] || null}
                isGenerating={generatingIds.has(student.id)}
                error={errors[student.id]}
                onGenerate={generateForStudent}
                selectMode={selectMode}
                checked={selectedIds.has(student.id)}
                onToggleCheck={toggleCheck}
                currentSchool={currentSchool}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
