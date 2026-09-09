import { readFileSync } from 'node:fs';
import { assert, object } from '../domain/common.mjs';

export function readAccessConfig(path) {
  if(!path)return {mail:{enabled:false},yandex:{enabled:false},verificationRequired:false};
  let config;
  try {config=JSON.parse(readFileSync(path,'utf8'));} catch {throw new Error('N3 access configuration cannot be read; inspect the private secret file.');}
  object(config,['mail','yandex','verificationRequired']);
  assert(config.verificationRequired===undefined || typeof config.verificationRequired==='boolean','ACCESS_CONFIG_INVALID',503,'Некорректная настройка доступа');
  return config;
}
