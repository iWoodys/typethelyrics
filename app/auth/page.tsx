"use client";

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Keyboard, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [username,setUsername]=useState('');
  const [signup,setSignup]=useState(false); const [error,setError]=useState(''); const [loading,setLoading]=useState(false); const [confirmation,setConfirmation]=useState(false);
  const [checkingLink,setCheckingLink]=useState(true);
  const [notice,setNotice]=useState('');
  const router=useRouter();

  useEffect(()=>{
    const finishConfirmation=async()=>{
      const code=new URLSearchParams(location.search).get('code');
      if(code){
        const {error:exchangeError}=await supabase.auth.exchangeCodeForSession(code);
        if(exchangeError){setError('El enlace de confirmación venció o ya fue utilizado. Solicita uno nuevo.');setCheckingLink(false);return;}
        history.replaceState({},'',location.pathname); router.push('/'); router.refresh(); return;
      }
      const {data}=await supabase.auth.getSession();
      if(data.session && location.hash){router.push('/');router.refresh();return;}
      setCheckingLink(false);
    };
    void finishConfirmation();
  },[router]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if(signup){
        const cleanUsername=username.trim();
        if(cleanUsername.length<3) throw new Error('El nombre debe tener al menos 3 caracteres.');
        if(!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) throw new Error('Usa solamente letras, números, puntos, guiones y guion bajo.');
        if(password.length<8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        const {data:existing}=await supabase.from('users').select('id').ilike('username',cleanUsername).maybeSingle();
        if(existing) throw new Error('Ese nombre de usuario ya está ocupado.');
        const {data,error:signupError}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{username:cleanUsername},emailRedirectTo:`${location.origin}/auth`}});
        if(signupError) throw signupError;
        if(!data.session){setConfirmation(true);return;}
        router.push('/'); router.refresh();
      }else{
        const {error:loginError}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(loginError) throw loginError; router.push('/'); router.refresh();
      }
    }catch(reason){
      const message=reason instanceof Error?reason.message:'No se pudo completar la operación.';
      setError(
        message.toLowerCase().includes('email rate limit')
          ? 'Supabase alcanzó el límite temporal de correos. Si ya recibiste una confirmación, usa ese enlace; de lo contrario espera hasta una hora antes de solicitar otra.'
          : message.includes('Invalid login')
            ? 'Correo o contraseña incorrectos.'
            : message.includes('already registered')
              ? 'Este correo ya está registrado. Revisa el correo de confirmación o inicia sesión.'
              : message
      );
    }finally{setLoading(false);}
  };

  const requestReset=async()=>{
    setError(''); setNotice('');
    if(!email.trim()){setError('Escribe tu correo primero.');return;}
    const {error:resetError}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}/account`});
    if(resetError)setError(resetError.message);else setNotice('Te enviamos un enlace para recuperar tu contraseña.');
  };

  if(checkingLink)return <main className="grid min-h-screen place-items-center bg-[#07080d] text-white"><p className="animate-pulse text-zinc-400">Verificando enlace…</p></main>;
  if(confirmation)return <main className="grid min-h-screen place-items-center bg-[#07080d] p-4 text-white"><div className="max-w-md rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-8 text-center"><Mail className="mx-auto text-emerald-300" size={48}/><h1 className="mt-5 text-2xl font-black">Revisa tu correo</h1><p className="mt-3 text-zinc-300">Te enviamos un enlace a <b>{email}</b>. Ábrelo para confirmar la cuenta.</p><button onClick={()=>{setConfirmation(false);setSignup(false);}} className="mt-6 rounded-xl bg-white px-6 py-3 font-bold text-black">Ir a iniciar sesión</button></div></main>;

  return <main className="grid min-h-screen place-items-center bg-[#07080d] p-4 text-white"><div className="w-full max-w-md"><Link href="/" className="mb-6 flex items-center justify-center gap-2 text-xl font-black"><Keyboard className="text-violet-400"/> TypeTheLyrics</Link><div className="rounded-3xl border border-white/10 bg-white/[.04] p-7"><h1 className="text-center text-3xl font-black">{signup?'Crear cuenta':'Bienvenido'}</h1><p className="mt-2 text-center text-sm text-zinc-400">{signup?'Guarda tus récords y correcciones.':'Continúa con tu progreso musical.'}</p><form onSubmit={submit} className="mt-7 space-y-4">{signup&&<label className="block text-sm text-zinc-300">Nombre de usuario<input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={24} required autoComplete="username" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-violet-400"/></label>}<label className="block text-sm text-zinc-300">Correo electrónico<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-violet-400"/></label><label className="block text-sm text-zinc-300">Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete={signup?'new-password':'current-password'} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-violet-400"/></label>{error&&<p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}<button disabled={loading} className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 font-bold disabled:opacity-50">{loading?'Procesando…':signup?'Crear cuenta':'Iniciar sesión'}</button></form>{!signup&&<button type="button" onClick={requestReset} className="mt-4 w-full text-sm text-zinc-400">Olvidé mi contraseña</button>}<button onClick={()=>{setSignup(value=>!value);setError('');}} className="mt-5 w-full text-sm text-violet-300">{signup?'¿Ya tienes cuenta? Inicia sesión':'¿No tienes cuenta? Regístrate'}</button></div></div></main>;
}
