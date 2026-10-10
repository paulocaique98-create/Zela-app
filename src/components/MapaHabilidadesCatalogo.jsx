import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Pencil, Upload, X, Check, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buscarTodos } from '../lib/buscarTodos';
import { logAction } from '../lib/auditLog';
import { AREAS_SUGERIDAS, formatFaixa, lerCsvHabilidades, validarHabilidade, mensagemErroMapa } from '../lib/mapaHabilidades';

const COLUNAS = 'id, school_id, area, descricao, idade_min_meses, idade_max_meses, ordem, ativa';
const FORM_VAZIO = { id: null, area: '', descricao: '', minAnos: 0, minMeses: 0, maxAnos: 1, maxMeses: 0, ordem: 0 };

const chave = (area, descricao) => `${String(area).trim().toLowerCase()}|${String(descricao).trim().toLowerCase()}`;

// Catálogo de habilidades da escola. Quem não pode editar só consulta.
export default function MapaHabilidadesCatalogo({ currentUser, schoolId, podeEditar }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [areaFiltro, setAreaFiltro] = useState('');
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [csv, setCsv] = useState('');

  const carregar = useCallback(async () => {
    if (!schoolId) return;
    setCarregando(true);
    setErro('');
    try {
      setItens(await buscarTodos(() => supabase.from('mapa_habilidades').select(COLUNAS)
        .eq('school_id', schoolId).order('id', { ascending: true })));
    } catch (e) {
      console.error('[MapaHabilidadesCatalogo] Erro ao carregar:', e);
      setErro(mensagemErroMapa(e, 'Não foi possível carregar o catálogo.'));
    } finally {
      setCarregando(false);
    }
  }, [schoolId]);

  useEffect(() => { carregar(); }, [carregar]);

  const areas = useMemo(() => [...new Set([...AREAS_SUGERIDAS, ...itens.map(i => i.area)])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [itens]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .filter(i => (!areaFiltro || i.area === areaFiltro) && (!termo || i.descricao.toLowerCase().includes(termo)))
      .sort((a, b) => a.area.localeCompare(b.area, 'pt-BR') || a.ordem - b.ordem || a.idade_min_meses - b.idade_min_meses);
  }, [itens, busca, areaFiltro]);

  const abrirNovo = () => { setAviso(''); setForm({ ...FORM_VAZIO }); };
  const abrirEdicao = (h) => {
    setAviso('');
    setForm({
      id: h.id, area: h.area, descricao: h.descricao,
      minAnos: Math.floor(h.idade_min_meses / 12), minMeses: h.idade_min_meses % 12,
      maxAnos: Math.floor(h.idade_max_meses / 12), maxMeses: h.idade_max_meses % 12,
      ordem: h.ordem,
    });
  };

  const salvar = async (e) => {
    e.preventDefault();
    const dados = {
      area: form.area.trim(),
      descricao: form.descricao.trim(),
      idade_min_meses: Number(form.minAnos) * 12 + Number(form.minMeses),
      idade_max_meses: Number(form.maxAnos) * 12 + Number(form.maxMeses),
      ordem: Number.isInteger(Number(form.ordem)) ? Number(form.ordem) : 0,
    };
    const msg = validarHabilidade(dados);
    if (msg) { setErro(msg); return; }
    if (!form.id && itens.some(i => chave(i.area, i.descricao) === chave(dados.area, dados.descricao))) {
      setErro('Essa habilidade já existe nesta área.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      if (form.id) {
        const { error } = await supabase.from('mapa_habilidades').update(dados).eq('id', form.id).eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mapa_habilidades').insert({ ...dados, school_id: schoolId, created_by: currentUser.id });
        if (error) throw error;
      }
      setForm(null);
      await carregar();
    } catch (err) {
      console.error('[MapaHabilidadesCatalogo] Erro ao salvar:', err);
      setErro(mensagemErroMapa(err, 'Não foi possível salvar a habilidade.'));
    } finally {
      setSalvando(false);
    }
  };

  // Habilidade já usada em registros não é apagada: fica desativada e some da fila.
  const alternarAtiva = async (h) => {
    setErro('');
    const { error } = await supabase.from('mapa_habilidades').update({ ativa: !h.ativa }).eq('id', h.id).eq('school_id', schoolId);
    if (error) { setErro('Não foi possível alterar a habilidade.'); return; }
    setItens(prev => prev.map(i => (i.id === h.id ? { ...i, ativa: !h.ativa } : i)));
  };

  const lido = useMemo(() => (csv.trim() ? lerCsvHabilidades(csv) : null), [csv]);
  const novas = useMemo(() => {
    if (!lido) return [];
    const existentes = new Set(itens.map(i => chave(i.area, i.descricao)));
    return lido.itens.filter(i => !existentes.has(chave(i.area, i.descricao)));
  }, [lido, itens]);

  const lerArquivo = async (e) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) setCsv(await arquivo.text());
    e.target.value = '';
  };

  const importar = async () => {
    if (novas.length === 0) return;
    setSalvando(true);
    setErro('');
    try {
      for (let i = 0; i < novas.length; i += 200) {
        const lote = novas.slice(i, i + 200).map(n => ({ ...n, school_id: schoolId, created_by: currentUser.id }));
        const { error } = await supabase.from('mapa_habilidades').insert(lote);
        if (error) throw error;
      }
      await logAction({
        schoolId, actorId: currentUser.id, action: 'mapa_habilidades_importar',
        entityType: 'mapa_habilidades', details: { quantidade: novas.length },
      });
      setAviso(`${novas.length} habilidades importadas.`);
      setCsv('');
      setImportando(false);
      await carregar();
    } catch (err) {
      console.error('[MapaHabilidadesCatalogo] Erro ao importar:', err);
      setErro('A importação parou no meio. Confira o catálogo antes de tentar de novo.');
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  const campo = 'w-full border border-outline-variant rounded-zela-md px-3 py-2 text-sm bg-white text-on-surface';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar habilidade" className={`${campo} pl-9`} />
        </div>
        <select value={areaFiltro} onChange={e => setAreaFiltro(e.target.value)} className={`${campo} sm:w-56`}>
          <option value="">Todas as áreas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {podeEditar && (
          <>
            <button type="button" onClick={abrirNovo} className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-container text-white px-4 py-2.5 rounded-zela-md font-bold text-sm active:scale-95">
              <Plus size={18} /> Adicionar
            </button>
            <button type="button" onClick={() => setImportando(v => !v)} className="flex items-center justify-center gap-2 border border-outline-variant text-on-surface px-4 py-2.5 rounded-zela-md font-bold text-sm">
              <Upload size={16} /> Importar lista
            </button>
          </>
        )}
      </div>

      {erro && <div className="bg-error/10 border border-error/30 text-error p-3 rounded-zela-md text-sm font-medium">{erro}</div>}
      {aviso && <div className="bg-success/10 border border-success/30 text-success p-3 rounded-zela-md text-sm font-medium">{aviso}</div>}

      {importando && podeEditar && (
        <div className="rounded-zela-lg border border-outline-variant p-4 space-y-3">
          <p className="text-xs text-on-surface-variant">
            Cole a lista ou escolha um arquivo CSV. A primeira linha é o cabeçalho: area; habilidade; idade_min_meses; idade_max_meses
            (ou idade_min_anos; idade_max_anos, aceita 1,5). A coluna ordem é opcional.
          </p>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={lerArquivo} className="text-xs" />
          <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} className={`${campo} font-mono text-xs`} placeholder="area;habilidade;idade_min_meses;idade_max_meses" />
          {lido && (
            <div className="text-xs space-y-1">
              <p className="font-bold text-on-surface">{novas.length} novas, {lido.itens.length - novas.length} já existem, {lido.erros.length} com erro.</p>
              {lido.erros.slice(0, 8).map(er => <p key={`${er.linha}${er.msg}`} className="text-error">Linha {er.linha}: {er.msg}</p>)}
              {lido.erros.length > 8 && <p className="text-error">E mais {lido.erros.length - 8} erros.</p>}
            </div>
          )}
          <button type="button" onClick={importar} disabled={salvando || novas.length === 0} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-zela-md font-bold text-sm disabled:bg-outline-variant disabled:text-on-surface-variant">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Importar {novas.length} habilidades
          </button>
        </div>
      )}

      {form && podeEditar && (
        <form onSubmit={salvar} className="rounded-zela-lg border border-primary/40 p-4 space-y-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm text-on-surface">{form.id ? 'Editar habilidade' : 'Nova habilidade'}</p>
            <button type="button" onClick={() => setForm(null)} aria-label="Fechar" className="text-on-surface-variant"><X size={18} /></button>
          </div>
          <label className="block text-xs font-bold text-on-surface-variant">Área de conhecimento
            <input list="mapa-areas" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} maxLength={80} className={`${campo} mt-1`} placeholder="Ex.: Vida Prática" />
            <datalist id="mapa-areas">{areas.map(a => <option key={a} value={a} />)}</datalist>
          </label>
          <label className="block text-xs font-bold text-on-surface-variant">Habilidade
            <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} maxLength={400} rows={2} className={`${campo} mt-1`} placeholder="Ex.: Colocar o chinelo sozinho" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[['min', 'Idade mínima'], ['max', 'Idade máxima']].map(([k, rotulo]) => (
              <fieldset key={k} className="text-xs font-bold text-on-surface-variant">
                <legend className="mb-1">{rotulo}</legend>
                <div className="flex gap-2 items-center">
                  <input type="number" min={0} max={20} value={form[`${k}Anos`]} onChange={e => setForm({ ...form, [`${k}Anos`]: e.target.value })} className={campo} aria-label={`${rotulo} em anos`} />
                  <span className="font-normal">anos</span>
                  <input type="number" min={0} max={11} value={form[`${k}Meses`]} onChange={e => setForm({ ...form, [`${k}Meses`]: e.target.value })} className={campo} aria-label={`${rotulo} em meses`} />
                  <span className="font-normal">meses</span>
                </div>
              </fieldset>
            ))}
          </div>
          <label className="block text-xs font-bold text-on-surface-variant sm:w-40">Ordem na área
            <input type="number" min={0} value={form.ordem} onChange={e => setForm({ ...form, ordem: e.target.value })} className={`${campo} mt-1`} />
          </label>
          <button type="submit" disabled={salvando} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-zela-md font-bold text-sm disabled:bg-outline-variant">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar habilidade
          </button>
        </form>
      )}

      {carregando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : visiveis.length === 0 ? (
        <p className="text-center text-sm text-on-surface-variant py-12">
          {itens.length === 0 ? 'Nenhuma habilidade cadastrada ainda.' : 'Nenhuma habilidade encontrada.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visiveis.map(h => (
            <li key={h.id} className={`rounded-zela-md border border-outline-variant p-3 flex items-start gap-3 ${h.ativa ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase text-primary">{h.area}{h.ativa ? '' : ' · Desativada'}</p>
                <p className="text-sm font-bold text-on-surface">{h.descricao}</p>
                <p className="text-[11px] text-on-surface-variant">{formatFaixa(h.idade_min_meses, h.idade_max_meses)}</p>
              </div>
              {podeEditar && (
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => abrirEdicao(h)} aria-label="Editar" className="p-2 rounded-zela-md border border-outline-variant text-on-surface-variant"><Pencil size={14} /></button>
                  <button type="button" onClick={() => alternarAtiva(h)} className="px-2.5 rounded-zela-md border border-outline-variant text-[11px] font-bold text-on-surface-variant">
                    {h.ativa ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
