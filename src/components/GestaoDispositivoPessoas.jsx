import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  proximoIdExterno, validarVinculo, ROTULO_COMANDO, ROTULO_COMANDO_STATUS,
} from '../lib/dispositivosAcesso';
import { Field, inputCls, PrimaryButton, SecondaryButton, ResponsiveTable, Loading, Notice, Modal } from './GestaoShared';

// Vínculo pessoa↔equipamento (Control iD). Só pessoas autorizadas (responsável pelo app
// fica para a fase 8). Nenhuma biometria passa por aqui: a foto é lida do Storage pela
// Edge Function só no envio, e o banco confere o consentimento biométrico.
export default function GestaoDispositivoPessoas({ dispositivo, schoolId, onClose }) {
  const [vinculos, setVinculos] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [comandos, setComandos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState({ pessoaId: '', externalId: '' });

  const carregar = useCallback(async () => {
    const [v, p, c] = await Promise.all([
      supabase.rpc('listar_vinculos_dispositivo', { p_device_ref: dispositivo.id }),
      supabase.from('authorized_persons').select('id, name, relation, status').eq('school_id', schoolId).order('name').limit(500),
      supabase.rpc('listar_comandos_dispositivo', { p_device_ref: dispositivo.id }),
    ]);
    if (v.error || p.error) {
      console.warn('vinculos:', v.error?.code, p.error?.code);
      setErro('Não foi possível carregar os vínculos.');
    } else {
      setErro('');
      setVinculos(v.data || []);
      setPessoas(p.data || []);
      setForm(f => ({ ...f, externalId: f.externalId || String(proximoIdExterno(v.data)) }));
    }
    setComandos(c.error ? [] : (c.data || []));
    setCarregando(false);
  }, [dispositivo.id, schoolId]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeDe = (id) => pessoas.find(p => p.id === id)?.name || 'Pessoa removida';
  const ultimoComando = (extId) => comandos.find(c => Number(c.external_user_id) === Number(extId));

  const enfileirar = async (cmd, extId) => {
    const { error } = await supabase.rpc('enfileirar_comando_dispositivo', {
      p_device_ref: dispositivo.id, p_command: cmd, p_external_user_id: extId,
    });
    return error;
  };

  const vincular = async () => {
    const msg = validarVinculo(form, vinculos);
    if (msg) { setErro(msg); return; }
    setErro(''); setAviso(''); setOcupado(true);
    const { error } = await supabase.rpc('vincular_pessoa_dispositivo', {
      p_device_ref: dispositivo.id, p_external_user_id: Number(form.externalId), p_authorized_person_id: form.pessoaId,
    });
    setOcupado(false);
    if (error) { setErro('Não foi possível vincular a pessoa.'); return; }
    setAviso('Pessoa vinculada. Use "Enviar ao equipamento" para cadastrá-la no aparelho.');
    setForm({ pessoaId: '', externalId: '' });
    carregar();
  };

  // Cadastra o usuário e envia a foto. Se a foto não puder ir (sem consentimento
  // biométrico ou sem foto), o cadastro já na fila e o motivo é mostrado.
  const enviar = async (v) => {
    setErro(''); setAviso(''); setOcupado(true);
    const e1 = await enfileirar('create_user', v.external_user_id);
    if (e1) { setOcupado(false); setErro(e1.message?.includes('igual pendente') ? 'Já há um envio pendente para essa pessoa.' : 'Não foi possível enfileirar o cadastro.'); return; }
    const e2 = await enfileirar('set_photo', v.external_user_id);
    setOcupado(false);
    setAviso(e2 ? `Cadastro na fila, mas a foto não foi enviada: ${e2.message}` : 'Cadastro e foto na fila. O equipamento busca no próximo contato.');
    carregar();
  };

  const remover = async (v) => {
    if (!window.confirm(`Remover "${nomeDe(v.authorized_person_id)}" deste equipamento? O cadastro no aparelho também será apagado.`)) return;
    setErro(''); setAviso(''); setOcupado(true);
    // Primeiro enfileira a exclusão no aparelho; só então desfaz o vínculo.
    const e1 = await enfileirar('delete_user', v.external_user_id);
    if (e1 && !e1.message?.includes('igual pendente')) { setOcupado(false); setErro('Não foi possível enfileirar a remoção no aparelho.'); return; }
    const { error } = await supabase.rpc('desvincular_pessoa_dispositivo', { p_link_id: v.id });
    setOcupado(false);
    if (error) { setErro('Remoção enfileirada, mas não foi possível desfazer o vínculo.'); } else setAviso('Pessoa removida.');
    carregar();
  };

  const disponiveis = pessoas.filter(p => !vinculos.some(v => v.authorized_person_id === p.id));

  const colunas = [
    { label: 'Pessoa', primary: true, render: v => nomeDe(v.authorized_person_id) },
    { label: 'Nº no aparelho', render: v => v.external_user_id },
    {
      label: 'Último envio',
      render: v => {
        const c = ultimoComando(v.external_user_id);
        if (!c) return '—';
        return <span>{ROTULO_COMANDO[c.command] || c.command}: {ROTULO_COMANDO_STATUS[c.status] || c.status}{c.status === 'failed' && c.last_error ? <span className="text-xs text-error"> ({c.last_error})</span> : null}</span>;
      },
    },
    {
      label: 'Ações', actions: true,
      render: v => (
        <div className="flex gap-2">
          <SecondaryButton disabled={ocupado} onClick={() => enviar(v)}><Send size={14} /> Enviar ao equipamento</SecondaryButton>
          <SecondaryButton disabled={ocupado} onClick={() => remover(v)}><Trash2 size={14} /> Remover</SecondaryButton>
        </div>
      ),
    },
  ];

  return (
    <Modal wide title={`Pessoas em "${dispositivo.name}"`} onClose={onClose} footer={<SecondaryButton onClick={onClose}>Fechar</SecondaryButton>}>
      <Notice type="error">{erro}</Notice>
      <Notice type="success">{aviso}</Notice>
      {carregando ? <Loading /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] items-end">
            <Field label="Pessoa autorizada" id="vinc-pessoa">
              <select id="vinc-pessoa" value={form.pessoaId} onChange={e => setForm({ ...form, pessoaId: e.target.value })} className={inputCls}>
                <option value="">Selecione…</option>
                {disponiveis.map(p => <option key={p.id} value={p.id}>{p.name}{p.relation ? ` (${p.relation})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Nº no aparelho" id="vinc-num">
              <input id="vinc-num" inputMode="numeric" value={form.externalId} onChange={e => setForm({ ...form, externalId: e.target.value.replace(/\D/g, '') })} className={inputCls} />
            </Field>
            <PrimaryButton disabled={ocupado} onClick={vincular}><UserPlus size={14} /> Vincular</PrimaryButton>
          </div>
          {vinculos.length === 0
            ? <p className="text-sm text-on-surface-variant">Nenhuma pessoa vinculada a este equipamento.</p>
            : <ResponsiveTable columns={colunas} rows={vinculos} />}
        </div>
      )}
    </Modal>
  );
}
