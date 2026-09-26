import { Pricing } from './Pricing';
import { requestTheme } from '../theme-server';
export default async function PricingPage() {
  return <Pricing theme={await requestTheme()} />;
}
