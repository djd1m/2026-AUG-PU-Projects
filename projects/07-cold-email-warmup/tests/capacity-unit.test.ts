import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capacityAction,mailboxPageInput } from '../src/mailboxes/capacity.js';
test('F07 strict bounded pages and explicit closed capacity actions',()=>{
 assert.deepEqual(mailboxPageInput('/api/mailboxes'),{limit:25,after:undefined});
 assert.equal(mailboxPageInput('/api/mailboxes?limit=100').limit,100);
 for(const value of ['0','101','1.5','-1','01','1e2','25&limit=25']) assert.throws(()=>mailboxPageInput('/api/mailboxes?limit='+value));
 for(const value of ['','SELECT','bad-uuid']) assert.throws(()=>mailboxPageInput('/api/mailboxes?after='+value));
 for(const action of ['activate','renew','deactivate']) assert.equal(capacityAction({action}),action);
 for(const raw of [{},{action:'resume'},{action:['activate']},{action:'activate',affirmative:true}]) assert.throws(()=>capacityAction(raw));
});
