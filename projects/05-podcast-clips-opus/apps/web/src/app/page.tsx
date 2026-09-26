import { Landing } from './Landing';
import { requestTheme } from './theme-server';
export default async function Page() {
  return <Landing theme={await requestTheme()} />;
}
