import { JoinForm } from '../../components/onboarding/join-form';
import { OnboardingShell } from '../../components/onboarding/shell';

export const dynamic = 'force-dynamic';

export default function JoinPage() {
  return (
    <OnboardingShell
      compact
      eyebrow="Приглашение"
      title="Присоединиться к программе"
      intro="Введите приглашение вручную. Оно не попадёт в адрес страницы и останется только в этом окне."
    >
      <JoinForm />
    </OnboardingShell>
  );
}
