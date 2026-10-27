import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Printer, Save } from 'lucide-react';
import { carregarConfig, periodosDaConfig, CONFIG_PADRAO } from './lib/avaliacao';
import { ATA_VAZIA, listarAtas, salvarAta } from './lib/historico';
import { listar, mensagemDeErro } from './lib/estrutura';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const CAMPOS = [
  { chave: 'participantes', rotulo: 'Participantes', linhas: 2, max: 2000 },
  { chave: 'pauta', rotulo: 'Pauta', linhas: 3, max: 4000 },
  { chave: 'deliberacoes', rotulo: 'Deliberações', linhas: 4, max: 4000 },
  { chave: 'encaminhamentos', rotulo: 'Encaminhamentos', linhas: 3, max: 4000 },
];

// Fase 4B do Método Tradicional: ata do conselho de classe, uma por turma e
// período. Interna da escola: só Coordenação e Direção (a RLS barra o resto).
export default function AtaConselho({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [config, setConfig] = useState({ ...CONFIG_PADRAO });
  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [periodo, setPeriodo] = useState(1);
  const [atas, setAtas] = useState([]);
  const [form, setForm] = useState({ ...ATA_VAZIA });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const periodos = useMemo(() => periodosDaConfig(config.periodo_tipo), [config.periodo_tipo]);
  const turma = turmas.find(t => t.id === turmaId);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [cfg, ts] = await Promise.all([carregarConfig(schoolId), listar('trad_turmas', schoolId, { ordenarPor: 'nome' })]);
        if (!ativo) return;
        setConfig(cfg); setTurmas(ts); setTurmaId(ts[0]?.id || '');
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId]);

  useEffect(() => {
    let ativo = true;
    listarAtas(schoolId, turmaId)
      .then(r => { if (ativo) { setAtas(r); setErro(''); } })
      .catch(e => { if (ativo) setErro(mensagemDeErro(e)); });
    return () => { ativo = false; };
  }, [schoolId, turmaId]);

  useEffect(() => {
    const ata = atas.find(a => a.periodo === periodo);
    setForm(ata ? { data_reuniao: ata.data_reuniao, participantes: ata.participantes, pauta: ata.pauta, deliberacoes: ata.deliberacoes, encaminhamentos: ata.encaminhamentos } : { ...ATA_VAZIA });
    setAviso('');
  }, [atas, periodo]);

  const salvar = async () => {
    setSalvando(true); setAviso('');
    try {
      await salvarAta(schoolId, { turmaId, periodo, ata: form, userId: currentUser?.id });
      setAtas(await listarAtas(schoolId, turmaId));
      setErro(''); setAviso('Ata salva.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  const existente = atas.some(a => a.periodo === periodo);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface flex-1">Ata do conselho de classe</h2>
        <button onClick={() => window.print()} className="print:hidden flex items-center gap-1.5 border border-outline-variant text-on-surface px-3 py-1.5 rounded-zela-md text-sm font-bold">
          <Printer size={16} /> Imprimir
        </button>
      </div>
      {erro && <p className="text-sm text-error bg-error/10 rounded-zela-md p-3">{erro}</p>}
      {turmas.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Cadastre as turmas em Estrutura acadêmica primeiro.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 print:hidden">
            <select className={`${campo} sm:max-w-xs`} value={turmaId} onChange={e => setTurmaId(e.target.value)} aria-label="Turma">
              {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <select className={`${campo} sm:max-w-xs`} value={periodo} onChange={e => setPeriodo(Number(e.target.value))} aria-label="Período">
              {periodos.map(p => <option key={p.numero} value={p.numero}>{p.label}{atas.some(a => a.periodo === p.numero) ? ' (com ata)' : ''}</option>)}
            </select>
          </div>
          <p className="hidden print:block font-bold">{turma?.nome}, {periodos.find(p => p.numero === periodo)?.label}</p>
          <label className="block text-sm font-bold text-on-surface sm:max-w-xs">
            Data da reunião
            <input type="date" className={`${campo} mt-1 font-normal`} value={form.data_reuniao}
              onChange={e => setForm({ ...form, data_reuniao: e.target.value })} />
          </label>
          {CAMPOS.map(c => (
            <label key={c.chave} className="block text-sm font-bold text-on-surface">
              {c.rotulo}
              <textarea className={`${campo} mt-1 font-normal`} rows={c.linhas} maxLength={c.max} value={form[c.chave]}
                onChange={e => setForm({ ...form, [c.chave]: e.target.value })} />
            </label>
          ))}
          <div className="flex items-center gap-3 print:hidden">
            <button onClick={salvar} disabled={salvando}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-4 py-2 rounded-zela-md font-bold transition-all active:scale-95 disabled:opacity-60">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {existente ? 'Atualizar ata' : 'Salvar ata'}
            </button>
            {aviso && <span className="text-sm text-primary">{aviso}</span>}
          </div>
        </>
      )}
    </div>
  );
}
