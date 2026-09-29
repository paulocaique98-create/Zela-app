import React, { lazy, Suspense, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Home, Wallet, Clock, ClipboardCheck, GraduationCap, FileText, Users, UserPlus, Folders, School, Settings,
  Inbox, FileWarning, FileSignature, FilePlus2, PenLine, LayoutTemplate, PieChart, ReceiptText, AlertOctagon,
  HandCoins, Receipt, Truck, CalendarDays, BookOpen, CalendarRange, ClipboardList, NotebookPen, Megaphone,
  Image as ImageIcon, BarChart3, ShieldCheck, ScrollText, KeyRound, Plug, MessageSquare, UserCheck, UserX, ScanFace, UsersRound,
  UtensilsCrossed, BookMarked, Soup, MessageCircle, X, Maximize2, Minimize2,
} from 'lucide-react';
import { SidebarItem, SidebarGroup, SidebarToggleButton } from './SidebarNav';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { supabase } from '../lib/supabase';
import GestaoInicio from './GestaoInicio';
import { usePendingUsersCount } from '../hooks/usePendingUsersCount';
import { useMenuClicks } from '../hooks/useMenuClicks';
import { PageShell, Tabs } from './GestaoShared';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import { podeVerAba, recursosDoPerfil, ABAS_GESTAO_PEDAGOGICA, PAPEL_GESTAO_PEDAGOGICA } from '../lib/perfisGestao';

const AdminRelatorioHorasExtras = lazy(() => import('./AdminRelatorioHorasExtras'));
const AdminAttendanceCorrections = lazy(() => import('./AdminAttendanceCorrections'));
const GestaoAlunos = lazy(() => import('./GestaoAlunos'));
const GestaoAlunoPerfil = lazy(() => import('./GestaoAlunoPerfil'));
const AdminMatriculas = lazy(() => import('./AdminMatriculas'));
// Cadastros e Configurações: mesmas telas do Admin, reaproveitadas. As
// permissões (aprovar, excluir, criar admin, turmas, cobrança) mudam pelo
// papel do usuário -- hierarquia de contas de 27/09/2026.
const AdminUserManagement = lazy(() => import('./AdminUserManagement'));
const AdminUserRegistration = lazy(() => import('./AdminUserRegistration'));
const AdminFuncionarios = lazy(() => import('./AdminFuncionarios'));
const AdminSettings = lazy(() => import('./AdminSettings'));
const TurmasSection = lazy(() => import('./AdminSettings').then(m => ({ default: m.TurmasSection })));
// Financeiro: abas do AdminFinanceiro viram itens de menu próprios.
const CobrancasTab = lazy(() => import('./AdminFinanceiro').then(m => ({ default: m.CobrancasTab })));
const MensalidadesTab = lazy(() => import('./AdminFinanceiro').then(m => ({ default: m.ContratosTab })));
const GatewayConfigTab = lazy(() => import('./AdminFinanceiro').then(m => ({ default: m.ConfigTab })));
// Telas novas do Portal da Gestão.
const GestaoPendencias = lazy(() => import('./GestaoPendencias'));
const GestaoDocumentosPendentes = lazy(() => import('./GestaoDocumentosPendentes'));
const GestaoContratos = lazy(() => import('./GestaoContratos'));
const GestaoVisaoFinanceira = lazy(() => import('./GestaoVisaoFinanceira'));
const GestaoRecebimentos = lazy(() => import('./GestaoRecebimentos'));
const GestaoDespesas = lazy(() => import('./GestaoDespesas'));
const GestaoFornecedores = lazy(() => import('./GestaoFornecedores'));
const GestaoAnoLetivo = lazy(() => import('./GestaoAnoLetivo'));
const GestaoOcorrencias = lazy(() => import('./GestaoOcorrencias'));
const GestaoRelatorios = lazy(() => import('./GestaoRelatorios'));
const GestaoPermissoes = lazy(() => import('./GestaoPermissoes'));
const GestaoIntegracoes = lazy(() => import('./GestaoIntegracoes'));
const GestaoExclusoesConta = lazy(() => import('./GestaoExclusoesConta'));
const GestaoLimpezaBiometria = lazy(() => import('./GestaoLimpezaBiometria'));
const GestaoUnificarResponsaveis = lazy(() => import('./GestaoUnificarResponsaveis'));
const ConfigComunicacao = lazy(() => import('./GestaoConfiguracoes').then(m => ({ default: m.ConfigComunicacao })));
const ConfigSeguranca = lazy(() => import('./GestaoConfiguracoes').then(m => ({ default: m.ConfigSeguranca })));
// Telas do Admin reaproveitadas (a RLS de cada tabela já aceita gestao).
const AdminDailyPresence = lazy(() => import('./AdminDailyPresence'));
const AdminFrequencia = lazy(() => import('./AdminFrequencia'));
const AdminMitigacao = lazy(() => import('./AdminMitigacao'));
const AdminCalendario = lazy(() => import('./AdminCalendario'));
const AdminCadastroComunicados = lazy(() => import('./AdminCadastroComunicados'));
const AdminMuralFotos = lazy(() => import('./AdminMuralFotos'));
const AdminAuditLog = lazy(() => import('./AdminAuditLog'));
// Telas pedagógicas da Recepção que a Coordenação e a Direção levam para o
// Portal da Gestão (PLANO_PERFIL_GESTAO_PEDAGOGICA.md, seção 3.4).
const AdminCardapio = lazy(() => import('./AdminCardapio'));
const AdminDiario = lazy(() => import('./AdminDiario'));
const AdminSubjects = lazy(() => import('./AdminSubjects'));
const AdminChat = lazy(() => import('./AdminChat'));

// Abas antigas (guardadas no sessionStorage de quem já usava o portal).
// Também traduz os nomes de tela do Admin usados nos avisos enviados à
// equipe (ex.: /?tab=users no cadastro pendente), que desde 28/09/2026
// também chegam para a Gestão.
const LEGACY_TABS = {
  financeiro: 'financeiro-visao',
  configuracoes: 'config-escola',
  users: 'cadastros-usuarios',
  matriculas: 'secretaria-matriculas',
  presence: 'presenca-dia',
};

// Grupo do menu de cada aba: abre o grupo certo ao navegar por atalho.
function groupOf(tab) {
  if (tab.startsWith('secretaria-')) return 'secretaria';
  if (tab.startsWith('contratos-')) return 'contratos';
  if (tab.startsWith('financeiro-')) return 'financeiro';
  if (['presenca-dia', 'attendance-corrections', 'horas-extras'].includes(tab)) return 'presenca';
  if (tab.startsWith('cadastros-')) return 'cadastros';
  if (tab.startsWith('academico-') || tab === 'calendario') return 'academico';
  if (tab.startsWith('comunicacao-')) return 'comunicacao';
  if (tab.startsWith('relatorios-')) return 'relatorios';
  if (tab.startsWith('permissoes-') || tab.startsWith('config-') || tab === 'integracoes') return 'configuracoes';
  return null;
}

// Portal da Gestão (financeiro/administrativo). Espelha à risca a casca do
// AdminPortal.jsx (aside/nav/main, mesmas classes, mesmo comportamento de
// sidebar retrátil). Menu completo do PLANO_PORTAL_GESTAO.md (seção 4).
// Também é o portal da Coordenação e da Direção (role 'gestao_pedagogica'),
// com o menu reduzido: src/lib/perfisGestao.js decide as abas; o banco barra
// o resto.
export default function GestaoPortal({
  currentUser, currentSchool,
  gestaoTab, setGestaoTab,
  onUpdateSchool,
  isMobileMenuOpen, setIsMobileMenuOpen,
  onLogout,
}) {
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  const isDesktop = useIsDesktop();
  const role = currentUser?.role;
  const recursos = recursosDoPerfil(role);
  const pode = (tab) => podeVerAba(role, tab);
  // Link direto, atalho, notificação ou aba guardada que aponte para uma aba
  // que este perfil não vê: mostra o Início (nunca desenha a tela proibida).
  const abaAtual = pode(gestaoTab) ? gestaoTab : 'home';
  const collapsed = isDesktop && !isSidebarExpanded;
  const [openAccordion, setOpenAccordion] = useState(() => groupOf(gestaoTab || ''));
  const toggleAccordion = (name) => setOpenAccordion(openAccordion === name ? null : name);
  const features = currentSchool?.features_enabled || {};
  const showFinanceiro = features.financeiro === true;
  const showCheckin = features.checkin !== false;
  const [selectedAlunoId, setSelectedAlunoId] = useState(null);
  // Aba e turma com que o perfil abre (ex.: "Mudar de turma" do painel).
  const [alunoIntent, setAlunoIntent] = useState(null);
  const openAlunoFromPainel = (id, intent = null) => {
    setAlunoIntent(intent);
    setSelectedAlunoId(id);
  };
  const [financeConfigTab, setFinanceConfigTab] = useState('gateway');
  const { count: pendingUsersCount } = usePendingUsersCount(currentUser);
  const { clickCounts, registerClick } = useMenuClicks(currentUser?.id, currentUser?.school_id);
  const go = (tab) => {
    if (!pode(tab)) return;
    setGestaoTab(tab);
    registerClick(tab);
    setIsMobileMenuOpen(false);
    if (tab !== 'secretaria-alunos') setSelectedAlunoId(null);
  };
  // Atalhos (Início, Pendências) também abrem o grupo certo no menu.
  const goFromShortcut = (tab) => {
    const group = groupOf(tab);
    if (group) setOpenAccordion(group);
    go(tab);
  };
  const openAluno = (id) => {
    setAlunoIntent(null);
    setSelectedAlunoId(id);
    setGestaoTab('secretaria-alunos');
    setOpenAccordion('secretaria');
  };

  useEffect(() => {
    if (LEGACY_TABS[gestaoTab]) setGestaoTab(LEGACY_TABS[gestaoTab]);
    else if (gestaoTab && !podeVerAba(role, gestaoTab)) setGestaoTab('home');
  }, [gestaoTab, setGestaoTab, role]);

  // Chat do setor (Coordenação e Direção), igual ao da Recepção.
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const showChat = recursos.chat && (currentSchool?.features_enabled || {}).chat === true;
  const { count: chatUnreadCount, refresh: refreshChatUnread } = useChatUnreadCount(currentUser, showChat);

  // Badge de correções de presença aguardando aprovação -- mesmo padrão e
  // mesma fonte de dado do badge no AdminPortal.jsx.
  const [pendingCorrectionsCount, setPendingCorrectionsCount] = useState(0);
  useEffect(() => {
    if (!currentUser?.school_id) return;
    let cancelled = false;

    const refreshCount = async () => {
      const { count } = await supabase
        .from('attendance_corrections')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', currentUser.school_id)
        .eq('status', 'pending');
      if (!cancelled) setPendingCorrectionsCount(count || 0);
    };
    refreshCount();

    const channel = supabase
      .channel(`attendance-corrections-badge-gestao-${currentUser.school_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_corrections', filter: `school_id=eq.${currentUser.school_id}` }, refreshCount)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUser?.school_id]);

  const item = (tab, icon, label, extra = {}) => (pode(tab) ? (
    <SidebarItem active={abaAtual === tab} icon={icon} label={label} onClick={() => go(tab)} {...extra} />
  ) : null);
  // Grupo some quando o perfil não vê nenhuma aba dele.
  const grupoVisivel = (id) => role !== PAPEL_GESTAO_PEDAGOGICA || [...ABAS_GESTAO_PEDAGOGICA].some(t => groupOf(t) === id);
  const group = (id, label, icon, children, badge = null) => (grupoVisivel(id) ? (
    <SidebarGroup collapsed={collapsed} label={label} icon={icon} badge={badge} isOpen={openAccordion === id} onToggle={() => toggleAccordion(id)}>
      {children}
    </SidebarGroup>
  ) : null);
  // Correção pendente é para a Gestão aprovar: não conta como pendência de
  // quem não pode aprovar.
  const correcoesParaMim = recursos.aprovarCorrecaoQueGeraCobranca ? pendingCorrectionsCount : 0;
  const pendenciasBadge = pendingUsersCount + correcoesParaMim;
  const shell = (description, children) => <PageShell description={description}>{children}</PageShell>;

  return (
    <div className="flex flex-col md:flex-row gap-0 w-full h-full animate-in fade-in md:relative">
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-20 transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      <aside
        data-expanded={isSidebarExpanded}
        className={`group/side fixed md:sticky top-[60px] md:top-16 left-0 h-[calc(100dvh-60px)] md:h-[calc(100dvh-4rem)] w-72 shrink-0 z-20 md:z-30 bg-surface-container-low border-r border-outline-variant transform transition-all duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarExpanded ? 'md:w-[280px]' : 'md:w-16'}`}
      >
        <SidebarToggleButton isExpanded={isSidebarExpanded} onToggle={toggleSidebarExpanded} />
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          {/* A Gestão tem mais itens do que cabe na altura da tela: a barra
              de rolagem vertical ocupava largura dentro da coluna de 64px do
              menu recolhido e criava também rolagem horizontal. A rolagem
              continua (roda do mouse, toque), mas sem barra visível e nunca
              na horizontal. */}
          <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 md:px-[14px] md:group-data-[expanded=true]/side:px-4 pt-4 pb-2 space-y-1">
            {item('home', Home, 'Início')}
            {item('pendencias', Inbox, 'Pendências', { badge: pendenciasBadge > 0 ? pendenciasBadge : null })}
            {group('secretaria', 'Secretaria', GraduationCap, <>
              {item('secretaria-alunos', GraduationCap, 'Alunos')}
              {item('secretaria-matriculas', FileText, 'Matrículas')}
              {item('secretaria-documentos', FileWarning, 'Doc. Pendentes')}
            </>)}
            {group('contratos', 'Contratos', FileSignature, <>
              {item('contratos-lista', FileSignature, 'Contratos')}
              {item('contratos-modelos', LayoutTemplate, 'Modelos')}
              {item('contratos-assinaturas', PenLine, 'Assinaturas')}
              {item('contratos-aditivos', FilePlus2, 'Aditivos')}
            </>)}
            {group('financeiro', 'Financeiro', Wallet, <>
              {item('financeiro-visao', PieChart, 'Visão Financeira')}
              {showFinanceiro && item('financeiro-mensalidades', ReceiptText, 'Mensalidades')}
              {showFinanceiro && item('financeiro-cobrancas', Wallet, 'Cobranças')}
              {showFinanceiro && item('financeiro-inadimplencia', AlertOctagon, 'Inadimplência')}
              {showFinanceiro && item('financeiro-recebimentos', HandCoins, 'Recebimentos')}
              {item('financeiro-despesas', Receipt, 'Despesas')}
            </>)}
            {showCheckin && group('presenca', 'Presença e Horas', Clock, <>
              {item('presenca-dia', UserCheck, 'Presença do Dia')}
              {item('attendance-corrections', ClipboardCheck, 'Correções', { badge: correcoesParaMim > 0 ? correcoesParaMim : null })}
              {item('horas-extras', Clock, 'Horas Extras')}
            </>, correcoesParaMim > 0 ? correcoesParaMim : null)}
            {group('cadastros', 'Cadastros', Folders, <>
              {item('cadastros-usuarios', Users, 'Usuários', { badge: pendingUsersCount > 0 ? pendingUsersCount : null })}
              {item('cadastros-novo', UserPlus, 'Novo Cadastro')}
              {item('cadastros-funcionarios', Users, 'Funcionários')}
              {item('cadastros-turmas', School, 'Turmas')}
              {item('cadastros-fornecedores', Truck, 'Fornecedores')}
              {item('cadastros-exclusoes', UserX, 'Pedidos de exclusão')}
              {item('cadastros-biometria', ScanFace, 'Limpeza de biometria')}
              {item('cadastros-unificar', UsersRound, 'Unificar responsáveis')}
            </>, pendingUsersCount > 0 ? pendingUsersCount : null)}
            {group('academico', 'Acadêmico', BookOpen, <>
              {item('academico-ano-letivo', CalendarRange, 'Ano Letivo')}
              {item('academico-frequencia', ClipboardList, 'Frequência')}
              {item('academico-relatorios', FileText, 'Pedagógico')}
              {item('academico-ocorrencias', NotebookPen, 'Ocorrências')}
              {item('calendario', CalendarDays, 'Calendário')}
              {item('academico-cardapio', UtensilsCrossed, 'Cardápio')}
              {item('academico-diario', Soup, 'Diário')}
              {item('academico-materias', BookMarked, 'Matérias')}
            </>)}
            {group('comunicacao', 'Comunicação', Megaphone, <>
              {item('comunicacao-comunicados', Megaphone, 'Comunicados')}
              {item('comunicacao-mural', ImageIcon, 'Mural')}
            </>)}
            {group('relatorios', 'Relatórios', BarChart3, <>
              {item('relatorios-gestao', BarChart3, 'Gestão')}
              {item('relatorios-financeiro', Wallet, 'Financeiro')}
              {item('relatorios-academico', BookOpen, 'Acadêmico')}
              {item('relatorios-operacional', Clock, 'Operacional')}
            </>)}
            {/* Permissões e Integrações ficam dentro de Configurações
                (pedido de 28/09/2026: menu principal mais curto). */}
            {group('configuracoes', 'Configurações', Settings, <>
              {item('config-escola', School, 'Escola')}
              {item('config-academico', BookOpen, 'Acadêmico')}
              {item('config-financeiro', Wallet, 'Financeiro')}
              {item('config-comunicacao', MessageSquare, 'Comunicação')}
              {item('config-seguranca', KeyRound, 'Segurança')}
              {item('permissoes-perfis', ShieldCheck, 'Perfis e Permissões')}
              {item('permissoes-auditoria', ScrollText, 'Auditoria')}
              {item('integracoes', Plug, 'Integrações')}
            </>)}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-outline-variant/60">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>}>
          {abaAtual === 'home' && <GestaoInicio currentUser={currentUser} currentSchool={currentSchool} setGestaoTab={goFromShortcut} clickCounts={clickCounts} />}
          {abaAtual === 'pendencias' && <GestaoPendencias currentUser={currentUser} setGestaoTab={goFromShortcut} />}

          {/* Secretaria */}
          {/* O painel de alunos fica montado (escondido) enquanto o perfil está
              aberto, para voltar no mesmo ponto (turma, filtros, busca). */}
          {abaAtual === 'secretaria-alunos' && (
            <>
              {selectedAlunoId && (
                <GestaoAlunoPerfil
                  key={selectedAlunoId}
                  currentUser={currentUser}
                  studentId={selectedAlunoId}
                  initialTab={alunoIntent?.tab}
                  initialMoveTo={alunoIntent?.moveTo}
                  onBack={() => { setSelectedAlunoId(null); setAlunoIntent(null); }}
                />
              )}
              <div className={selectedAlunoId ? 'hidden' : 'h-full'}>
                <GestaoAlunos
                  currentUser={currentUser}
                  onOpenAluno={openAlunoFromPainel}
                  onNovaMatricula={() => go('secretaria-matriculas')}
                  isVisible={!selectedAlunoId}
                />
              </div>
            </>
          )}
          {abaAtual === 'secretaria-matriculas' && <AdminMatriculas currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'secretaria-documentos' && <GestaoDocumentosPendentes currentUser={currentUser} onOpenAluno={openAluno} />}

          {/* Contratos */}
          {abaAtual === 'contratos-lista' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="lista" />}
          {abaAtual === 'contratos-modelos' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="modelos" />}
          {abaAtual === 'contratos-assinaturas' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="assinaturas" />}
          {abaAtual === 'contratos-aditivos' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="aditivos" />}

          {/* Financeiro */}
          {abaAtual === 'financeiro-visao' && <GestaoVisaoFinanceira currentUser={currentUser} setGestaoTab={goFromShortcut} />}
          {abaAtual === 'financeiro-mensalidades' && shell('Planos de mensalidade de cada aluno, cobrados automaticamente pelo Asaas.', <MensalidadesTab currentUser={currentUser} />)}
          {abaAtual === 'financeiro-cobrancas' && shell('Todas as cobranças geradas, com situação e forma de pagamento.', <CobrancasTab key="all" currentUser={currentUser} canRegisterPayment />)}
          {abaAtual === 'financeiro-inadimplencia' && shell('Cobranças vencidas e não pagas. Registre aqui o que foi pago por fora.', <CobrancasTab key="overdue" currentUser={currentUser} initialStatus="OVERDUE" canRegisterPayment />)}
          {abaAtual === 'financeiro-recebimentos' && <GestaoRecebimentos currentUser={currentUser} />}
          {abaAtual === 'financeiro-despesas' && <GestaoDespesas currentUser={currentUser} />}

          {/* Presença e Horas */}
          {abaAtual === 'presenca-dia' && <AdminDailyPresence currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'horas-extras' && <AdminRelatorioHorasExtras currentSchool={currentSchool} />}
          {abaAtual === 'attendance-corrections' && <AdminAttendanceCorrections currentUser={currentUser} />}

          {/* Cadastros */}
          {abaAtual === 'cadastros-usuarios' && (
            <AdminUserManagement currentUser={currentUser} initialTab={pendingUsersCount > 0 ? 'pending' : 'active'} />
          )}
          {abaAtual === 'cadastros-novo' && <AdminUserRegistration currentUser={currentUser} />}
          {abaAtual === 'cadastros-funcionarios' && <AdminFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'cadastros-turmas' && (
            <div className="h-full overflow-y-auto bg-surface p-4 md:p-6 lg:p-8">
              <div className="max-w-3xl">
                <TurmasSection currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} />
              </div>
            </div>
          )}
          {abaAtual === 'cadastros-fornecedores' && <GestaoFornecedores currentUser={currentUser} />}
          {abaAtual === 'cadastros-exclusoes' && <GestaoExclusoesConta currentUser={currentUser} />}
          {abaAtual === 'cadastros-biometria' && <GestaoLimpezaBiometria />}
          {abaAtual === 'cadastros-unificar' && <GestaoUnificarResponsaveis />}

          {/* Acadêmico (consulta) */}
          {abaAtual === 'academico-ano-letivo' && <GestaoAnoLetivo currentUser={currentUser} />}
          {abaAtual === 'academico-frequencia' && <AdminFrequencia currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'academico-relatorios' && <AdminMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'academico-ocorrencias' && <GestaoOcorrencias currentUser={currentUser} />}

          {abaAtual === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'academico-cardapio' && <AdminCardapio currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'academico-diario' && <AdminDiario currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'academico-materias' && <AdminSubjects currentUser={currentUser} currentSchool={currentSchool} />}

          {/* Comunicação */}
          {abaAtual === 'comunicacao-comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}
          {abaAtual === 'comunicacao-mural' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}

          {/* Relatórios */}
          {abaAtual === 'relatorios-gestao' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="gestao" />}
          {abaAtual === 'relatorios-financeiro' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="financeiro" />}
          {abaAtual === 'relatorios-academico' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="academico" />}
          {abaAtual === 'relatorios-operacional' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="operacional" />}

          {/* Permissões */}
          {abaAtual === 'permissoes-perfis' && <GestaoPermissoes currentUser={currentUser} />}
          {abaAtual === 'permissoes-auditoria' && <AdminAuditLog currentUser={currentUser} currentSchool={currentSchool} />}

          {/* Configurações */}
          {abaAtual === 'config-escola' && <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} only={['login_image']} />}
          {abaAtual === 'config-academico' && <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} only={['absence_alert']} showSchoolData={false} />}
          {abaAtual === 'config-financeiro' && (
            <div className="h-full flex flex-col min-h-0">
              <div className="px-4 md:px-6 pt-4 shrink-0">
                <Tabs tabs={[{ id: 'gateway', label: 'Asaas e cobrança' }, { id: 'billing', label: 'Hora extra' }]} active={financeConfigTab} onChange={setFinanceConfigTab} />
              </div>
              <div className="flex-1 min-h-0">
                {financeConfigTab === 'gateway'
                  ? shell('Chave do Asaas, multa, juros e desconto das cobranças.', <GatewayConfigTab currentUser={currentUser} currentSchool={currentSchool} />)
                  : <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} only={['billing']} showSchoolData={false} />}
              </div>
            </div>
          )}
          {abaAtual === 'config-comunicacao' && <ConfigComunicacao currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} />}
          {abaAtual === 'config-seguranca' && <ConfigSeguranca currentUser={currentUser} />}

          {abaAtual === 'integracoes' && <GestaoIntegracoes currentUser={currentUser} currentSchool={currentSchool} setGestaoTab={goFromShortcut} />}
        </Suspense>

        {/* Chat flutuante da Coordenação e da Direção (mesmo da Recepção). */}
        {showChat && createPortal(
          <>
            <button
              onClick={() => {
                setIsChatOpen(o => !o);
                setIsChatExpanded(false);
                if (isChatOpen) refreshChatUnread();
              }}
              className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-primary hover:bg-primary-container text-white shadow-xl flex items-center justify-center transition-all active:scale-95"
              title="Chat"
              aria-label="Chat"
            >
              {isChatOpen ? <X size={24} /> : <MessageCircle size={24} />}
              {!isChatOpen && chatUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                  {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                </span>
              )}
            </button>
            {isChatOpen && (
              <div className={`fixed z-40 border border-outline-variant shadow-2xl overflow-hidden bg-surface-container-lowest animate-in fade-in duration-200 inset-3 ${
                isChatExpanded
                  ? 'sm:inset-6 rounded-zela-xl'
                  : 'sm:inset-auto sm:bottom-24 sm:right-5 sm:w-96 sm:h-[70vh] sm:max-h-[600px] rounded-zela-xl slide-in-from-bottom-4'
              }`}>
                <button
                  onClick={() => setIsChatExpanded(e => !e)}
                  className="hidden sm:block absolute top-4 right-4 z-10 p-1.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-zela-sm transition"
                  title={isChatExpanded ? 'Recolher' : 'Expandir'}
                >
                  {isChatExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>}>
                  <AdminChat currentUser={currentUser} currentSchool={currentSchool} />
                </Suspense>
              </div>
            )}
          </>,
          document.body
        )}
      </main>
    </div>
  );
}
