export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'typescript') throw new Error('production runtime attempted TypeScript import');
  return nextResolve(specifier, context);
}
