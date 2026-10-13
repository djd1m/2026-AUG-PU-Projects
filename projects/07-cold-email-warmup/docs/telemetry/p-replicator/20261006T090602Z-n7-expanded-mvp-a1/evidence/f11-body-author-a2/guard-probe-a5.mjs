import assert from 'node:assert/strict';
import {connect} from 'node:net';import {lookup} from 'node:dns/promises';
assert.throws(()=>connect({host:'203.0.113.2',port:443}),/fixture_network_denied/);
await assert.rejects(async()=>lookup('fixture.invalid'),/fixture_dns_denied/);
assert.throws(()=>process.emit('message',{kind:'body_text',fixture:{ca:'synthetic',address:'fixture.invalid',smtp465:1,smtp587:1,imap993:1}}),/fixture_required_before_transport/);
console.log(JSON.stringify({guardProbe:'pass',socketDeniedExpected:1,dnsDeniedExpected:1,ipcDeniedExpected:1}));
