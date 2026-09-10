import { PartnerAssets } from '../../../../components/onboarding/partner-assets';
import { OnboardingShell } from '../../../../components/onboarding/shell';

export const dynamic = 'force-dynamic';

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <OnboardingShell
      eyebrow="Партнёрская программа"
      title="Ваши материалы"
      intro="Скопируйте выданную ссылку или промокод. Статус каждого материала показан рядом."
    >
      <PartnerAssets programId={id} />
    </OnboardingShell>
  );
}
