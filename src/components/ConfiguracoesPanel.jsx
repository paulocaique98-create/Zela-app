import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, ShieldAlert, ImageIcon, Palette, Shield, Zap, Bell, Server } from 'lucide-react';

export default function ConfiguracoesPanel({ onUpdateGlobalLogo }) {
  const [activeTab, setActiveTab] = useState('appearance');

  // --- LOGO GLOBAL LOGIC ---
  const [zelaGlobalLogo, setZelaGlobalLogo] = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');

  useEffect(() => {
    const fetchLogo = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'global_logo')
        .maybeSingle();
      if (data) setZelaGlobalLogo(data.value);
    };
    fetchLogo();
  }, []);

  const handleSaveGlobalLogo = async () => {
    setLogoSaving(true);
    setLogoMsg('');
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'global_logo', value: zelaGlobalLogo || '' }, { onConflict: 'key' });
      if (error) throw error;
      setLogoMsg('Logo salva com sucesso!');
      if (onUpdateGlobalLogo) onUpdateGlobalLogo();
    } catch (e) {
      setLogoMsg('Erro ao salvar: ' + e.message);
    } finally {
      setLogoSaving(false);
      setTimeout(() => setLogoMsg(''), 3000);
    }
  };

  const handleGlobalFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setZelaGlobalLogo(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };
  // -------------------------

  // --- IMAGEM DA TELA DE LOGIN ---
  // Mesmo padrão de global_logo, mas exposto por uma policy de leitura
  // PÚBLICA restrita a essa chave (Login.jsx é visto por usuário não
  // autenticado -- ver migration 20260901i).
  const [loginImage, setLoginImage] = useState('');
  const [loginImageSaving, setLoginImageSaving] = useState(false);
  const [loginImageMsg, setLoginImageMsg] = useState('');

  useEffect(() => {
    const fetchLoginImage = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'login_image_url')
        .maybeSingle();
      if (data) setLoginImage(data.value);
    };
    fetchLoginImage();
  }, []);

  const handleSaveLoginImage = async () => {
    setLoginImageSaving(true);
    setLoginImageMsg('');
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'login_image_url', value: loginImage || '' }, { onConflict: 'key' });
      if (error) throw error;
      setLoginImageMsg('Imagem salva com sucesso!');
    } catch (e) {
      setLoginImageMsg('Erro ao salvar: ' + e.message);
    } finally {
      setLoginImageSaving(false);
      setTimeout(() => setLoginImageMsg(''), 3000);
    }
  };

  const handleLoginImageFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLoginImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };
  // -------------------------------

  const tabs = [
    { id: 'appearance', label: 'Aparência (Logo)', icon: Palette },
    { id: 'general', label: 'Geral', icon: Settings },
    { id: 'security', label: 'Segurança', icon: Shield },
    { id: 'integrations', label: 'Integrações', icon: Zap },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'backup', label: 'Backup e Manutenção', icon: Server },
  ];

  const PlaceholderBadge = () => (
    <span className="bg-surface-container text-on-surface-variant text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ml-2">
      Em breve
    </span>
  );

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest p-5 md:p-6 rounded-zela-xl shadow-sm border border-outline-variant overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0 border-b border-outline-variant pb-4">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <Settings size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Configurações do Sistema</h2>
          <p className="text-small text-on-surface-variant">Parâmetros globais do Zela Portal</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto shrink-0 mb-6 pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-zela-md text-sm font-bold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-primary/10 text-primary shadow-sm border border-primary/10' 
                  : 'text-on-surface-variant hover:bg-surface-container-low border border-transparent'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        
        {/* ABA: APARÊNCIA */}
        {activeTab === 'appearance' && (
          <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm mb-4 max-w-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="w-16 h-16 bg-surface-container-low border border-outline-variant rounded-zela-md flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-2">
                {zelaGlobalLogo ? (
                  <img src={zelaGlobalLogo} alt="Global Logo" className="w-full h-full object-contain" />
                ) : (
                  <ShieldAlert className="text-on-surface-variant/70" size={32} />
                )}
              </div>
              <div className="flex-1 w-full space-y-2">
                <h3 className="text-sm font-bold text-on-surface">Logo Global (Zela Portal)</h3>
                <p className="text-xs text-on-surface-variant">Selecione uma imagem (PNG, JPG) para alterar a logo no cabeçalho do sistema.</p>
                <div className="flex gap-2 items-center mt-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGlobalFileChange}
                    className="block w-full text-small text-on-surface-variant
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-xs file:font-bold
                      file:bg-primary/10 file:text-primary
                      hover:file:bg-indigo-100 cursor-pointer"
                  />
                  {zelaGlobalLogo && (
                    <button
                      onClick={() => setZelaGlobalLogo('')}
                      className="px-3 text-red-500 text-xs font-bold hover:bg-red-50 rounded-zela-md transition h-9 shrink-0"
                    >
                      Remover
                    </button>
                  )}
                  <button
                    onClick={handleSaveGlobalLogo}
                    disabled={logoSaving}
                    className="px-4 py-2 bg-primary hover:bg-primary-container disabled:opacity-60 text-white font-bold rounded-lg transition text-xs whitespace-nowrap h-9 shrink-0"
                  >
                    {logoSaving ? 'Salvando...' : 'Salvar Logo'}
                  </button>
                </div>
                {logoMsg && (
                  <p className={`text-xs font-medium mt-1 ${logoMsg.startsWith('Erro') ? 'text-red-600' : 'text-green-600'}`}>{logoMsg}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA: APARÊNCIA — imagem da tela de login */}
        {activeTab === 'appearance' && (
          <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm mb-4 max-w-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="w-16 h-16 bg-surface-container-low border border-outline-variant rounded-zela-md flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-2">
                {loginImage ? (
                  <img src={loginImage} alt="Imagem de Login" className="w-full h-full object-cover rounded" />
                ) : (
                  <ImageIcon className="text-on-surface-variant/70" size={32} />
                )}
              </div>
              <div className="flex-1 w-full space-y-2">
                <h3 className="text-sm font-bold text-on-surface">Imagem da Tela de Login</h3>
                <p className="text-xs text-on-surface-variant">Substitui a ilustração padrão (gradiente com escudo) no painel esquerdo da tela de login. Se não for definida, mantém o padrão atual.</p>
                <div className="flex gap-2 items-center mt-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLoginImageFileChange}
                    className="block w-full text-small text-on-surface-variant
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-xs file:font-bold
                      file:bg-primary/10 file:text-primary
                      hover:file:bg-indigo-100 cursor-pointer"
                  />
                  {loginImage && (
                    <button
                      onClick={() => setLoginImage('')}
                      className="px-3 text-red-500 text-xs font-bold hover:bg-red-50 rounded-zela-md transition h-9 shrink-0"
                    >
                      Remover
                    </button>
                  )}
                  <button
                    onClick={handleSaveLoginImage}
                    disabled={loginImageSaving}
                    className="px-4 py-2 bg-primary hover:bg-primary-container disabled:opacity-60 text-white font-bold rounded-lg transition text-xs whitespace-nowrap h-9 shrink-0"
                  >
                    {loginImageSaving ? 'Salvando...' : 'Salvar Imagem'}
                  </button>
                </div>
                {loginImageMsg && (
                  <p className={`text-xs font-medium mt-1 ${loginImageMsg.startsWith('Erro') ? 'text-red-600' : 'text-green-600'}`}>{loginImageMsg}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA: GERAL */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm max-w-3xl">
              <h3 className="font-bold text-on-surface mb-4 flex items-center">Dados Básicos <PlaceholderBadge /></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Nome do Sistema</label>
                  <input type="text" disabled value="Zela Portal" className="w-full p-2.5 border border-outline-variant bg-surface-container-low rounded-zela-md text-on-surface-variant/70 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">E-mail de Suporte</label>
                  <input type="text" disabled value="suporte@zelaportal.com" className="w-full p-2.5 border border-outline-variant bg-surface-container-low rounded-zela-md text-on-surface-variant/70 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Idioma Padrão</label>
                  <select disabled className="w-full p-2.5 border border-outline-variant bg-surface-container-low rounded-zela-md text-on-surface-variant/70 text-sm">
                    <option>Português (Brasil)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Fuso Horário</label>
                  <select disabled className="w-full p-2.5 border border-outline-variant bg-surface-container-low rounded-zela-md text-on-surface-variant/70 text-sm">
                    <option>America/Sao_Paulo</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: SEGURANÇA */}
        {activeTab === 'security' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Política de Senhas <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant mb-4">Configurações de exigência e força de senha para novos usuários.</p>
            </div>
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Sessões Ativas <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant mb-4">Gerenciamento de dispositivos e sessões conectadas.</p>
              <button disabled className="px-4 py-2 bg-surface-container text-on-surface-variant/70 font-bold rounded-lg text-xs cursor-not-allowed">Encerrar todas as sessões</button>
            </div>
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Logs de Acesso <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant">Histórico de logins de administradores de escolas.</p>
            </div>
          </div>
        )}

        {/* ABA: INTEGRAÇÕES */}
        {activeTab === 'integrations' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Chaves de API <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant mb-4">Geração e revogação de tokens para integrações externas via REST API.</p>
            </div>
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Webhooks <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant">Configuração de URLs de callback para eventos do sistema (ex: check-ins em tempo real).</p>
            </div>
          </div>
        )}

        {/* ABA: NOTIFICAÇÕES */}
        {activeTab === 'notifications' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">E-mails Automáticos <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant">Gatilhos de e-mail para eventos como novos cadastros, suspensão e reset de senhas.</p>
            </div>
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Alertas do Sistema <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant">Notificações internas sobre uso de cotas e erros operacionais críticos.</p>
            </div>
          </div>
        )}

        {/* ABA: BACKUP */}
        {activeTab === 'backup' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm border-l-4 border-l-amber-400">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Modo Manutenção <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant mb-4">Bloqueia temporariamente o acesso aos portais da Escola e Família exibindo uma mensagem customizada.</p>
              <div className="flex items-center gap-2">
                <div className="w-10 h-5 bg-slate-200 rounded-full cursor-not-allowed"></div>
                <span className="text-xs font-bold text-on-surface-variant/70">Sistema Online</span>
              </div>
            </div>
            <div className="bg-white border border-outline-variant rounded-zela-lg p-6 shadow-sm">
              <h3 className="font-bold text-on-surface mb-2 flex items-center">Backup Manual <PlaceholderBadge /></h3>
              <p className="text-small text-on-surface-variant mb-4">Geração de dump do banco de dados (estruturas e logs).</p>
              <button disabled className="px-4 py-2 bg-surface-container text-on-surface-variant/70 font-bold rounded-lg text-xs cursor-not-allowed">Solicitar Backup</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
