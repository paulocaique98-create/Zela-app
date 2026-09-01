import React, { useState, useEffect } from 'react';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, ArrowRight, Quote } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { navigateTo } from '../utils/navigate';

export default function Login({ onLogin }) {
  // Imagem central customizável pelo developer (ConfiguracoesPanel) --
  // fica em system_settings (mesmo padrão de global_logo). Login.jsx é
  // visto por usuários NÃO autenticados, então lê via a policy pública
  // restrita a essa única chave (ver migration 20260901i). Sem valor
  // configurado, cai no gradiente/ícone padrão (comportamento atual,
  // inalterado).
  const [loginImageUrl, setLoginImageUrl] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.from('system_settings').select('value').eq('key', 'login_image_url').maybeSingle()
      .then(({ data }) => { if (active && data?.value) setLoginImageUrl(data.value); })
      .catch(() => {}); // best-effort -- nunca bloqueia a tela de login
    return () => { active = false; };
  }, []);

  // Imagem PRÓPRIA da escola (get_school_login_image), por cima da global
  // acima -- a escola informa o código dela (mesmo formato ZLxxx usado no
  // autocadastro) e, se tiver imagem configurada, ela substitui a global.
  // Sem código informado (ou escola sem imagem própria), cai na global; sem
  // nenhuma das duas, cai no gradiente padrão (comportamento inalterado).
  //
  // Achado: o código, até aqui, só servia pra buscar a imagem -- nada
  // impedia alguém de digitar o código de OUTRA escola e logar com a
  // imagem errada aparecendo (não vazava dado nenhum, já que a RPC só
  // devolve a imagem, mas gerava confusão visual). Agora o código
  // informado é VALIDADO contra a escola real do usuário logo depois da
  // autenticação (ver handleLogin) -- se não bater, a sessão é encerrada
  // na hora. A validação é sempre feita DEPOIS de autenticar (nunca
  // antes, nem por RPC anônima) -- não expõe se um e-mail existe nem faz
  // enumeração de código de escola.
  const SCHOOL_CODE_STORAGE_KEY = 'zela_school_code';
  const [schoolCode, setSchoolCode] = useState('');
  const [savedSchoolCode, setSavedSchoolCode] = useState(null);
  const [schoolImageUrl, setSchoolImageUrl] = useState(null);
  const displayedImageUrl = schoolImageUrl || loginImageUrl;

  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(SCHOOL_CODE_STORAGE_KEY);
    } catch {
      // localStorage indisponível (modo privado restrito, etc.) -- segue
      // sem memorizar, campo aparece normalmente.
    }
    if (stored) {
      setSavedSchoolCode(stored);
      setSchoolCode(stored);
      fetchSchoolImageFor(stored);
    }
  }, []);

  const fetchSchoolImageFor = async (code) => {
    const trimmed = (code || '').trim();
    if (!trimmed) { setSchoolImageUrl(null); return; }
    try {
      const { data } = await supabase.rpc('get_school_login_image', { p_school_code: trimmed });
      setSchoolImageUrl(data || null);
    } catch {
      setSchoolImageUrl(null); // best-effort -- nunca bloqueia o login
    }
  };

  const handleTrocarEscola = () => {
    try { localStorage.removeItem(SCHOOL_CODE_STORAGE_KEY); } catch { /* melhor esforço */ }
    setSavedSchoolCode(null);
    setSchoolCode('');
    setSchoolImageUrl(null);
  };

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');

    try {
      // 1. Autenticar com o Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) {
        // Extrai mensagem de forma segura de qualquer tipo de erro
        const msg = typeof authError === 'string'
          ? authError
          : authError?.message || authError?.error_description || JSON.stringify(authError);
        console.error('[Login] Auth error:', authError);

        if (authError.status === 400 || msg.toLowerCase().includes('invalid')) {
          setLoginError('E-mail ou senha incorretos.');
        } else {
          setLoginError(msg || 'Erro ao realizar login. Tente novamente.');
        }
        return;
      }

      // 2. Buscar o perfil correspondente na tabela pública 'users'
      const { data: users, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id);

      if (dbError) {
        console.error('[Login] DB error:', dbError);
        throw dbError;
      }

      if (users && users.length > 0) {
        if (users[0].status === 'pending') {
          await supabase.auth.signOut();
          setLoginError('Seu cadastro está aguardando aprovação da escola. Você receberá acesso assim que for aprovado.');
          return;
        }

        // 2.5. Valida o código de escola informado (se algum) contra a
        // escola REAL do usuário autenticado -- só depois de autenticar,
        // nunca antes (não expõe nada a quem não provou a senha ainda).
        // developer não tem school_id -- código informado é ignorado
        // pra esse role (não faz sentido "validar contra uma escola" pra
        // quem gerencia todas).
        const enteredCode = schoolCode.trim();
        if (enteredCode && users[0].role !== 'developer') {
          const { data: schoolRow, error: schoolErr } = await supabase
            .from('schools')
            .select('school_code')
            .eq('id', users[0].school_id)
            .maybeSingle();
          if (schoolErr) {
            console.error('[Login] Erro ao validar código da escola:', schoolErr);
            // Falha ao consultar não deve travar quem tem tudo certo --
            // segue sem bloquear (mesma filosofia best-effort da imagem).
          } else if (schoolRow && schoolRow.school_code.toUpperCase() !== enteredCode.toUpperCase()) {
            await supabase.auth.signOut();
            setLoginError('O código de escola informado não corresponde à sua instituição. Verifique e tente novamente.');
            return;
          }
        }
        try { localStorage.setItem(SCHOOL_CODE_STORAGE_KEY, enteredCode || ''); } catch { /* melhor esforço */ }
        if (!enteredCode) {
          try { localStorage.removeItem(SCHOOL_CODE_STORAGE_KEY); } catch { /* melhor esforço */ }
        }

        onLogin(users[0]);
      } else {
        // Usuário não encontrado em public.users (excluído, inativo ou inexistente)
        await supabase.auth.signOut();
        setLoginError('Acesso não autorizado. Sua conta foi removida ou desativada. Entre em contato com a escola.');
        return;
      }
    } catch (err) {
      console.error('[Login] Catch error:', err);
      const msg = err?.message || err?.error_description || 'Erro ao conectar ao banco de dados.';
      setLoginError(typeof msg === 'string' ? msg : 'Erro inesperado. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordRecovery = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    setRecoveryMsg('');

    if (!loginEmail) {
      setLoginError('Por favor, informe seu e-mail para recuperar a senha.');
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      setRecoveryMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada (e o spam).');
    } catch (err) {
      console.error('[Login] Recovery error:', err);
      setLoginError(err.message || 'Erro ao enviar e-mail de recuperação.');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen min-h-[100dvh] lg:h-screen lg:overflow-hidden flex w-full relative overflow-hidden bg-surface-container-lowest">
      {/* Elementos decorativos de fundo */}
      <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-primary/5 blur-3xl pointer-events-none mix-blend-multiply" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-secondary/5 blur-3xl pointer-events-none mix-blend-multiply" />

      {/* Painel esquerdo: branding (oculto em telas pequenas) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-surface-container-low flex-col justify-between p-8 xl:p-12 overflow-hidden shadow-[inset_-24px_0_48px_-12px_rgba(0,0,0,0.02)]">
        <div className="relative z-10 flex items-center gap-3 shrink-0">
          <div className="w-12 h-12 bg-primary-container rounded-zela-lg flex items-center justify-center shadow-sm">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-h2 text-on-surface tracking-tight leading-none">Zela</span>
            <span className="text-caption text-on-surface-variant uppercase tracking-widest mt-1">Gestão Escolar Inteligente</span>
          </div>
        </div>

        <div className="relative z-10 flex-1 min-h-0 my-6 flex items-center justify-center">
          {displayedImageUrl ? (
            <div className="w-full h-full max-w-lg max-h-[42vh] aspect-square rounded-[32px] overflow-hidden shadow-2xl">
              <img src={displayedImageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-full h-full max-w-lg max-h-[42vh] aspect-square rounded-[32px] overflow-hidden shadow-2xl bg-gradient-to-br from-primary via-secondary to-tertiary relative flex items-center justify-center">
              <ShieldCheck className="text-white/15" size={140} strokeWidth={1} />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/30 via-transparent to-transparent" />
            </div>
          )}
        </div>

        <div className="relative z-10 max-w-md shrink-0">
          <Quote className="text-primary/40 mb-3" size={32} />
          <p className="text-h3 text-on-surface leading-relaxed">
            Controle de entrada, saída e comunicação escolar em um só lugar com segurança para cada aluno.
          </p>
        </div>
      </div>

      {/* Painel direito: formulário */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-[420px] flex flex-col">
          {/* Branding mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-primary-container rounded-zela-lg flex items-center justify-center shadow-sm">
              <ShieldCheck className="text-white" size={20} />
            </div>
            <span className="text-h2 text-on-surface tracking-tight leading-none">Zela</span>
          </div>

          <div className="mb-8 text-left">
            <h1 className="text-h1-mobile lg:text-display text-on-surface mb-2 tracking-tight">
              {isRecoveringPassword ? 'Recuperar senha' : 'Bem-vindo'}
            </h1>
            <p className="text-body text-on-surface-variant">
              {isRecoveringPassword ? 'Enviaremos um link para redefinir sua senha.' : 'Portal de gestão e segurança escolar'}
            </p>
          </div>

          {isRecoveringPassword ? (
            <form onSubmit={handlePasswordRecovery} className="flex flex-col gap-5 w-full">
              <div className="flex flex-col gap-1.5">
                <label className="text-label text-on-surface" htmlFor="recovery-email">E-mail cadastrado</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={20} />
                  <input
                    id="recovery-email"
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    className="w-full bg-surface-container-lowest text-on-surface text-body pl-11 pr-4 py-3.5 rounded-zela-md border border-outline-variant/60 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-on-surface-variant/40 hover:border-outline shadow-sm"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>

              {loginError && <div className="p-3 bg-red-50 text-error text-small rounded-zela-md border border-red-100">{loginError}</div>}
              {recoveryMsg && <div className="p-3 bg-green-50 text-green-700 text-small rounded-zela-md border border-green-200">{recoveryMsg}</div>}

              <button type="submit" disabled={isLoading} className="w-full bg-primary hover:bg-primary-container text-white text-body font-bold py-3.5 rounded-zela-md shadow-md hover:shadow-lg transition-all disabled:opacity-70">
                {isLoading ? 'Enviando...' : 'Enviar link'}
              </button>
              <button type="button" onClick={() => { setIsRecoveringPassword(false); setLoginError(''); setRecoveryMsg(''); }} className="text-small text-primary hover:underline underline-offset-4 text-center mt-1">
                Voltar para o login
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="flex flex-col gap-5 w-full">
              {savedSchoolCode ? (
                <div className="flex items-center justify-between text-small text-on-surface-variant bg-surface-container-lowest border border-outline-variant/60 rounded-zela-md px-4 py-2.5">
                  <span>Escola: <strong className="text-on-surface">{savedSchoolCode}</strong></span>
                  <button type="button" onClick={handleTrocarEscola} className="text-primary font-medium hover:underline underline-offset-4">
                    Trocar
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-label text-on-surface-variant/70" htmlFor="school-code">Código da escola (opcional)</label>
                  <input
                    id="school-code"
                    type="text"
                    value={schoolCode}
                    onChange={e => setSchoolCode(e.target.value)}
                    onBlur={() => fetchSchoolImageFor(schoolCode)}
                    className="w-full bg-surface-container-lowest text-on-surface text-body px-4 py-2.5 rounded-zela-md border border-outline-variant/60 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-on-surface-variant/40 hover:border-outline shadow-sm uppercase"
                    placeholder="Ex: ZL001"
                    maxLength={10}
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-label text-on-surface" htmlFor="email">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={20} />
                  <input
                    id="email"
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    className="w-full bg-surface-container-lowest text-on-surface text-body pl-11 pr-4 py-3.5 rounded-zela-md border border-outline-variant/60 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-on-surface-variant/40 hover:border-outline shadow-sm"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label text-on-surface" htmlFor="password">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70" size={20} />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    className="w-full bg-surface-container-lowest text-on-surface text-body pl-11 pr-12 py-3.5 rounded-zela-md border border-outline-variant/60 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-on-surface-variant/40 hover:border-outline shadow-sm tracking-widest"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <button type="button" onClick={() => { setIsRecoveringPassword(true); setLoginError(''); }} className="text-small text-primary font-medium hover:underline underline-offset-4">
                    Esqueceu a senha?
                  </button>
                </div>
              </div>

              {loginError && <div className="p-3 bg-red-50 text-error text-small rounded-zela-md border border-red-100">{loginError}</div>}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary-container text-white text-body font-bold py-3.5 rounded-zela-md shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 group"
              >
                {isLoading ? 'Entrando...' : (
                  <>
                    Entrar
                    <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>

              <div className="text-center mt-1">
                <span className="text-small text-on-surface-variant">Novo por aqui? </span>
                <button type="button" onClick={() => navigateTo('/cadastro')} className="text-small text-primary font-medium hover:underline underline-offset-4">
                  Novo usuário?
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
