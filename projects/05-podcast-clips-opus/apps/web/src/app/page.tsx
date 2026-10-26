import { getRuntime } from '../server/runtime';
import { Landing } from './Landing';
import { requestTheme } from './theme-server';
export default async function Page() {
  return <Landing creditMode={getRuntime().config.billingMode==='credits_v1'} theme={await requestTheme()} />;
}
