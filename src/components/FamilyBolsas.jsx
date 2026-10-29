import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Paperclip, GraduationCap, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/gestaoUtils';
import {
  STATUS_PEDIDO, PEDIDO_ABERTO, MAX_DOCUMENTOS, dataBR, descricaoDoBeneficio, reaisParaCentavos, tipoAceitaPedido, vigenteEm,
} from '../lib/bolsas';

// Pedir bolsa (item 13). Fica dentro do Financeiro da família (só o responsável financeiro chega
// aqui). Some sozinho se a escola não ligou o módulo: sem tipo, pedido ou bolsa, não mostra nada.
// A RLS garante que a família só enxerga os próprios pedidos e documentos.
const inputCls = 'w-full p-2.5 bg-surface-container-lowest border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary text-sm';
const TIPOS_ARQUIVO = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

export default function FamilyBolsas({ schoolId }) {
  const hoje = todayISO();
  const [tipos, setTipos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [bolsas, setBolsas] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const [t, p, g] = await Promise.all([
      supabase.from('scholarship_types').select('id, nome, descricao, criterios, percentual, valor_cents, vigencia_inicio, vigencia_fim, ativo').order('nome').limit(50),
      supabase.from('scholarship_applications').select('id, status, parecer, created_at, students(name), scholarship_types(nome)').order('created_at', { ascending: false }).limit(20),
      supabase.from('scholarship_grants').select('id, percentual, valor_cents, inicio, fim, encerrada_em, students(name), scholarship_types(nome)').order('created_at', { ascending: false }).limit(20),
    ]);
    // Complemento do Financeiro: se falhar, a tela principal segue sem esta seção.
    setTipos(t.error ? [] : (t.data || []));
    setPedidos(p.error ? [] : (p.data || []));
    setBolsas(g.error ? [] : (g.data || []));
    setCarregado(true);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (!carregado) return null;
  const tiposAbertos = tipos.filter(t => tipoAceitaPedido(t, hoje));
  if (tiposAbertos.length === 0 && pedidos.length === 0 && bolsas.length === 0) return null;

  const cancelar = async (id) => {
    setErro('');
    const r = await supabase.rpc('bolsas_cancelar_pedido', { p_application: id });
    if (r.error) setErro('Não foi possível cancelar o pedido.');
    carregar();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-on-surface-variant">Bolsas</h3>
        {tiposAbertos.length > 0 && (
          <button onClick={() => setPedindo(true)} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
            <GraduationCap size={14} /> Pedir bolsa
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-error font-medium">{erro}</p>}
      {bolsas.filter(b => vigenteEm(b, hoje)).map(b => (
        <div key={b.id} className="p-3 bg-success/10 border border-success/30 rounded-zela-md text-sm">
          <p className="font-bold text-on-surface">{b.students?.name}: {b.scholarship_types?.nome}, {descricaoDoBeneficio(b)}</p>
          <p className="text-xs text-on-surface-variant">Vale de {dataBR(b.inicio)} até {dataBR(b.fim)}</p>
        </div>
      ))}
      {pedidos.map(p => (
        <div key={p.id} className="p-3 bg-surface-container-low border border-outline-variant rounded-zela-md text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-on-surface truncate">{p.students?.name}: {p.scholarship_types?.nome}</p>
            <span className="text-xs font-bold text-on-surface-variant shrink-0">{STATUS_PEDIDO[p.status]}</span>
          </div>
          {p.parecer && <p className="text-xs text-on-surface-variant mt-1 whitespace-pre-wrap">Parecer da escola: {p.parecer}</p>}
          {PEDIDO_ABERTO.includes(p.status) && (
            <button onClick={() => cancelar(p.id)} className="mt-1 text-xs font-bold text-primary hover:underline">Cancelar pedido</button>
          )}
        </div>
      ))}
      {pedindo && <PedirModal schoolId={schoolId} tipos={tiposAbertos} onClose={() => setPedindo(false)} onDone={() => { setPedindo(false); carregar(); }} />}
    </div>
  );
}

function PedirModal({ schoolId, tipos, onClose, onDone }) {
  const [alunos, setAlunos] = useState([]);
  const [alunoId, setAlunoId] = useState('');
  const [tipoId, setTipoId] = useState(tipos[0]?.id || '');
  const [renda, setRenda] = useState('');
  const [pessoas, setPessoas] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.from('student_guardians').select('student_id, students(id, name)').eq('is_financial', true).limit(20);
      if (!vivo) return;
      const lista = (data || []).map(r => r.students).filter(Boolean);
      setAlunos(lista);
      if (lista.length === 1) setAlunoId(lista[0].id);
    })();
    return () => { vivo = false; };
  }, []);

  const tipo = tipos.find(t => t.id === tipoId);
  const escolher = (e) => {
    const novos = Array.from(e.target.files || []);
    e.target.value = '';
    if (novos.some(f => f.size > MAX_BYTES)) { setErro('Cada arquivo pode ter até 10 MB.'); return; }
    setErro('');
    setArquivos(a => [...a, ...novos].slice(0, MAX_DOCUMENTOS));
  };

  const valido = alunoId && tipoId && Number(pessoas) >= 1 && justificativa.trim().length >= 10;

  const enviar = async () => {
    setEnviando(true);
    setErro('');
    try {
      const renda_cents = renda.trim() ? reaisParaCentavos(renda) : null;
      const r = await supabase.rpc('bolsas_enviar_pedido', {
        p_student: alunoId, p_type: tipoId, p_renda_cents: renda_cents, p_pessoas: Number(pessoas), p_justificativa: justificativa.trim(),
      });
      if (r.error) throw r.error;
      const pedidoId = r.data;
      let falhas = 0;
      for (const arq of arquivos) {
        const limpo = arq.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
        const path = `${schoolId}/${pedidoId}/${crypto.randomUUID()}-${limpo}`;
        const up = await supabase.storage.from('scholarships').upload(path, arq, { contentType: arq.type, upsert: false });
        if (up.error) { falhas += 1; continue; }
        const an = await supabase.rpc('bolsas_anexar_documento', { p_application: pedidoId, p_path: path, p_nome: arq.name });
        if (an.error) falhas += 1;
      }
      if (falhas > 0) {
        setErro(`O pedido foi enviado, mas ${falhas} documento(s) não subiram. Cancele e envie de novo, ou leve os documentos à escola.`);
        setEnviando(false);
        return;
      }
      onDone();
    } catch (err) {
      setErro(err.message || 'Não foi possível enviar o pedido.');
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest rounded-zela-xl shadow-lg p-6 max-h-[90vh] overflow-y-auto space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg text-on-surface">Pedir bolsa</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-md"><X size={18} /></button>
        </div>
        <select aria-label="Aluno" value={alunoId} onChange={e => setAlunoId(e.target.value)} className={inputCls}>
          <option value="">Escolha o aluno</option>
          {alunos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select aria-label="Tipo de bolsa" value={tipoId} onChange={e => setTipoId(e.target.value)} className={inputCls}>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}, {descricaoDoBeneficio(t)}</option>)}
        </select>
        {(tipo?.descricao || tipo?.criterios) && (
          <p className="text-xs text-on-surface-variant whitespace-pre-wrap">{[tipo.descricao, tipo.criterios].filter(Boolean).join('\n')}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <input type="text" inputMode="decimal" aria-label="Renda mensal da família em reais" placeholder="Renda mensal (R$)" value={renda} onChange={e => setRenda(e.target.value)} className={inputCls} />
          <input type="number" min="1" max="30" aria-label="Pessoas na casa" placeholder="Pessoas na casa" value={pessoas} onChange={e => setPessoas(e.target.value)} className={inputCls} />
        </div>
        <textarea rows={3} maxLength={1500} aria-label="Justificativa" placeholder="Conte por que a família precisa da bolsa" value={justificativa} onChange={e => setJustificativa(e.target.value)} className={inputCls} />
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-primary cursor-pointer">
            <Paperclip size={14} /> Anexar documentos (comprovante de renda, até {MAX_DOCUMENTOS})
            <input type="file" accept={TIPOS_ARQUIVO} multiple className="hidden" onChange={escolher} />
          </label>
          <ul className="mt-1 space-y-0.5">
            {arquivos.map((a, i) => (
              <li key={`${a.name}-${i}`} className="text-xs text-on-surface-variant flex justify-between gap-2">
                <span className="truncate">{a.name}</span>
                <button onClick={() => setArquivos(l => l.filter((_, j) => j !== i))} className="text-primary font-bold shrink-0">Remover</button>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-on-surface-variant">Renda e documentos ficam guardados em área privada, só a Gestão da escola vê, e são apagados 12 meses depois do fim da bolsa.</p>
        {erro && <p className="p-2 bg-error/10 border border-error/30 rounded-zela-md text-sm text-error font-medium">{erro}</p>}
        <button disabled={!valido || enviando} onClick={enviar}
          className="w-full bg-primary hover:bg-primary-container text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {enviando ? <Loader2 size={16} className="animate-spin" /> : 'Enviar pedido'}
        </button>
      </div>
    </div>
  );
}
