import { ProgramSetup } from '../../../../components/onboarding/program-setup';
import { OnboardingShell } from '../../../../components/onboarding/shell';

export const dynamic = 'force-dynamic';

export default async function ProgramSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <OnboardingShell
      eyebrow="Управление программой"
      title="Настройка и участники"
      intro="Сохраните условия, затем выдайте личные приглашения. Программа останется черновиком до подключения Proofwall."
    >
      <ProgramSetup programId={id} />
    </OnboardingShell>
  );
}
