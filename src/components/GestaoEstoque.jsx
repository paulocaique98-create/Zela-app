import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';
import { useSchoolConfig } from '../lib/schoolConfig';
import { PageShell, Loading, Notice, EmptyState, Modal, Field, PrimaryButton, SecondaryButton, ResponsiveTable, StatCard, inputCls } from './GestaoShared';
import { TIPOS_MOVIMENTO, UNIDADES, abaixoDoMinimo, categoriasSugeridas, formatarQuantidade, lerQuantidade, textoBusca, variacao } from '../lib/estoque';

const TOM_VARIACAO = { entrada: 'text-success', saida: 'text-on-surface', ajuste: 'text-warning' };

// Estoque (módulo `estoque`). Gestão, Coordenação e Direção; cada aba é um item do menu.
// O banco barra o resto (RLS por escola e RPC estoque_registrar, que impede saldo negativo).
export default function GestaoEstoque({ currentUser, aba }) {
  const [itens, setItens] = useState(null);
  const [saldos, setSaldos] = useState({});
  const [movimentos, setMovimentos] = useState([]);
  const [nomes, setNomes] = useState({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const schoolId = currentUser.school_id;
  const { method } = useSchoolConfig(schoolId);

  const carregar = useCallback(async () => {
    const [it, sd, mv] = await Promise.all([
      supabase.from('stock_items').select('id, nome, categoria, unidade, estoque_minimo, ativo').eq('school_id', schoolId).order('nome').limit(2000),
      supabase.from('stock_balances').select('item_id, saldo').eq('school_id', schoolId).limit(2000),
      supabase.from('stock_movements').select('id, item_id, tipo, quantidade, motivo, registrado_por, created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(500),
    ]);
    if (it.error || sd.error || mv.error) { setErro('Não foi possível carregar o estoque.'); setItens([]); return; }
    setErro('');
    setItens(it.data);
    setSaldos(Object.fromEntries(sd.data.map(s => [s.item_id, Number(s.saldo)])));
    setMovimentos(mv.data);
  }, [schoolId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setAviso(''); }, [aba]);

  useEffect(() => {
    const ids = [...new Set(movimentos.map(m => m.registrado_por).filter(Boolean))];
    if (!ids.length) return;
    supabase.from('users').select('id, name').eq('school_id', schoolId).in('id', ids).limit(500)
      .then(({ data }) => setNomes(Object.fromEntries((data || []).map(u => [u.id, u.name]))));
  }, [movimentos, schoolId]);

  const ctx = { schoolId, method, itens, saldos, movimentos, nomes, carregar, setErro, setAviso };

  return (
    <PageShell>
      <div className="space-y-3">
        <Notice type="error">{erro}</Notice>
        <Notice type="success">{aviso}</Notice>
        {itens === null ? <Loading /> : (
          <>
            {aba === 'estoque-itens' && <Itens {...ctx} />}
            {aba === 'estoque-movimentacoes' && <Movimentacoes {...ctx} />}
            {aba === 'estoque-minimo' && <AbaixoDoMinimo {...ctx} />}
          </>
        )}
      </div>
    </PageShell>
  );
}

const qtd = (item, n) => `${formatarQuantidade(n ?? 0)} ${item.unidade}`;

// ───────────────────────── Itens ─────────────────────────
function Itens({ schoolId, method, itens, saldos, movimentos, carregar, setErro, setAviso }) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const [movendo, setMovendo] = useState(null);
  const [excluindo, setExcluindo] = useState(null);

  // Só item sem nenhum movimento pode ser excluído (o banco também recusa os outros).
  const comMovimento = useMemo(() => new Set(movimentos.map(m => m.item_id)), [movimentos]);

  const excluir = async () => {
    const item = excluindo;
    setExcluindo(null);
    const { error } = await supabase.from('stock_items').delete().eq('id', item.id).eq('school_id', schoolId);
    if (error) {
      setAviso('');
      setErro(error.code === '23503'
        ? 'Este item tem movimentações e não pode ser excluído. Deixe o item inativo.'
        : 'Não foi possível excluir o item.');
      return;
    }
    setErro('');
    setAviso(`Item ${item.nome} excluído.`);
    carregar();
  };

  const visiveis = useMemo(() => {
    const q = textoBusca(busca);
    return itens.filter(i => !q || textoBusca(`${i.nome} ${i.categoria}`).includes(q));
  }, [itens, busca]);
  const ativos = itens.filter(i => i.ativo);
  const abaixo = ativos.filter(i => abaixoDoMinimo(saldos[i.id], i.estoque_minimo)).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Itens ativos" value={ativos.length} />
        <StatCard label="Abaixo do mínimo" value={abaixo} tone={abaixo > 0 ? 'warn' : 'default'} />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input className={`${inputCls} sm:max-w-xs`} placeholder="Buscar por nome ou categoria" value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="flex gap-2 sm:ml-auto flex-wrap">
          <PrimaryButton onClick={() => setEditando({})}><Plus size={15} />Novo item</PrimaryButton>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState icon={Boxes} text="Nenhum item no estoque" hint="Cadastre um item e registre a primeira entrada." />
      ) : (
        <ResponsiveTable
          rows={visiveis}
          columns={[
            { label: 'Item', primary: true, className: 'w-full', render: i => (
              <div>
                <p className="font-semibold text-on-surface">{i.nome}{!i.ativo && ' (inativo)'}</p>
                <p className="text-xs text-on-surface-variant">{i.categoria || 'Sem categoria'}</p>
              </div>
            ) },
            { label: 'Saldo', className: 'whitespace-nowrap pr-8', render: i => (
              <span className={abaixoDoMinimo(saldos[i.id], i.estoque_minimo) ? 'text-warning font-semibold' : ''}>{qtd(i, saldos[i.id])}</span>
            ) },
            { label: 'Mínimo', className: 'whitespace-nowrap pr-8', render: i => (Number(i.estoque_minimo) > 0 ? qtd(i, i.estoque_minimo) : 'Sem mínimo') },
            { label: 'Ações', actions: true, align: 'right', className: 'whitespace-nowrap', render: i => (
              <div className="flex gap-2 justify-end">
                {i.ativo && <SecondaryButton onClick={() => setMovendo(i)}>Movimentar</SecondaryButton>}
                <SecondaryButton onClick={() => setEditando(i)}>Editar</SecondaryButton>
                {!comMovimento.has(i.id) && <SecondaryButton onClick={() => setExcluindo(i)}>Excluir</SecondaryButton>}
              </div>
            ) },
          ]}
        />
      )}

      {excluindo && (
        <ConfirmModal
          title="Excluir item"
          message={`Excluir "${excluindo.nome}"? Só é possível porque o item não tem movimentações.`}
          confirmLabel="Excluir"
          onConfirm={excluir}
          onCancel={() => setExcluindo(null)}
        />
      )}
      {editando && <ModalItem schoolId={schoolId} method={method} item={editando} onClose={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />}
      {movendo && (
        <ModalMovimento
          item={movendo} saldo={saldos[movendo.id] ?? 0} onClose={() => setMovendo(null)}
          onFeito={(msg) => { setMovendo(null); setErro(''); setAviso(msg); carregar(); }}
        />
      )}
    </>
  );
}

function ModalItem({ schoolId, method, item, onClose, onSalvo }) {
  const [f, setF] = useState({
    nome: item.nome || '', categoria: item.categoria || '', unidade: item.unidade || 'un',
    estoque_minimo: item.estoque_minimo != null ? String(item.estoque_minimo).replace('.', ',') : '0', ativo: item.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));

  const salvar = async () => {
    setMsg('');
    if (!f.nome.trim()) return setMsg('Informe o nome do item.');
    const minimo = lerQuantidade(f.estoque_minimo);
    if (minimo === null || minimo < 0) return setMsg('Informe um mínimo válido, de zero para cima.');
    setSalvando(true);
    const dados = {
      nome: f.nome.trim(), categoria: f.categoria.trim() || null, unidade: f.unidade.trim() || 'un',
      estoque_minimo: minimo, ativo: f.ativo,
    };
    const { error } = item.id
      ? await supabase.from('stock_items').update(dados).eq('id', item.id).eq('school_id', schoolId)
      : await supabase.from('stock_items').insert({ ...dados, school_id: schoolId });
    setSalvando(false);
    if (error) return setMsg(error.code === '23505' ? 'Já existe um item com esse nome.' : 'Não foi possível salvar o item.');
    onSalvo();
  };

  return (
    <Modal title={item.id ? 'Editar item' : 'Novo item'} onClose={onClose} footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={salvar} disabled={salvando}>Salvar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <Field label="Nome" id="est-nome"><input id="est-nome" className={inputCls} maxLength={120} value={f.nome} onChange={set('nome')} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Categoria" id="est-cat" hint="Escolha uma sugestão ou digite outra.">
          <input id="est-cat" className={inputCls} list="est-categorias" maxLength={80} value={f.categoria} onChange={set('categoria')} />
          <datalist id="est-categorias">{categoriasSugeridas(method).map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Unidade" id="est-un">
          <input id="est-un" className={inputCls} list="est-unidades" maxLength={20} value={f.unidade} onChange={set('unidade')} />
          <datalist id="est-unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="Estoque mínimo" id="est-min" hint="Avisa quando o saldo fica abaixo. Zero desliga o aviso.">
          <input id="est-min" className={inputCls} inputMode="decimal" value={f.estoque_minimo} onChange={set('estoque_minimo')} />
        </Field>
      </div>
      {item.id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.ativo} onChange={e => setF(v => ({ ...v, ativo: e.target.checked }))} />
          Item ativo (inativo não recebe movimentos)
        </label>
      )}
    </Modal>
  );
}

function ModalMovimento({ item, saldo, onClose, onFeito }) {
  const [tipo, setTipo] = useState('entrada');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');

  const registrar = async () => {
    setMsg('');
    const q = lerQuantidade(quantidade);
    if (q === null || q === 0) return setMsg('Informe a quantidade, com até 3 casas decimais.');
    if (tipo !== 'ajuste' && q < 0) return setMsg('Para entrada e saída, use uma quantidade maior que zero.');
    if (tipo === 'ajuste' && !motivo.trim()) return setMsg('Informe o motivo do ajuste.');
    setEnviando(true);
    const { error } = await supabase.rpc('estoque_registrar', {
      p_item_id: item.id, p_tipo: tipo, p_quantidade: q, p_motivo: motivo.trim() || null,
    });
    setEnviando(false);
    if (error) return setMsg(error.message?.startsWith('Saldo insuficiente') ? `Saldo insuficiente. Há ${qtd(item, saldo)} em estoque.` : 'Não foi possível registrar o movimento.');
    onFeito(`${TIPOS_MOVIMENTO[tipo]} de ${item.nome} registrada.`);
  };

  return (
    <Modal title={`Movimentar ${item.nome}`} onClose={onClose} footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={registrar} disabled={enviando}>Registrar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <p className="text-sm text-on-surface-variant">Saldo atual: <span className="font-semibold text-on-surface">{qtd(item, saldo)}</span></p>
      <Field label="Tipo" id="mov-tipo">
        <select id="mov-tipo" className={inputCls} value={tipo} onChange={e => setTipo(e.target.value)}>
          {Object.entries(TIPOS_MOVIMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label={tipo === 'ajuste' ? `Variação (${item.unidade})` : `Quantidade (${item.unidade})`} id="mov-qtd"
        hint={tipo === 'ajuste' ? 'Número positivo soma e negativo tira. Serve para corrigir a contagem.' : undefined}>
        <input id="mov-qtd" className={inputCls} inputMode="decimal" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
      </Field>
      <Field label={tipo === 'ajuste' ? 'Motivo' : 'Motivo ou destino (opcional)'} id="mov-motivo">
        <input id="mov-motivo" className={inputCls} maxLength={200} value={motivo} onChange={e => setMotivo(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ───────────────────────── Movimentações ─────────────────────────
function Movimentacoes({ itens, movimentos, nomes }) {
  const porId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  const [tipo, setTipo] = useState('');
  const lista = movimentos.filter(m => !tipo || m.tipo === tipo);

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <select className={`${inputCls} sm:max-w-xs`} value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS_MOVIMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <p className="text-xs text-on-surface-variant sm:ml-auto">Os 500 movimentos mais recentes. O histórico não pode ser editado nem apagado.</p>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={Boxes} text="Nenhuma movimentação" hint="As entradas, saídas e ajustes aparecem aqui." />
      ) : (
        <ResponsiveTable
          rows={lista}
          columns={[
            { label: 'Item', primary: true, render: m => <span className="font-semibold text-on-surface">{porId.get(m.item_id)?.nome || 'Item não encontrado'}</span> },
            { label: 'Tipo', render: m => TIPOS_MOVIMENTO[m.tipo] },
            { label: 'Quantidade', render: m => <span className={TOM_VARIACAO[m.tipo]}>{variacao(m)} {porId.get(m.item_id)?.unidade}</span> },
            { label: 'Motivo', render: m => m.motivo || 'Sem motivo' },
            { label: 'Quem', render: m => nomes[m.registrado_por] || 'Não identificado' },
            { label: 'Data', render: m => new Date(m.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
          ]}
        />
      )}
    </>
  );
}

// ───────────────────────── Abaixo do mínimo ─────────────────────────
function AbaixoDoMinimo({ itens, saldos }) {
  const lista = useMemo(
    () => itens.filter(i => i.ativo && abaixoDoMinimo(saldos[i.id], i.estoque_minimo))
      .sort((a, b) => (saldos[a.id] / a.estoque_minimo) - (saldos[b.id] / b.estoque_minimo)),
    [itens, saldos],
  );
  return (
    <>
      <StatCard label="Itens abaixo do mínimo" value={lista.length} tone={lista.length > 0 ? 'warn' : 'default'} />
      {lista.length === 0 ? (
        <EmptyState icon={Boxes} text="Nenhum item abaixo do mínimo" hint="Os itens aparecem aqui quando o saldo fica abaixo do mínimo definido." />
      ) : (
        <ResponsiveTable
          rows={lista}
          columns={[
            { label: 'Item', primary: true, render: i => (
              <div>
                <p className="font-semibold text-on-surface">{i.nome}</p>
                <p className="text-xs text-on-surface-variant">{i.categoria || 'Sem categoria'}</p>
              </div>
            ) },
            { label: 'Saldo', render: i => <span className="text-warning font-semibold">{qtd(i, saldos[i.id])}</span> },
            { label: 'Mínimo', render: i => qtd(i, i.estoque_minimo) },
            { label: 'Falta para o mínimo', render: i => qtd(i, Number(i.estoque_minimo) - saldos[i.id]) },
          ]}
        />
      )}
    </>
  );
}
