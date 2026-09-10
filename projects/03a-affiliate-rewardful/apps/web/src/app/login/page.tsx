import { LoginForm } from '../../components/onboarding/login-form';
import { OnboardingShell } from '../../components/onboarding/shell';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <OnboardingShell
      compact
      eyebrow="Личный кабинет"
      title="Войдите в партнёрскую программу"
      intro="Используйте адрес и пароль, с которыми вы приняли приглашение."
    >
      <LoginForm />
    </OnboardingShell>
  );
}
