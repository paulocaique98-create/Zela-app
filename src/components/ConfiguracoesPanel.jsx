import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, ShieldAlert, ImageIcon, Palette, Shield, Zap, Bell, Server } from 'lucide-react';

const CartaoImagem = ({ titulo, descricao, valor, Icone, ajuste, alt, onFile, onRemover, onSalvar, salvando, rotuloSalvar, msg }) => (
  <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-5">
    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-dev-bg border border-dev-border rounded-zela-md flex items-center justify-center shrink-0 overflow-hidden p-2">
      {valor ? <img src={valor} alt={alt} className={`w-full h-full ${ajuste}`} /> : <Icone className="text-dev-text-muted" size={32} />}
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-bold text-dev-text">{titulo}</h3>
      <p className="text-xs text-dev-text-muted mt-1">{descricao}</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <label className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[36px] px-4 rounded-zela-md border border-dev-border bg-dev-bg text-xs font-bold text-dev-text cursor-pointer hover:bg-dev-surface-high transition flex-1 sm:flex-none">
          Escolher arquivo
          <input type="file" accept="image/*" onChange={onFile} className="sr-only" />
        </label>
        <button
          onClick={onSalvar}
          disabled={salvando}
          className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[36px] px-4 bg-dev-primary hover:brightness-110 disabled:opacity-60 text-white font-bold rounded-zela-md transition text-xs whitespace-nowrap flex-1 sm:flex-none"
        >
          {salvando ? 'Salvando...' : rotuloSalvar}
        </button>
        {valor && (
          <button onClick={onRemover} className="min-h-[44px] sm:min-h-[36px] px-3 text-error text-xs font-bold hover:bg-error/10 rounded-zela-md transition">
            Remover
          </button>
        )}
      </div>
      {msg && <p className={`text-xs font-medium mt-2 ${msg.startsWith('Erro') ? 'text-error' : 'text-success'}`}>{msg}</p>}
    </div>
  </div>
);

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
    <span className="bg-dev-surface-high text-dev-text-muted text-[11px] font-bold px-2 py-0.5 rounded-zela-sm ml-2">
      Em breve
    </span>
  );

  return (
    <div className="h-full flex flex-col bg-dev-surface -m-3 sm:m-0 p-4 sm:p-6 rounded-none shadow-none border-0 overflow-hidden">
      {/* Título "Configurações do Sistema" removido (o Header do app já
          mostra o nome da tela dinamicamente); ícone + descrição numa linha
          compacta (descrição sempre visível, mantém o ícone). */}
      <div className="flex items-center gap-2.5 mb-4 shrink-0">
        <div className="bg-dev-primary-container p-2 rounded-zela-md text-dev-primary shrink-0">
          <Settings size={18} />
        </div>
        <p className="text-small text-dev-text-muted">Parâmetros globais do Zela Escola</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none shrink-0 mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-dev-border" role="tablist">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-zela-md text-sm font-bold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-dev-primary-container text-dev-primary shadow-sm border border-dev-primary/10'
                  : 'text-dev-text-muted hover:bg-dev-bg border border-transparent'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-24">
        
        {/* ABA: APARÊNCIA */}
        {activeTab === 'appearance' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-5xl">
            <CartaoImagem
              titulo="Logo Global (Zela Escola)"
              descricao="Selecione uma imagem (PNG, JPG) para alterar a logo no cabeçalho do sistema."
              valor={zelaGlobalLogo}
              Icone={ShieldAlert}
              ajuste="object-contain"
              alt="Logo global"
              onFile={handleGlobalFileChange}
              onRemover={() => setZelaGlobalLogo('')}
              onSalvar={handleSaveGlobalLogo}
              salvando={logoSaving}
              rotuloSalvar="Salvar logo"
              msg={logoMsg}
            />
            <CartaoImagem
              titulo="Imagem da Tela de Login"
              descricao="Substitui a ilustração padrão (gradiente com escudo) no painel esquerdo da tela de login. Se não for definida, mantém o padrão atual."
              valor={loginImage}
              Icone={ImageIcon}
              ajuste="object-cover"
              alt="Imagem de login"
              onFile={handleLoginImageFileChange}
              onRemover={() => setLoginImage('')}
              onSalvar={handleSaveLoginImage}
              salvando={loginImageSaving}
              rotuloSalvar="Salvar imagem"
              msg={loginImageMsg}
            />
          </div>
        )}

        {/* ABA: GERAL */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6 max-w-3xl">
              <h3 className="font-bold text-dev-text mb-4 flex items-center">Dados Básicos <PlaceholderBadge /></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-dev-text-muted mb-1">Nome do Sistema</label>
                  <input type="text" disabled value="Zela Escola" className="w-full p-2.5 border border-dev-border bg-dev-bg rounded-zela-md text-dev-text-muted text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dev-text-muted mb-1">E-mail de Suporte</label>
                  <input type="text" disabled value="suporte@zelaportal.com" className="w-full p-2.5 border border-dev-border bg-dev-bg rounded-zela-md text-dev-text-muted text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dev-text-muted mb-1">Idioma Padrão</label>
                  <select disabled className="w-full p-2.5 border border-dev-border bg-dev-bg rounded-zela-md text-dev-text-muted text-sm">
                    <option>Português (Brasil)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-dev-text-muted mb-1">Fuso Horário</label>
                  <select disabled className="w-full p-2.5 border border-dev-border bg-dev-bg rounded-zela-md text-dev-text-muted text-sm">
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
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Política de Senhas <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted mb-4">Configurações de exigência e força de senha para novos usuários.</p>
            </div>
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Sessões Ativas <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted mb-4">Gerenciamento de dispositivos e sessões conectadas.</p>
              <button disabled className="px-4 py-2 bg-dev-surface-high text-dev-text-muted font-bold rounded-lg text-xs cursor-not-allowed">Encerrar todas as sessões</button>
            </div>
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Logs de Acesso <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted">Histórico de logins de administradores de escolas.</p>
            </div>
          </div>
        )}

        {/* ABA: INTEGRAÇÕES */}
        {activeTab === 'integrations' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Chaves de API <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted mb-4">Geração e revogação de tokens para integrações externas via REST API.</p>
            </div>
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Webhooks <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted">Configuração de URLs de callback para eventos do sistema (ex: check-ins em tempo real).</p>
            </div>
          </div>
        )}

        {/* ABA: NOTIFICAÇÕES */}
        {activeTab === 'notifications' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">E-mails Automáticos <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted">Gatilhos de e-mail para eventos como novos cadastros, suspensão e reset de senhas.</p>
            </div>
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Alertas do Sistema <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted">Notificações internas sobre uso de cotas e erros operacionais críticos.</p>
            </div>
          </div>
        )}

        {/* ABA: BACKUP */}
        {activeTab === 'backup' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6 border-l-4 border-l-amber-400">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Modo Manutenção <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted mb-4">Bloqueia temporariamente o acesso aos portais da Escola e Família exibindo uma mensagem customizada.</p>
              <div className="flex items-center gap-2">
                <div className="w-10 h-5 bg-dev-surface-high rounded-full cursor-not-allowed"></div>
                <span className="text-xs font-bold text-dev-text-muted">Sistema Online</span>
              </div>
            </div>
            <div className="bg-dev-surface border border-dev-border rounded-zela-lg p-4 sm:p-6">
              <h3 className="font-bold text-dev-text mb-2 flex items-center">Backup Manual <PlaceholderBadge /></h3>
              <p className="text-small text-dev-text-muted mb-4">Geração de dump do banco de dados (estruturas e logs).</p>
              <button disabled className="px-4 py-2 bg-dev-surface-high text-dev-text-muted font-bold rounded-lg text-xs cursor-not-allowed">Solicitar Backup</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
