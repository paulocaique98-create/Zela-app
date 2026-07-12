import React, { useState, useEffect } from 'react';
import { supabase, supabaseAuthHelper } from '../lib/supabase';
import { QrCode, ScanFace, CheckCircle2, AlertCircle, Building2, Lock, Smartphone, KeyRound } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import KioskFaceScanner from './KioskFaceScanner';
import KioskPasswordLogin from './KioskPasswordLogin';

// Cliente Supabase dedicado para o Kiosk, usando a key anonima e o header customizado
const createKioskClient = (token) => {
  return window.supabaseClient = supabase; // Reutiliza cliente, mas podemos passar headers
};

export default function KioskMode() {
  const [deviceToken, setDeviceToken] = useState(localStorage.getItem('zela_kiosk_device'));
  const [schoolCode, setSchoolCode] = useState('');
  
  // States de Pareamento
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pairingError, setPairingError] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [deviceName, setDeviceName] = useState('Totem ' + Math.floor(Math.random() * 1000));

  // States do Kiosk
  const [mode, setMode] = useState('menu'); // menu, qr, face
  const [successData, setSuccessData] = useState(null);
  const [kioskError, setKioskError] = useState('');

  // 1. PAREAMENTO DO DISPOSITIVO
  const handlePairDevice = async (e) => {
    e.preventDefault();
    setPairingError('');
    setIsPairing(true);

    try {
      // Login como admin para provar autorizacao
      // USA supabaseAuthHelper para NAO sobrescrever a sessao principal do app
      const { data: authData, error: authError } = await supabaseAuthHelper.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw new Error('Credenciais inválidas.');

      const user = authData.user;
      if (user.user_metadata.role !== 'admin') {
        await supabaseAuthHelper.auth.signOut();
        throw new Error('Acesso negado. Apenas o administrador da escola pode parear totens.');
      }

      const actualSchoolId = user.user_metadata.school_id;

      // Valida se o código da escola fornecido corresponde à escola do admin logado
      const { data: schoolData } = await supabaseAuthHelper
        .from('schools')
        .select('school_code')
        .eq('id', actualSchoolId)
        .single();

      if (!schoolData || schoolData.school_code !== schoolCode) {
        await supabaseAuthHelper.auth.signOut();
        throw new Error('Código da escola incorreto para este administrador.');
      }

      // Gera um token unico para o dispositivo
      const token = crypto.randomUUID();

      // Grava na tabela kiosk_devices (usando o helper autenticado como admin)
      const { error: insertError } = await supabaseAuthHelper.from('kiosk_devices').insert([{
        school_id: actualSchoolId,
        device_token: token,
        device_name: deviceName,
        created_by: user.id
      }]);

      if (insertError) throw new Error('Erro ao registrar dispositivo no servidor.');

      // Desloga o helper — a sessao principal do app NAO foi afetada
      await supabaseAuthHelper.auth.signOut();

      // Salva o token do totem e inicia
      localStorage.setItem('zela_kiosk_device', token);
      localStorage.setItem('zela_kiosk_school', actualSchoolId);
      setDeviceToken(token);

    } catch (err) {
      setPairingError(err.message);
    } finally {
      setIsPairing(false);
    }
  };

  // 2. FUNÇÕES DO TOTEM (Usando Supabase com Header Customizado)
  // Como a interface padrão do SupabaseJS não permite trocar os headers globais facilmente em runtime
  // vamos instanciar um client customizado ou mandar os fetchs com rest
  const executeKioskQuery = async (queryBuilder) => {
    // Hack para Supabase JS: o RLS aceita x-kiosk-token se mandarmos nos headers da request
    // Atualizamos o client global apenas para esta query
    const oldHeaders = supabase.rest.headers;
    supabase.rest.headers = {
      ...oldHeaders,
      'x-kiosk-token': deviceToken
    };
    const result = await queryBuilder;
    supabase.rest.headers = oldHeaders;
    return result;
  };

  // Restante da logica de Scanner QR
  useEffect(() => {
    if (mode === 'qr') {
      const html5QrCode = new Html5Qrcode("kiosk-reader");
      const startScanner = async () => {
        try {
          await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
              try {
                const data = JSON.parse(decodedText);
                if (data.type === 'student_checkin' && data.studentId) {
                  html5QrCode.stop().catch(console.error);
                  await processStudentScan(data.studentId);
                }
              } catch (e) {
                setKioskError('QR Code inválido.');
              }
            },
            () => {}
          );
        } catch (err) {
          setKioskError('Câmera não disponível.');
        }
      };
      startScanner();
      return () => { if (html5QrCode.isScanning) html5QrCode.stop().catch(console.error); };
    }
  }, [mode]);

  const processStudentScan = async (studentId) => {
    setKioskError('');
    try {
      // 1. Busca aluno (usando a lib com o header injetado via executeKioskQuery)
      const { data: student, error: sError } = await executeKioskQuery(
        supabase.from('students').select('*').eq('id', studentId).single()
      );

      if (sError || !student) throw new Error('Aluno não encontrado ou não pertence a esta escola.');

      // 2. Atualiza Status
      let newStatus = student.status;
      if (['incoming', 'idle', 'left'].includes(student.status)) newStatus = 'pending_entry';
      else if (student.status === 'in_school') newStatus = 'pending_exit';

      if (newStatus !== student.status) {
         await executeKioskQuery(supabase.from('students').update({ status: newStatus }).eq('id', student.id));
      }

      setSuccessData({ studentName: student.name, status: newStatus });
      setTimeout(() => {
        setSuccessData(null);
        setMode('menu');
      }, 4000);

    } catch (err) {
      setKioskError(err.message);
      setTimeout(() => setMode('menu'), 3000);
    }
  };

  // --- RENDERIZAÇÃO ---

  // TELA DE PAREAMENTO
  if (!deviceToken) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <div className="bg-indigo-100 text-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Smartphone size={32} />
            </div>
            <h1 className="text-2xl font-black text-slate-800">Parear Totem</h1>
            <p className="text-slate-500 text-sm mt-2">Configure este dispositivo para operar como Totem de Autoatendimento. Isso gerará um token único de acesso restrito.</p>
          </div>

          <form onSubmit={handlePairDevice} className="space-y-4">
            {pairingError && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl text-center border border-red-100">
                {pairingError}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Código da Escola</label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3 top-3 text-slate-400" />
                <input required value={schoolCode} onChange={e => setSchoolCode(e.target.value)} placeholder="Ex: ZELA2024" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono uppercase" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nome do Dispositivo</label>
              <input required value={deviceName} onChange={e => setDeviceName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">E-mail do Administrador</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Senha do Administrador</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
            </div>

            <button disabled={isPairing} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-70 mt-6">
              {isPairing ? 'Autenticando...' : 'Parear Dispositivo'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // TELA DO TOTEM (Autoatendimento)
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col text-white relative overflow-hidden select-none">
      {/* Background Decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600 rounded-full blur-[100px] opacity-20"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600 rounded-full blur-[100px] opacity-20"></div>
      </div>

      <header className="p-6 relative z-10 text-center border-b border-white/10 bg-white/5 backdrop-blur-md">
        <h1 className="text-3xl font-black tracking-tight">Zela <span className="text-indigo-400">Totem</span></h1>
        <p className="text-slate-400 text-sm mt-1">Aproxime-se para realizar o check-in ou check-out</p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        
        {successData ? (
          <div className="text-center animate-in zoom-in duration-500 bg-white/10 p-12 rounded-3xl backdrop-blur-md border border-white/20">
            <div className="w-24 h-24 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-black mb-2">Sucesso!</h2>
            <p className="text-xl text-slate-300">{successData.studentName}</p>
            <div className="mt-6 inline-block bg-white/10 px-6 py-2 rounded-full font-bold tracking-widest uppercase text-sm">
              {successData.status === 'pending_entry' ? 'Entrada Registrada' : 'Saída Registrada'}
            </div>
          </div>
        ) : mode === 'menu' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl">
            <button onClick={() => setMode('qr')} className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 p-10 rounded-3xl transition-all duration-300 flex flex-col items-center gap-6 active:scale-95">
              <div className="w-24 h-24 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <QrCode size={48} />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-2">Ler QR Code</h3>
                <p className="text-slate-400 text-sm">Use o QR Code da carteirinha no app da família</p>
              </div>
            </button>

            <button onClick={() => setMode('face')} className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 p-10 rounded-3xl transition-all duration-300 flex flex-col items-center gap-6 active:scale-95">
              <div className="w-24 h-24 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <ScanFace size={48} />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-2">Reconhecimento Facial</h3>
                <p className="text-slate-400 text-sm">Olhe para a câmera para identificação automática</p>
              </div>
            </button>

            <button onClick={() => setMode('password')} className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/50 p-10 rounded-3xl transition-all duration-300 flex flex-col items-center gap-6 active:scale-95 sm:col-span-2">
              <div className="w-24 h-24 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <KeyRound size={48} />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-2">Entrada por Senha</h3>
                <p className="text-slate-400 text-sm">Faça login com seu e-mail e senha caso não tenha a carteirinha</p>
              </div>
            </button>
          </div>
        ) : mode === 'password' ? (
          <KioskPasswordLogin 
            onClose={() => setMode('menu')} 
            executeKioskQuery={executeKioskQuery} 
            schoolId={localStorage.getItem('zela_kiosk_school')} 
            onCheckinSuccess={(data) => {
               setSuccessData(data);
               setMode('menu');
               setTimeout(() => setSuccessData(null), 4000);
            }}
          />
        ) : mode === 'face' ? (
          <KioskFaceScanner 
            onClose={() => setMode('menu')} 
            executeKioskQuery={executeKioskQuery} 
            schoolId={localStorage.getItem('zela_kiosk_school')} 
          />
        ) : (
          <div className="w-full max-w-2xl bg-black rounded-3xl overflow-hidden relative border border-white/10 shadow-2xl">
             <div id="kiosk-reader" className="w-full aspect-video bg-slate-800 [&>video]:object-cover [&>video]:h-full"></div>
             <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40"></div>
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-indigo-500 rounded-2xl"></div>
             </div>
             
             {kioskError && (
               <div className="absolute top-4 left-4 right-4 bg-red-500/90 backdrop-blur text-white p-4 rounded-xl flex items-center gap-3 font-bold">
                 <AlertCircle size={20} /> {kioskError}
               </div>
             )}

             <button onClick={() => setMode('menu')} className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-8 py-3 rounded-full font-bold transition-all">
               Cancelar
             </button>
          </div>
        )}
      </main>
    </div>
  );
}
