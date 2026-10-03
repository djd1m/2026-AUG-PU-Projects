import { REPLICATE_MODEL, REPLICATE_VERSION, REPLICATE_CONTRACT_SHA } from './replicate.js';

const secrets=new WeakMap();
const cleanupOnly=new WeakSet();
export const REPLICATE_ACCEPTANCES=Object.freeze(['authorization_sha','privacy_acceptance_sha',
  'license_acceptance_sha','safety_acceptance_sha','billing_acceptance_sha']);
const prompts=Object.freeze({
  warm:'Warm inviting interior, natural wood, soft neutral textiles, gentle warm lighting.',
  minimal:'Minimal interior, restrained neutral palette, simple furniture, uncluttered surfaces.',
  afrohemian:'Afrohemian interior, earthy colors, woven natural textures, African inspired decorative textiles.',
  playful:'Playful interior, cheerful color accents, expressive furniture and lively decorative textiles.'
});
const geometry=' Preserve the existing room geometry, walls, ceiling, floor, doors, windows and openings. Keep their positions and proportions unchanged. Preserve the camera viewpoint and structural anchors.';
const deny=()=>{throw new Error('replicate_config_denied');};
// Independent opt-in permits only maintenance GET/cancel, including revoked work.
export function readReplicateCleanupConfig(common,env) {
  if(env.REPLICATE_CLEANUP_ENABLED===undefined||env.REPLICATE_CLEANUP_ENABLED==='false')return common;
  if(env.REPLICATE_CLEANUP_ENABLED!=='true'||env.REPLICATE_MODEL!==REPLICATE_MODEL||
    env.REPLICATE_VERSION!==REPLICATE_VERSION||env.REPLICATE_CONTRACT_SHA!==REPLICATE_CONTRACT_SHA||
    typeof env.REPLICATE_API_TOKEN!=='string'||!/^[\x21-\x7e]{1,512}(?![\s\S])/.test(env.REPLICATE_API_TOKEN))deny();
  const config=Object.freeze({...common,replicateCleanupEnabled:true});
  secrets.set(config,env.REPLICATE_API_TOKEN);cleanupOnly.add(config);return config;
}
export const replicateCleanupEnabled=config=>secrets.has(config)&&
  (cleanupOnly.has(config)||config.workerMode==='replicate');
export function readReplicateWorkerConfig(common,env) {
  if(env.WORKER_MODE!=='replicate'||env.REPLICATE_MODEL!==REPLICATE_MODEL||
    env.REPLICATE_VERSION!==REPLICATE_VERSION||env.REPLICATE_CONTRACT_SHA!==REPLICATE_CONTRACT_SHA||
    typeof env.REPLICATE_API_TOKEN!=='string'||!/^[\x21-\x7e]{1,512}(?![\s\S])/.test(env.REPLICATE_API_TOKEN??'')||
    !/^[a-f0-9]{40,64}(?![\s\S])/.test(env.WORKER_SOURCE_REVISION??'')||
    !/^(0|[1-9][0-9]{0,9})(?![\s\S])/.test(env.WORKER_SEED??'')||Number(env.WORKER_SEED)>2147483647||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![\s\S])/.test(env.REPLICATE_SPEND_BUDGET_ID??''))deny();
  const acceptances=Object.fromEntries(REPLICATE_ACCEPTANCES.map(k=>[k,env['REPLICATE_'+k.toUpperCase()]]));
  if(Object.values(acceptances).some(v=>typeof v!=='string'||!/^[a-f0-9]{64}(?![\s\S])/.test(v)))deny();
  const replicate=Object.freeze({model:REPLICATE_MODEL,version:REPLICATE_VERSION,contract_sha:REPLICATE_CONTRACT_SHA,
    spend_budget_id:env.REPLICATE_SPEND_BUDGET_ID,...acceptances});
  const config=Object.freeze({...common,workerMode:'replicate',sourceRevision:env.WORKER_SOURCE_REVISION,
    seed:Number(env.WORKER_SEED),replicate});
  secrets.set(config,env.REPLICATE_API_TOKEN);return config;
}
// I2 requires a closed four-field object. The token descriptor is private to this
// server accessor and excluded from JSON/enumeration of both configuration objects.
export function replicateTransportConfig(config) {
  const token=secrets.get(config);if(!token)deny();
  return Object.freeze(Object.defineProperty({model:REPLICATE_MODEL,version:REPLICATE_VERSION,
    contractSha:REPLICATE_CONTRACT_SHA},'token',{value:token}));
}
export function replicateSettings(config,style) {
  if(!secrets.has(config)||cleanupOnly.has(config)||!Object.hasOwn(prompts,style))deny();
  return Object.freeze({prompt:prompts[style]+geometry,a_prompt:'high quality, detailed interior photography',
    n_prompt:'changed geometry, added openings, removed openings, distorted walls, distorted perspective, low quality',
    num_samples:'1',image_resolution:'512',detect_resolution:512,ddim_steps:30,scale:7.5,eta:0,seed:config.seed});
}
