import React, { lazy, Suspense, useState, useEffect } from 'react';
import {
  Home, Wallet, Clock, ClipboardCheck, GraduationCap, FileText, Users, UserPlus, Folders, School, Settings,
  Inbox, FileWarning, FileSignature, FilePlus2, PenLine, LayoutTemplate, PieChart, ReceiptText, AlertOctagon,
  HandCoins, Receipt, Truck, CalendarDays, BookOpen, CalendarRange, ClipboardList, NotebookPen, Megaphone,
  Image as ImageIcon, BarChart3, ShieldCheck, ScrollText, KeyRound, Plug, MessageSquare, UserCheck, UserX, ScanFace,
} from 'lucide-react';
import { SidebarItem, SidebarGroup, SidebarToggleButton } from './SidebarNav';
import { useSidebarExpanded } from '../hooks/useSidebarExpanded';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { supabase } from '../lib/supabase';
import GestaoInicio from './GestaoInicio';
import { usePendingUsersCount } from '../hooks/usePendingUsersCount';
import { PageShell, Tabs } from './GestaoShared';

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

// Abas antigas (guardadas no sessionStorage de quem já usava o portal).
const LEGACY_TABS = { financeiro: 'financeiro-visao', configuracoes: 'config-escola' };

// Grupo do menu de cada aba: abre o grupo certo ao navegar por atalho.
function groupOf(tab) {
  if (tab.startsWith('secretaria-')) return 'secretaria';
  if (tab.startsWith('contratos-')) return 'contratos';
  if (tab.startsWith('financeiro-')) return 'financeiro';
  if (['presenca-dia', 'attendance-corrections', 'horas-extras'].includes(tab)) return 'presenca';
  if (tab.startsWith('cadastros-')) return 'cadastros';
  if (tab.startsWith('academico-')) return 'academico';
  if (tab.startsWith('comunicacao-')) return 'comunicacao';
  if (tab.startsWith('relatorios-')) return 'relatorios';
  if (tab.startsWith('permissoes-')) return 'permissoes';
  if (tab.startsWith('config-')) return 'configuracoes';
  return null;
}

// Portal da Gestão (financeiro/administrativo). Espelha à risca a casca do
// AdminPortal.jsx (aside/nav/main, mesmas classes, mesmo comportamento de
// sidebar retrátil). Menu completo do PLANO_PORTAL_GESTAO.md (seção 4).
export default function GestaoPortal({
  currentUser, currentSchool,
  gestaoTab, setGestaoTab,
  onUpdateSchool,
  isMobileMenuOpen, setIsMobileMenuOpen,
  onLogout,
}) {
  const [isSidebarExpanded, toggleSidebarExpanded] = useSidebarExpanded();
  const isDesktop = useIsDesktop();
  const collapsed = isDesktop && !isSidebarExpanded;
  const [openAccordion, setOpenAccordion] = useState(() => groupOf(gestaoTab || ''));
  const toggleAccordion = (name) => setOpenAccordion(openAccordion === name ? null : name);
  const features = currentSchool?.features_enabled || {};
  const showFinanceiro = features.financeiro === true;
  const showCheckin = features.checkin !== false;
  const [selectedAlunoId, setSelectedAlunoId] = useState(null);
  const [financeConfigTab, setFinanceConfigTab] = useState('gateway');
  const { count: pendingUsersCount } = usePendingUsersCount(currentUser);
  const go = (tab) => {
    setGestaoTab(tab);
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
    setSelectedAlunoId(id);
    setGestaoTab('secretaria-alunos');
    setOpenAccordion('secretaria');
  };

  useEffect(() => {
    if (LEGACY_TABS[gestaoTab]) setGestaoTab(LEGACY_TABS[gestaoTab]);
  }, [gestaoTab, setGestaoTab]);

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

  const item = (tab, icon, label, extra = {}) => (
    <SidebarItem active={gestaoTab === tab} icon={icon} label={label} onClick={() => go(tab)} {...extra} />
  );
  const group = (id, label, icon, children, badge = null) => (
    <SidebarGroup collapsed={collapsed} label={label} icon={icon} badge={badge} isOpen={openAccordion === id} onToggle={() => toggleAccordion(id)}>
      {children}
    </SidebarGroup>
  );
  const pendenciasBadge = pendingUsersCount + pendingCorrectionsCount;
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
          <nav className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2 space-y-1">
            {item('home', Home, 'Início')}
            {item('pendencias', Inbox, 'Pendências', { badge: pendenciasBadge > 0 ? pendenciasBadge : null })}
            {group('secretaria', 'Secretaria', GraduationCap, <>
              {item('secretaria-alunos', GraduationCap, 'Alunos')}
              {item('secretaria-matriculas', FileText, 'Matrículas e Rematrículas')}
              {item('secretaria-documentos', FileWarning, 'Documentos pendentes')}
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
              {showFinanceiro && item('financeiro-recebimentos', HandCoins, 'Recebimentos e Conciliação')}
              {item('financeiro-despesas', Receipt, 'Despesas')}
            </>)}
            {showCheckin && group('presenca', 'Presença e Horas', Clock, <>
              {item('presenca-dia', UserCheck, 'Presença do Dia')}
              {item('attendance-corrections', ClipboardCheck, 'Correções', { badge: pendingCorrectionsCount > 0 ? pendingCorrectionsCount : null })}
              {item('horas-extras', Clock, 'Horas Extras')}
            </>, pendingCorrectionsCount > 0 ? pendingCorrectionsCount : null)}
            {group('cadastros', 'Cadastros', Folders, <>
              {item('cadastros-usuarios', Users, 'Responsáveis e Usuários', { badge: pendingUsersCount > 0 ? pendingUsersCount : null })}
              {item('cadastros-novo', UserPlus, 'Novo Cadastro')}
              {item('cadastros-funcionarios', Users, 'Funcionários e Acessos')}
              {item('cadastros-turmas', School, 'Turmas')}
              {item('cadastros-fornecedores', Truck, 'Fornecedores')}
              {item('cadastros-exclusoes', UserX, 'Pedidos de exclusão')}
              {item('cadastros-biometria', ScanFace, 'Limpeza de biometria')}
            </>, pendingUsersCount > 0 ? pendingUsersCount : null)}
            {group('academico', 'Acadêmico', BookOpen, <>
              {item('academico-ano-letivo', CalendarRange, 'Ano Letivo')}
              {item('academico-frequencia', ClipboardList, 'Frequência')}
              {item('academico-relatorios', FileText, 'Relatórios Pedagógicos')}
              {item('academico-ocorrencias', NotebookPen, 'Ocorrências')}
            </>)}
            {item('calendario', CalendarDays, 'Calendário')}
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
            {group('permissoes', 'Permissões', ShieldCheck, <>
              {item('permissoes-perfis', ShieldCheck, 'Perfis e Permissões')}
              {item('permissoes-auditoria', ScrollText, 'Auditoria')}
            </>)}
            {group('configuracoes', 'Configurações', Settings, <>
              {item('config-escola', School, 'Escola')}
              {item('config-academico', BookOpen, 'Acadêmico')}
              {item('config-financeiro', Wallet, 'Financeiro')}
              {item('config-comunicacao', MessageSquare, 'Comunicação')}
              {item('config-seguranca', KeyRound, 'Segurança')}
            </>)}
            {item('integracoes', Plug, 'Integrações')}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full flex flex-col border-t border-outline-variant/60">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>}>
          {gestaoTab === 'home' && <GestaoInicio currentUser={currentUser} currentSchool={currentSchool} setGestaoTab={goFromShortcut} />}
          {gestaoTab === 'pendencias' && <GestaoPendencias currentUser={currentUser} setGestaoTab={goFromShortcut} />}

          {/* Secretaria */}
          {gestaoTab === 'secretaria-alunos' && (
            selectedAlunoId ? (
              <GestaoAlunoPerfil currentUser={currentUser} studentId={selectedAlunoId} onBack={() => setSelectedAlunoId(null)} />
            ) : (
              <GestaoAlunos currentUser={currentUser} onOpenAluno={setSelectedAlunoId} />
            )
          )}
          {gestaoTab === 'secretaria-matriculas' && <AdminMatriculas currentUser={currentUser} currentSchool={currentSchool} />}
          {gestaoTab === 'secretaria-documentos' && <GestaoDocumentosPendentes currentUser={currentUser} onOpenAluno={openAluno} />}

          {/* Contratos */}
          {gestaoTab === 'contratos-lista' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="lista" />}
          {gestaoTab === 'contratos-modelos' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="modelos" />}
          {gestaoTab === 'contratos-assinaturas' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="assinaturas" />}
          {gestaoTab === 'contratos-aditivos' && <GestaoContratos currentUser={currentUser} currentSchool={currentSchool} view="aditivos" />}

          {/* Financeiro */}
          {gestaoTab === 'financeiro-visao' && <GestaoVisaoFinanceira currentUser={currentUser} setGestaoTab={goFromShortcut} />}
          {gestaoTab === 'financeiro-mensalidades' && shell('Planos de mensalidade de cada aluno, cobrados automaticamente pelo Asaas.', <MensalidadesTab currentUser={currentUser} />)}
          {gestaoTab === 'financeiro-cobrancas' && shell('Todas as cobranças geradas, com situação e forma de pagamento.', <CobrancasTab key="all" currentUser={currentUser} canRegisterPayment />)}
          {gestaoTab === 'financeiro-inadimplencia' && shell('Cobranças vencidas e não pagas. Registre aqui o que foi pago por fora.', <CobrancasTab key="overdue" currentUser={currentUser} initialStatus="OVERDUE" canRegisterPayment />)}
          {gestaoTab === 'financeiro-recebimentos' && <GestaoRecebimentos currentUser={currentUser} />}
          {gestaoTab === 'financeiro-despesas' && <GestaoDespesas currentUser={currentUser} />}

          {/* Presença e Horas */}
          {gestaoTab === 'presenca-dia' && <AdminDailyPresence currentUser={currentUser} currentSchool={currentSchool} />}
          {gestaoTab === 'horas-extras' && <AdminRelatorioHorasExtras currentSchool={currentSchool} />}
          {gestaoTab === 'attendance-corrections' && <AdminAttendanceCorrections currentUser={currentUser} />}

          {/* Cadastros */}
          {gestaoTab === 'cadastros-usuarios' && (
            <AdminUserManagement currentUser={currentUser} initialTab={pendingUsersCount > 0 ? 'pending' : 'active'} />
          )}
          {gestaoTab === 'cadastros-novo' && <AdminUserRegistration currentUser={currentUser} />}
          {gestaoTab === 'cadastros-funcionarios' && <AdminFuncionarios currentUser={currentUser} currentSchool={currentSchool} />}
          {gestaoTab === 'cadastros-turmas' && (
            <div className="h-full overflow-y-auto bg-surface p-4 md:p-6 lg:p-8">
              <div className="max-w-3xl">
                <TurmasSection currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} />
              </div>
            </div>
          )}
          {gestaoTab === 'cadastros-fornecedores' && <GestaoFornecedores currentUser={currentUser} />}
          {gestaoTab === 'cadastros-exclusoes' && <GestaoExclusoesConta currentUser={currentUser} />}
          {gestaoTab === 'cadastros-biometria' && <GestaoLimpezaBiometria />}

          {/* Acadêmico (consulta) */}
          {gestaoTab === 'academico-ano-letivo' && <GestaoAnoLetivo currentUser={currentUser} />}
          {gestaoTab === 'academico-frequencia' && <AdminFrequencia currentUser={currentUser} currentSchool={currentSchool} />}
          {gestaoTab === 'academico-relatorios' && <AdminMitigacao currentUser={currentUser} currentSchool={currentSchool} />}
          {gestaoTab === 'academico-ocorrencias' && <GestaoOcorrencias currentUser={currentUser} />}

          {gestaoTab === 'calendario' && <AdminCalendario currentUser={currentUser} currentSchool={currentSchool} />}

          {/* Comunicação */}
          {gestaoTab === 'comunicacao-comunicados' && <AdminCadastroComunicados currentUser={currentUser} currentSchool={currentSchool} />}
          {gestaoTab === 'comunicacao-mural' && <AdminMuralFotos currentUser={currentUser} currentSchool={currentSchool} />}

          {/* Relatórios */}
          {gestaoTab === 'relatorios-gestao' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="gestao" />}
          {gestaoTab === 'relatorios-financeiro' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="financeiro" />}
          {gestaoTab === 'relatorios-academico' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="academico" />}
          {gestaoTab === 'relatorios-operacional' && <GestaoRelatorios currentUser={currentUser} currentSchool={currentSchool} view="operacional" />}

          {/* Permissões */}
          {gestaoTab === 'permissoes-perfis' && <GestaoPermissoes currentUser={currentUser} />}
          {gestaoTab === 'permissoes-auditoria' && <AdminAuditLog currentUser={currentUser} currentSchool={currentSchool} />}

          {/* Configurações */}
          {gestaoTab === 'config-escola' && <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} only={['login_image']} />}
          {gestaoTab === 'config-academico' && <AdminSettings currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} only={['absence_alert']} showSchoolData={false} />}
          {gestaoTab === 'config-financeiro' && (
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
          {gestaoTab === 'config-comunicacao' && <ConfigComunicacao currentUser={currentUser} currentSchool={currentSchool} onUpdate={onUpdateSchool} />}
          {gestaoTab === 'config-seguranca' && <ConfigSeguranca currentUser={currentUser} />}

          {gestaoTab === 'integracoes' && <GestaoIntegracoes currentUser={currentUser} currentSchool={currentSchool} setGestaoTab={goFromShortcut} />}
        </Suspense>
      </main>
    </div>
  );
}
