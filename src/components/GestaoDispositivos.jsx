import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, KeyRound, Power, Copy, Check, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  conexaoDoDispositivo, tempoDesde, validarNovoDispositivo, ROTULO_CONEXAO, ROTULO_STATUS, MODELOS_DISPOSITIVO,
} from '../lib/dispositivosAcesso';
import {
  PageShell, Field, inputCls, PrimaryButton, SecondaryButton, ResponsiveTable, EmptyState, Loading, Notice, Modal,
} from './GestaoShared';
import GestaoDispositivoPessoas from './GestaoDispositivoPessoas';

// Painel de dispositivos de acesso (Control iD, fase 7). Só a Gestão gerencia (as RPCs
// conferem papel e escola no banco). O token só existe em texto aqui, em memória, no
// momento em que é gerado: nunca vai para storage, log ou URL.
const CHIP = 'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap';
const CONEXAO_CLS = {
  online: 'bg-success/10 text-success border-success/30',
  offline: 'bg-error/10 text-error border-error/30',
  nunca: 'bg-surface-container text-on-surface-variant border-outline-variant',
};
const STATUS_CLS = {
  active: 'bg-success/10 text-success border-success/30',
  pending: 'bg-brass text-ink border-brass',
  disabled: 'bg-surface-container text-on-surface-variant border-outline-variant',
};

export default function GestaoDispositivos({ currentUser }) {
  const schoolId = currentUser.school_id;
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [agora, setAgora] = useState(Date.now());
  const [novo, setNovo] = useState(null); // { name, model, location } | null
  const [ocupado, setOcupado] = useState(false);
  const [tokenMostrado, setTokenMostrado] = useState(null); // { nome, token }
  const [copiado, setCopiado] = useState(false);
  const [pessoasDe, setPessoasDe] = useState(null); // dispositivo com o modal de pessoas aberto

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    const { data, error } = await supabase.rpc('listar_dispositivos_acesso', { p_school_id: schoolId });
    if (error) {
      console.warn('listar_dispositivos_acesso:', error.code, error.message);
      setErro(error.code === 'PGRST202' || error.code === '42883'
        ? 'O recurso de dispositivos ainda não foi habilitado neste ambiente (migration pendente).'
        : 'Não foi possível carregar os dispositivos.');
    } else { setErro(''); setLista(data || []); }
    setAgora(Date.now());
    setCarregando(false);
  }, [schoolId]);

  useEffect(() => { carregar(); }, [carregar]);
  // Atualiza o status online/offline sozinho (o limite é de 2 min).
  useEffect(() => {
    const t = setInterval(() => carregar(true), 30000);
    return () => clearInterval(t);
  }, [carregar]);

  const registrar = async () => {
    const msg = validarNovoDispositivo(novo);
    if (msg) { setErro(msg); return; }
    setErro(''); setAviso(''); setOcupado(true);
    const { data, error } = await supabase.rpc('registrar_dispositivo_acesso', {
      p_school_id: schoolId, p_name: novo.name.trim(), p_model: novo.model || null, p_location: novo.location || null,
    });
    setOcupado(false);
    if (error) {
      setErro(/duplicate|unique/i.test(error.message) ? 'Já existe um equipamento com esse nome.' : 'Não foi possível registrar o equipamento.');
      return;
    }
    const linha = Array.isArray(data) ? data[0] : data;
    setNovo(null);
    setCopiado(false);
    setTokenMostrado({ nome: novo.name.trim(), token: linha?.token || '' });
    carregar(true);
  };

  const girar = async (d) => {
    if (!window.confirm(`Girar o token de "${d.name}"? O equipamento para de se conectar até receber o novo token.`)) return;
    setErro(''); setAviso(''); setOcupado(true);
    const { data, error } = await supabase.rpc('girar_token_dispositivo_acesso', { p_id: d.id });
    setOcupado(false);
    if (error || !data) { setErro('Não foi possível girar o token.'); return; }
    setCopiado(false);
    setTokenMostrado({ nome: d.name, token: data });
    carregar(true);
  };

  const alternar = async (d) => {
    const proximo = d.status === 'disabled' ? 'active' : 'disabled';
    if (proximo === 'disabled' && !window.confirm(`Desativar "${d.name}"? Ele deixa de enviar eventos.`)) return;
    setErro(''); setAviso(''); setOcupado(true);
    const { error } = await supabase.rpc('definir_status_dispositivo_acesso', { p_id: d.id, p_status: proximo });
    setOcupado(false);
    if (error) { setErro('Não foi possível alterar o status.'); return; }
    setAviso(proximo === 'active' ? 'Equipamento ativado.' : 'Equipamento desativado.');
    carregar(true);
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(tokenMostrado.token); setCopiado(true); } catch { setErro('Não foi possível copiar. Selecione o token e copie manualmente.'); }
  };

  const colunas = [
    { label: 'Equipamento', primary: true, render: d => <span>{d.name}{d.model ? <span className="font-normal text-on-surface-variant"> · {d.model}</span> : null}</span> },
    { label: 'Local', render: d => d.location || '—' },
    { label: 'Status', render: d => <span className={`${CHIP} ${STATUS_CLS[d.status] || STATUS_CLS.disabled}`}>{ROTULO_STATUS[d.status] || d.status}</span> },
    {
      label: 'Conexão',
      render: d => {
        const c = conexaoDoDispositivo(d.last_seen_at, agora);
        return <span><span className={`${CHIP} ${CONEXAO_CLS[c]}`}>{ROTULO_CONEXAO[c]}</span> <span className="text-xs text-on-surface-variant">{c === 'nunca' ? '' : tempoDesde(d.last_seen_at, agora)}</span></span>;
      },
    },
    {
      label: 'Ações', actions: true,
      render: d => (
        <div className="flex gap-2">
          <SecondaryButton disabled={ocupado} onClick={() => setPessoasDe(d)}><Users size={14} /> Pessoas</SecondaryButton>
          <SecondaryButton disabled={ocupado} onClick={() => girar(d)}><KeyRound size={14} /> Girar token</SecondaryButton>
          <SecondaryButton disabled={ocupado} onClick={() => alternar(d)}><Power size={14} /> {d.status === 'disabled' ? 'Ativar' : 'Desativar'}</SecondaryButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell actions={<>
      <SecondaryButton onClick={() => carregar()} aria-label="Atualizar"><RefreshCw size={14} /> Atualizar</SecondaryButton>
      <PrimaryButton onClick={() => { setErro(''); setNovo({ name: '', model: MODELOS_DISPOSITIVO[0], location: '' }); }}><Plus size={14} /> Adicionar dispositivo</PrimaryButton>
    </>}>
      <div className="space-y-3 max-w-5xl">
        <Notice type="error">{erro}</Notice>
        <Notice type="success">{aviso}</Notice>
        {carregando ? <Loading /> : lista.length === 0
          ? <EmptyState icon={KeyRound} text="Nenhum dispositivo adicionado." hint="Adicione o leitor facial da escola para receber o token de conexão." />
          : <ResponsiveTable columns={colunas} rows={lista} />}
      </div>

      {novo && (
        <Modal title="Adicionar dispositivo" onClose={() => setNovo(null)} footer={<>
          <SecondaryButton onClick={() => setNovo(null)}>Cancelar</SecondaryButton>
          <PrimaryButton disabled={ocupado} onClick={registrar}>Adicionar</PrimaryButton>
        </>}>
          <Notice type="error">{erro}</Notice>
          <Field label="Nome" id="disp-nome" hint="Ex.: Portaria principal."><input id="disp-nome" maxLength={80} value={novo.name} onChange={e => setNovo({ ...novo, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Modelo" id="disp-modelo"><select id="disp-modelo" value={novo.model} onChange={e => setNovo({ ...novo, model: e.target.value })} className={inputCls}>
            {MODELOS_DISPOSITIVO.map(m => <option key={m} value={m}>{m}</option>)}
          </select></Field>
          <Field label="Local" id="disp-local"><input id="disp-local" maxLength={120} value={novo.location} onChange={e => setNovo({ ...novo, location: e.target.value })} className={inputCls} /></Field>
        </Modal>
      )}

      {pessoasDe && <GestaoDispositivoPessoas dispositivo={pessoasDe} schoolId={schoolId} onClose={() => setPessoasDe(null)} />}

      {tokenMostrado && (
        <Modal title={`Token de "${tokenMostrado.nome}"`} onClose={() => setTokenMostrado(null)} footer={<PrimaryButton onClick={() => setTokenMostrado(null)}>Já copiei, fechar</PrimaryButton>}>
          <Notice type="error">Guarde este token agora. Ele não será mostrado novamente; se perder, será preciso girar o token.</Notice>
          <code className="block p-3 rounded-zela-md bg-surface-container text-xs break-all select-all" data-testid="token-dispositivo">{tokenMostrado.token}</code>
          <SecondaryButton onClick={copiar}>{copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar token'}</SecondaryButton>
        </Modal>
      )}
    </PageShell>
  );
}
