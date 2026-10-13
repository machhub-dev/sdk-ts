// changePassword and the stored token.
//
// A password change revokes the caller's old tokens and the server returns a
// fresh one as `tkn`. changePassword must store it the way login does, or the
// next request goes out with a dead token and gets a 401. A response without
// `tkn` (older servers) must leave the stored token alone.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';

import { Auth } from '../../dist/classes/auth.js';

// fakeHttpService answers each POST with the next scripted body. It records the
// token each /auth/jwt/validate call carries, which is how the test reads back
// the token Auth has stored (validateCurrentUser sends the stored token).
function fakeHttpService(responses, sent) {
	const params = {
		withJSON(body) {
			this.body = body;
			return this;
		},
		async post(path) {
			if (path === '/auth/jwt/validate') {
				sent.push(this.body.token);
				return { valid: true };
			}
			return responses.shift();
		}
	};
	return {
		get request() {
			return { ...params };
		}
	};
}

test('changePassword stores the fresh tkn the server returns', async () => {
	const sent = [];
	const auth = new Auth(
		fakeHttpService(
			[{ tkn: 'old-token' }, { message: 'ok', ok: true, tkn: 'new-token' }],
			sent
		),
		'app-change-password-tkn'
	);

	await auth.login('user', 'old-pass');
	const res = await auth.changePassword('old-pass', 'new-pass');
	await auth.validateCurrentUser();

	assert.deepEqual(sent, ['new-token'], 'the next request must carry the fresh token');
	assert.equal(res.tkn, 'new-token', 'the response is still returned to the caller');
});

test('changePassword without tkn (older server) leaves the stored token alone', async () => {
	const sent = [];
	const auth = new Auth(
		fakeHttpService([{ tkn: 'old-token' }, { message: 'ok', ok: true }], sent),
		'app-change-password-no-tkn'
	);

	await auth.login('user', 'old-pass');
	const res = await auth.changePassword('old-pass', 'new-pass');
	await auth.validateCurrentUser();

	assert.deepEqual(sent, ['old-token'], 'the stored token must be unchanged');
	assert.deepEqual(res, { message: 'ok', ok: true });
});
