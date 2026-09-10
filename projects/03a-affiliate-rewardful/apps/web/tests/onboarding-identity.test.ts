import { describe,it,expect } from 'vitest';
import { randomBytes,createHmac } from 'node:crypto';
import { normalizeIdentity,hashIdentity,hashGrantToken,createGrantToken } from '../src/lib/onboarding/identity';
describe('pilot identity normalization v1',()=>{
 it('retains donor case/edge normalization, distinct dots/plus and ASCII atext',()=>{
 expect(normalizeIdentity(' \tOwner.Name+Tag@EXAMPLE.COM\r\n')).toBe('owner.name+tag@example.com');
 expect(normalizeIdentity('a`b@example.com')).toBe('a`b@example.com');
 expect(normalizeIdentity('a.b@example.com')).not.toBe(normalizeIdentity('ab@example.com'));
 });
 it.each(['ü@example.com','a@例子.com','a@example','a..b@example.com','.a@example.com','a.@example.com','a@-x.com','a@x-.com','a@x..com','"a"@example.com','a b@example.com','a\u00a0@example.com','a@127.0.0.1\u0000','a'.repeat(65)+'@example.com','a@'+ 'x'.repeat(64)+'.com','a@@example.com'])('rejects malformed identity %s',value=>expect(()=>normalizeIdentity(value)).toThrow('invalid_input'));
 it('domain separates stable identity from independently rotated sessions/grants',()=>{
 const secret=randomBytes(32);expect(hashIdentity('A@example.com',secret)).toEqual(createHmac('sha256',secret).update('n3a:identity:email:v1:a@example.com').digest());
 expect(hashIdentity('A@example.com',secret)).toEqual(hashIdentity(' a@EXAMPLE.com ',secret));
 const token=createGrantToken();expect(hashGrantToken(token)).toHaveLength(32);expect(()=>hashGrantToken(token+'=')).toThrow('enrollment_unavailable');
 });
});
