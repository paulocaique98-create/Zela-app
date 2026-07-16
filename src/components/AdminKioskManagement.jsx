import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Smartphone, CheckCircle2, AlertCircle, Trash2, ShieldAlert } from 'lucide-react';

export default function AdminKioskManagement({ currentSchool }) {
  const [kiosks, setKiosks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const schoolId = currentSchool?.id || currentSchool?.school_id || null;

  const fetchKiosks = async () => {
    if (!schoolId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('kiosk_devices')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setKiosks(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKiosks();
  }, [schoolId]);

  const handleRevoke = async (kioskId) => {
    if (!window.confirm('Tem certeza que deseja revogar o acesso deste Totem? Ele deixará de funcionar imediatamente.')) return;
    
    try {
      const { error } = await supabase
        .from('kiosk_devices')
        .update({ is_active: false })
        .eq('id', kioskId);
        
      if (!error) {
        setKiosks(prev => prev.map(k => k.id === kioskId ? { ...k, is_active: false } : k));
      } else {
        alert('Erro ao revogar acesso do Totem.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = async (kioskId) => {
    if (!window.confirm('Tem certeza que deseja apagar este Totem do histórico?')) return;
    try {
      const { error } = await supabase.from('kiosk_devices').delete().eq('id', kioskId);
      if (!error) {
        setKiosks(prev => prev.filter(k => k.id !== kioskId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gerenciar Totens</h2>
          <p className="text-slate-500 text-sm mt-1">
            Controle os dispositivos pareados na escola. Revogue o acesso em caso de perda ou manutenção.
          </p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex flex-col gap-3 w-full lg:w-auto lg:min-w-[300px]">
          <div>
            <p className="text-xs font-bold text-indigo-800">Código da sua Escola para pareamento:</p>
            <code className="block mt-1 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 font-mono text-sm select-all uppercase">
              {currentSchool.school_code || '---'}
            </code>
          </div>
          <div className="pt-3 border-t border-indigo-100">
            <p className="text-xs font-bold text-indigo-800">Acesso ao Totem:</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="block flex-1 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 text-slate-500 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap" title={`${window.location.origin}/totem`}>
                {window.location.origin}/totem
              </code>
              <a 
                href="/totem" 
                target="_blank" 
                rel="noreferrer"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 shadow-sm"
              >
                Abrir Totem
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : kiosks.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Smartphone className="text-slate-300" size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Nenhum totem pareado</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Acesse a rota <strong className="text-slate-700">/totem</strong> no dispositivo que ficará na recepção para configurá-lo usando o Código da Escola acima.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {kiosks.map(kiosk => (
              <div key={kiosk.id} className="p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    kiosk.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {kiosk.is_active ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                      {kiosk.device_name}
                      {!kiosk.is_active && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-md uppercase tracking-wider font-bold">
                          Bloqueado
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 font-mono">
                      Token final: ...{kiosk.device_token.slice(-8)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Criado em: {new Date(kiosk.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {kiosk.is_active ? (
                    <button 
                      onClick={() => handleRevoke(kiosk.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors border border-amber-200"
                    >
                      <ShieldAlert size={16} /> Revogar Acesso
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleRemove(kiosk.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors"
                    >
                      <Trash2 size={16} /> Remover Histórico
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
