// Конфиг Remotion CLI для шаблона серии. Проект выбирается переменной PROMO_PROJECT (имя папки в promo/remotion/):
//   - @project → <proj>/project.config.ts (единственное, чем проекты отличаются в коде);
//   - публичная папка → <proj>/public (fonts/ и rec → /assets).
// Без PROMO_PROJECT или без папки — отказ, а не «проект по умолчанию».
import path from 'node:path';
import fs from 'node:fs';
import {Config} from '@remotion/cli/config';

const proj = process.env.PROMO_PROJECT;
if (!proj || !/^[a-z0-9-]+$/.test(proj)) throw new Error(`PROMO_PROJECT не задан или некорректен: «${proj ?? ''}»`);
const root = path.resolve(process.cwd(), proj);
const cfg = path.join(root, 'project.config.ts');
if (!fs.existsSync(cfg)) throw new Error(`нет ${cfg}`);

// Кэш webpack выключен: иначе время сборки зависит от того, собирался ли проект раньше (замер несопоставим).
Config.setCachingEnabled(false);
Config.setPublicDir(path.join(root, 'public'));
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {...c.resolve, alias: {...(c.resolve?.alias as object), '@project': cfg}},
}));
