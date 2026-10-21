"use client";
// Adapted from N6 AuthForm (itself N5); removed donor partner/preview semantics, raised password contract.
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {api} from '../lib/api-client';
export function AuthForm({initialMode='login'}:{initialMode?:'login'|'register'}) {
 const[register,setRegister]=useState(initialMode==='register'),[busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
 return <form className="card auth-card" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');const form=new FormData(event.currentTarget);try{
 await api(`/api/auth/${register?'register':'login'}`,{method:'POST',body:{email:form.get('email'),password:form.get('password')}});
 // Duplicate registration deliberately gives no session; use normal login when account already exists.
 try {await api('/api/me');router.push('/dashboard');router.refresh();}catch{setError('Если аккаунт уже существует, переключитесь на вход.');}
 }catch(cause){setError(cause instanceof Error?cause.message:'Нет связи с сервером');}finally{setBusy(false);}}}>
 <p className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</p><h2>{register?'Создать аккаунт':'С возвращением'}</h2>
 <label>Почта<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
 <label>Пароль<input name="password" type="password" minLength={12} maxLength={72} autoComplete={register?'new-password':'current-password'} required/><small>От 12 символов, не больше 72 байт UTF-8.</small></label>
 {error&&<p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy?'Подождите…':register?'Создать аккаунт':'Войти'}</button>
 <button type="button" className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>{register?'Уже есть аккаунт? Войти':'Нет аккаунта? Зарегистрироваться'}</button></form>;
}
