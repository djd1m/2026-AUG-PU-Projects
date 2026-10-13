import { test } from 'node:test';
import { recoveryScenario } from './f09-transport-fixture.js';
test('ambiguous SMTP and UID reset preserve recovery safety',recoveryScenario);
