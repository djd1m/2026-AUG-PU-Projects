// из N5: projects/05-podcast-clips-opus/apps/web/src/app/page.tsx (коммит 90fe80a) — без изменений логики.
import { Landing } from './Landing';
import { requestTheme } from './theme-server';
export default async function Page() {
  return <Landing theme={await requestTheme()} />;
}
