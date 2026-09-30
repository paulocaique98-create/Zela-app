import React from 'react';
import CampoCep from './CampoCep';
import { UFS } from '../lib/cep';

// Endereço da escola por campos (30/09/2026): CEP primeiro, com busca
// automática; depois rua, número, complemento, bairro, cidade e UF. Usado no
// Portal do Dev (Editar/Nova Escola) e nas Configurações da escola. O banco
// monta sozinho o texto completo usado no contrato (schools.address).
// codigo_ibge: código do município (nota fiscal), preenchido pela busca do CEP.
export const CAMPOS_ENDERECO_ESCOLA = ['zip_code', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'codigo_ibge'];

export function enderecoDaEscola(school) {
  return Object.fromEntries(CAMPOS_ENDERECO_ESCOLA.map(c => [c, school?.[c] || '']));
}

export default function CamposEnderecoEscola({ valores, onChange, inputCls, labelCls, classeMensagem, prefixoId = 'escola' }) {
  const set = (campo, valor) => onChange({ ...valores, [campo]: valor });
  const aoEncontrar = (e) => onChange({
    ...valores,
    street: e.rua || valores.street,
    neighborhood: e.bairro || valores.neighborhood,
    city: e.cidade || valores.city,
    state: e.uf || valores.state,
    codigo_ibge: e.ibge || '',
  });
  // Cidade ou UF mudadas à mão: o código do IBGE deixa de valer.
  const setLocal = (campo, valor) => onChange({ ...valores, [campo]: valor, codigo_ibge: '' });

  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-6 sm:col-span-2">
        <label htmlFor={`${prefixoId}-cep`} className={labelCls}>CEP</label>
        <CampoCep id={`${prefixoId}-cep`} value={valores.zip_code} onChange={v => set('zip_code', v)} onEncontrado={aoEncontrar}
          focarDepois={`${prefixoId}-numero`} className={inputCls} classeMensagem={classeMensagem} />
      </div>
      <div className="col-span-6 sm:col-span-4">
        <label htmlFor={`${prefixoId}-rua`} className={labelCls}>Rua</label>
        <input id={`${prefixoId}-rua`} type="text" value={valores.street} onChange={e => set('street', e.target.value)} className={inputCls} />
      </div>
      <div className="col-span-2">
        <label htmlFor={`${prefixoId}-numero`} className={labelCls}>Número</label>
        <input id={`${prefixoId}-numero`} type="text" value={valores.number} onChange={e => set('number', e.target.value)} className={inputCls} />
      </div>
      <div className="col-span-4">
        <label htmlFor={`${prefixoId}-complemento`} className={labelCls}>Complemento</label>
        <input id={`${prefixoId}-complemento`} type="text" value={valores.complement} onChange={e => set('complement', e.target.value)} placeholder="Opcional" className={inputCls} />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <label htmlFor={`${prefixoId}-bairro`} className={labelCls}>Bairro</label>
        <input id={`${prefixoId}-bairro`} type="text" value={valores.neighborhood} onChange={e => set('neighborhood', e.target.value)} className={inputCls} />
      </div>
      <div className="col-span-4 sm:col-span-3">
        <label htmlFor={`${prefixoId}-cidade`} className={labelCls}>Cidade</label>
        <input id={`${prefixoId}-cidade`} type="text" value={valores.city} onChange={e => setLocal('city', e.target.value)} className={inputCls} />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor={`${prefixoId}-uf`} className={labelCls}>UF</label>
        <select id={`${prefixoId}-uf`} value={valores.state} onChange={e => setLocal('state', e.target.value)} className={inputCls}>
          <option value="">··</option>
          {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </div>
      {valores.codigo_ibge && (
        <p className={`col-span-6 text-[11px] -mt-1 ${classeMensagem || 'text-on-surface-variant'}`}>Código do município (IBGE): {valores.codigo_ibge}</p>
      )}
    </div>
  );
}
