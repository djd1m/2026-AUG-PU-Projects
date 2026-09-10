import { MembershipList } from '../../components/onboarding/membership-list';
import { OnboardingShell } from '../../components/onboarding/shell';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  return (
    <OnboardingShell
      eyebrow="Личный кабинет"
      title="Мои программы"
      intro="Здесь показан только ваш текущий доступ. Новое приглашение можно принять отдельно."
    >
      <MembershipList />
    </OnboardingShell>
  );
}
