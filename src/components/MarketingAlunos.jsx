import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { exportarAlunos, formatarNascimento } from '../lib/exportarAlunos';
import ExportarAlunosModal from './ExportarAlunosModal';

// Lista de alunos do perfil Marketing. Os dados vêm só da RPC
// marketing_lista_alunos (colunas aprovadas, sem foto). Filtros por turma e
// turno; o Exportar usa a lista já filtrada.
export default function MarketingAlunos() {
  const [alunos, setAlunos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [turma, setTurma] = useState('');
  const [turno, setTurno] = useState('');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.rpc('marketing_lista_alunos');
      if (!vivo) return;
      if (error) toast.error('Não foi possível carregar a lista de alunos.');
      else setAlunos(data || []);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const turmas = useMemo(() => [...new Set(alunos.map((a) => a.turma).filter(Boolean))].sort(), [alunos]);
  const turnos = useMemo(() => [...new Set(alunos.map((a) => a.turno).filter(Boolean))].sort(), [alunos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return alunos.filter((a) =>
      (!turma || a.turma === turma)
      && (!turno || a.turno === turno)
      && (!q || (a.nome || '').toLowerCase().includes(q)));
  }, [alunos, turma, turno, busca]);

  const exportar = async (formato) => {
    try {
      const qtd = await exportarAlunos(formato, filtrados, {
        titulo: `Lista de alunos${turma ? ` · ${turma}` : ''}${turno ? ` · ${turno}` : ''}`,
      });
      // Trilha no servidor (quem, quando, formato e quantidade).
      const { error } = await supabase.rpc('marketing_registrar_exportacao', { p_formato: formato, p_quantidade: qtd });
      if (error) toast.error('Arquivo gerado, mas a exportação não foi registrada. Avise a Gestão.');
      else toast.success('Arquivo gerado.');
    } catch {
      toast.error('Não foi possível gerar o arquivo.');
    }
  };

  const selectCls = 'px-3 py-2 rounded-zela-md border border-outline-variant bg-surface-container-lowest text-sm text-on-surface';

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">Alunos</h1>
          <p className="text-small text-on-surface-variant mt-1" aria-live="polite">
            {carregando ? 'Carregando…' : `${filtrados.length} ${filtrados.length === 1 ? 'aluno' : 'alunos'}${filtrados.length !== alunos.length ? ` de ${alunos.length}` : ''}`}
          </p>
        </div>
        <button type="button" onClick={() => setModalAberto(true)} disabled={carregando || filtrados.length === 0}
          className="shrink-0 px-4 py-2 rounded-zela-md bg-primary text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          <Download size={16} aria-hidden="true" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-2">
        <div className="relative col-span-2 md:flex-1 md:min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno"
            className={`${selectCls} w-full pl-9`} aria-label="Buscar aluno" />
        </div>
        <select value={turma} onChange={(e) => setTurma(e.target.value)} className={`${selectCls} min-w-0`} aria-label="Filtrar por turma">
          <option value="">Todas as turmas</option>
          {turmas.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={turno} onChange={(e) => setTurno(e.target.value)} className={`${selectCls} min-w-0`} aria-label="Filtrar por turno">
          <option value="">Todos os turnos</option>
          {turnos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" aria-label="Carregando" /></div>
      ) : (
        <>
        {/* Celular: cartões, sem rolagem lateral */}
        <ul className="md:hidden space-y-2">
          {filtrados.map((a) => (
            <li key={a.student_id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3 flex gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold" aria-hidden="true">
                {(a.nome || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-label text-on-surface font-semibold">{a.nome}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {a.turma && <span className="px-2 py-0.5 rounded-sm bg-primary/10 text-primary text-xs font-medium">{a.turma}</span>}
                  {a.turno && <span className="px-2 py-0.5 rounded-sm bg-surface-container-low text-on-surface-variant text-xs font-medium">{a.turno}</span>}
                </div>
                <p className="text-small text-on-surface-variant mt-2">
                  {formatarNascimento(a.nascimento)}{a.idade != null ? ` · ${a.idade} anos` : ''}
                </p>
                {(a.responsavel_nome || a.responsavel_telefone) && (
                  <p className="text-small text-on-surface mt-1">
                    {a.responsavel_nome}
                    {a.responsavel_telefone && (
                      <> · <a href={`tel:${String(a.responsavel_telefone).replace(/[^\d+]/g, '')}`} className="text-primary font-medium whitespace-nowrap">{a.responsavel_telefone}</a></>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
          {filtrados.length === 0 && (
            <li className="py-8 text-center text-on-surface-variant text-sm">Nenhum aluno encontrado.</li>
          )}
        </ul>

        {/* Tablet/desktop: tabela */}
        <div className="hidden md:block overflow-x-auto border border-outline-variant rounded-zela-md bg-surface-container-lowest">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant text-left">
              <tr>
                {['Aluno', 'Turma', 'Turno', 'Nascimento', 'Idade', 'Responsável', 'Telefone'].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <tr key={a.student_id} className="border-t border-outline-variant">
                  <td className="px-3 py-2 font-medium text-on-surface">{a.nome}</td>
                  <td className="px-3 py-2">{a.turma}</td>
                  <td className="px-3 py-2">{a.turno}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatarNascimento(a.nascimento)}</td>
                  <td className="px-3 py-2">{a.idade ?? ''}</td>
                  <td className="px-3 py-2">{a.responsavel_nome}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.responsavel_telefone}</td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant">Nenhum aluno encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {modalAberto && (
        <ExportarAlunosModal quantidade={filtrados.length} onExportar={exportar} onClose={() => setModalAberto(false)} />
      )}
    </div>
  );
}
