/** Adapted N6 workspace transpilation; custom server is sole ingress (no standalone). */
const config = {transpilePackages:['@n8/domain','@n8/db','@n8/viewer'],serverExternalPackages:['pg','bcrypt','sharp','gltf-validator','@n8/adapters'],poweredByHeader:false,experimental:{cpus:2}};
// N1 donor: resolve TypeScript workspace modules that use emitted .js specifiers.
config.webpack=(webpackConfig)=>{webpackConfig.resolve.extensionAlias={...webpackConfig.resolve.extensionAlias,'.js':['.ts','.tsx','.js']};return webpackConfig;};
export default config;
