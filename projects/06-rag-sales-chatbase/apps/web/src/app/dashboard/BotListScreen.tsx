'use client';
// Контейнер «Мои боты»: форма CreateBot → POST /api/bots (предел плана — отказ с названием предела, SC-US-012-3).
// Разметка — CabinetViews (её же проверяет прибор адаптивности).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorOf, dataOf, send } from '../../lib/api-client';
import { BotForm, BotListSection, type BotListView, type FieldErrors } from './CabinetViews';

export function CreateBotForm() {
  const router = useRouter();
  const [values, setValues] = useState({ name: '', contact: '', greeting: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErrors({});
    try {
      const { status, body } = await send('/api/bots', 'POST', { company_name: values.name, contact: values.contact, greeting: values.greeting });
      const created = dataOf<{ bot_id: string }>(body);
      if (status === 201 && created) { router.push(`/dashboard/bots/${created.bot_id}`); router.refresh(); return; }
      const error = errorOf(body);
      setErrors(error?.field ? { [error.field]: error.message } : { form: error?.message ?? 'Не удалось создать бота. Повторите' });
    } catch { setErrors({ form: 'Нет связи с сервером. Повторите' }); } finally { setBusy(false); }
  };
  return <BotForm idPrefix="new-bot" name={values.name} contact={values.contact} greeting={values.greeting} errors={errors} busy={busy}
    submitLabel="Создать бота" contactRequired={false} onChange={(f, v) => setValues((s) => ({ ...s, [f]: v }))} onSubmit={() => { void submit(); }} />;
}

export function BotListScreen({ list }: { list: BotListView }) {
  return <BotListSection list={list} create={<CreateBotForm />} />;
}
