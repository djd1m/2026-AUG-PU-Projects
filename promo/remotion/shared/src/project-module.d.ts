// Псевдоним @project → promo/remotion/<PROMO_PROJECT>/project.config.ts (подставляет webpack).
declare module '@project' {
  const project: import('./project').ProjectConfig;
  export default project;
}
