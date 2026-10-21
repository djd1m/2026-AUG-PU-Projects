import type { IncomingMessage } from 'node:http';
import { HttpError } from '../errors.js';
export const confirmationPage='<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><main><h1>Stop future messages</h1><p>Confirm to unsubscribe.</p><form method="post"><button type="submit" name="confirm" value="unsubscribe">Unsubscribe</button></form></main></html>';
export async function unsubscribeForm(req:IncomingMessage) {
 if(req.headers['content-type']?.split(';')[0]?.trim()!=='application/x-www-form-urlencoded') throw new HttpError(400,'invalid_input');
 let length=0;const chunks:Buffer[]=[];
 for await(const chunk of req) {length+=Buffer.byteLength(chunk);if(length>256) throw new HttpError(400,'invalid_input');chunks.push(Buffer.from(chunk));}
 const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));const pairs=[...form];
 if(pairs.length!==1 || !((pairs[0]![0]==='List-Unsubscribe' && pairs[0]![1]==='One-Click') || (pairs[0]![0]==='confirm' && pairs[0]![1]==='unsubscribe'))) throw new HttpError(400,'invalid_input');
}
