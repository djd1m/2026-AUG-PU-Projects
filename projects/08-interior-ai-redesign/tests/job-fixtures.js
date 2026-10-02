import { randomUUID } from 'node:crypto';
// Synthetic development-only evidence; never GPU, geometry or public-quality proof.
export const fixtureOutput=()=>({output_key:randomUUID(),mode:'fixture',evidence:{input_sha:'a'.repeat(64),output_sha:'b'.repeat(64),depth_sha:'c'.repeat(64),config_sha:'d'.repeat(64),model_revisions:{sd:'synthetic-fixture',controlnet:'synthetic-fixture',depth:'synthetic-fixture'},seed:1,worker_source_revision:'0'.repeat(40),hardware:'synthetic development fixture; no GPU measurement',queue_ms:0,inference_ms:1,warm:false}});
