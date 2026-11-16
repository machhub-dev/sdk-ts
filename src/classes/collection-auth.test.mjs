// App-user sign-in on a collection: sdk.collection(name).auth.
//
// An app user's token goes in the slot login() uses, so HTTPService attaches it
// to every later request. These tests run the real HTTPService over a stubbed
// fetch, so they read the token back from the Authorization header a later
// request carries, and check each route's method, path and body.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';

import { Auth } from '../../dist/classes/auth.js';
import { Collection } from '../../dist/classes/collection.js';
import { CollectionAuthError } from '../../dist/classes/collection-auth.js';
import { HTTPService, memoryTokens } from '../../dist/services/http.service.js';

const future = () => Math.floor(Date.now() / 1000) + 3600;
const record = { id: 'customers:abc', email: 'ana@example.com' };

// setup stubs fetch with scripted answers ({status, body}) and returns the
// collection's auth object plus the calls fetch saw. Each test uses its own
// application id, so stored tokens never leak between tests.
function setup(t, appID, answers) {
	const calls = [];
	const realFetch = globalThis.fetch;
	globalThis.fetch = async (url, init = {}) => {
		const u = new URL(url);
		calls.push({
			method: init.method ?? 'GET',
			path: u.pathname,
			body: init.body === undefined ? undefined : JSON.parse(init.body),
			authorization: init.headers?.Authorization
		});
		const answer = answers.shift() ?? { status: 200, body: {} };
		return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
	};
	t.after(() => {
		globalThis.fetch = realFetch;
	});
	const http = new HTTPService('http://sdk.test', '/machhub', appID);
	const collection = new Collection(http, null, 'customers');
	return { http, collection, auth: collection.auth, calls, tokenKey: `x-machhub-auth-tkn-${appID}` };
}

test('signIn posts email and password and later requests carry the token', async (t) => {
	const expires = future();
	const { auth, collection, calls, tokenKey } = setup(t, 'ca-sign-in', [
		{ body: { token: 'app-token', expires, record } },
		{ body: record }
	]);

	const res = await auth.signIn('ana@example.com', 'pw');
	await collection.getOne('customers:abc');

	assert.deepEqual(res, { token: 'app-token', expires, record });
	assert.equal(calls[0].method, 'POST');
	assert.equal(calls[0].path, '/machhub/collections/customers/auth/sign-in');
	assert.deepEqual(calls[0].body, { email: 'ana@example.com', password: 'pw' });
	assert.equal(calls[0].authorization, undefined, 'nothing is signed in before the call');
	assert.equal(calls[1].authorization, 'Bearer app-token', 'the next request must carry the app user token');
	assert.equal(memoryTokens.get(tokenKey), 'app-token', 'the token sits in the slot login() uses');
	assert.deepEqual(JSON.parse(memoryTokens.get(`${tokenKey}-app-user`)), { collection: 'customers', record, expires });
	assert.deepEqual(auth.current(), { collection: 'customers', record, expires });
});

test('signUp posts the extra fields beside email and password', async (t) => {
	const { auth, calls, tokenKey } = setup(t, 'ca-sign-up', [
		{ status: 201, body: { token: 'new-user', expires: future(), record } }
	]);

	await auth.signUp('ana@example.com', 'pw', { name: 'Ana', email: 'ignored@example.com' });

	assert.equal(calls[0].method, 'POST');
	assert.equal(calls[0].path, '/machhub/collections/customers/auth/sign-up');
	assert.deepEqual(calls[0].body, { name: 'Ana', email: 'ana@example.com', password: 'pw' });
	assert.equal(memoryTokens.get(tokenKey), 'new-user');
});

test('refresh sends no body, carries the bearer and stores the fresh token', async (t) => {
	const { auth, calls, tokenKey } = setup(t, 'ca-refresh', [
		{ body: { token: 'first', expires: future(), record } },
		{ body: { token: 'second', expires: future(), record } }
	]);

	await auth.signIn('ana@example.com', 'pw');
	await auth.refresh();

	assert.equal(calls[1].method, 'POST');
	assert.equal(calls[1].path, '/machhub/collections/customers/auth/refresh');
	assert.equal(calls[1].body, undefined);
	assert.equal(calls[1].authorization, 'Bearer first');
	assert.equal(memoryTokens.get(tokenKey), 'second');
});

test('signOut clears the token and the stored session without a request', async (t) => {
	const { auth, calls, tokenKey } = setup(t, 'ca-sign-out', [
		{ body: { token: 'app-token', expires: future(), record } }
	]);

	await auth.signIn('ana@example.com', 'pw');
	await auth.signOut();

	assert.equal(calls.length, 1, 'signOut is local only');
	assert.equal(memoryTokens.has(tokenKey), false);
	assert.equal(memoryTokens.has(`${tokenKey}-app-user`), false);
	assert.equal(auth.current(), null);
});

test('signOutEverywhere calls the route with the bearer, then clears both keys', async (t) => {
	const { auth, calls, tokenKey } = setup(t, 'ca-sign-out-everywhere', [
		{ body: { token: 'app-token', expires: future(), record } },
		{ body: { signed_out: true, success: true } }
	]);

	await auth.signIn('ana@example.com', 'pw');
	await auth.signOutEverywhere();

	assert.equal(calls[1].method, 'POST');
	assert.equal(calls[1].path, '/machhub/collections/customers/auth/sign-out-everywhere');
	assert.equal(calls[1].body, undefined);
	assert.equal(calls[1].authorization, 'Bearer app-token');
	assert.equal(memoryTokens.has(tokenKey), false);
	assert.equal(memoryTokens.has(`${tokenKey}-app-user`), false);
});

test('changePassword sends old_password and new_password and replaces the stored token', async (t) => {
	const { auth, collection, calls } = setup(t, 'ca-change-password', [
		{ body: { token: 'old-token', expires: future(), record } },
		{ body: { token: 'new-token', expires: future(), record } },
		{ body: record }
	]);

	await auth.signIn('ana@example.com', 'old-pw');
	const res = await auth.changePassword('old-pw', 'new-pw');
	await collection.getOne('customers:abc');

	assert.equal(calls[1].method, 'POST');
	assert.equal(calls[1].path, '/machhub/collections/customers/auth/change-password');
	assert.deepEqual(calls[1].body, { old_password: 'old-pw', new_password: 'new-pw' });
	assert.equal(calls[1].authorization, 'Bearer old-token');
	assert.equal(res.token, 'new-token');
	assert.equal(calls[2].authorization, 'Bearer new-token', 'the next request must carry the fresh token');
});

test('current returns null once the session has expired', async (t) => {
	const { auth } = setup(t, 'ca-expired', [
		{ body: { token: 'app-token', expires: Math.floor(Date.now() / 1000) - 1, record } }
	]);

	await auth.signIn('ana@example.com', 'pw');

	assert.equal(auth.current(), null);
});

test('current is null for another collection and when nobody is signed in', async (t) => {
	const { auth, http } = setup(t, 'ca-current', [
		{ body: { token: 'app-token', expires: future(), record } }
	]);

	assert.equal(auth.current(), null);
	await auth.signIn('ana@example.com', 'pw');
	assert.equal(new Collection(http, null, 'staff').auth.current(), null);
	assert.notEqual(auth.current(), null);
});

test('setPassword URL-encodes the record id and leaves the session alone', async (t) => {
	const { auth, calls, tokenKey } = setup(t, 'ca-set-password', [
		{ body: { id: 'customers:a/b c', password_set: true, success: true } }
	]);
	memoryTokens.set(tokenKey, 'manager-token');

	const res = await auth.setPassword('customers:a/b c', 'new-pw');

	assert.equal(res, undefined);
	assert.equal(calls[0].method, 'PUT');
	assert.equal(calls[0].path, '/machhub/collections/customers/auth/records/customers%3Aa%2Fb%20c/password');
	assert.deepEqual(calls[0].body, { password: 'new-pw' });
	assert.equal(memoryTokens.get(tokenKey), 'manager-token');
});

test('Auth.logout clears the app-user session too, and login replaces it', async (t) => {
	const { auth, http, tokenKey } = setup(t, 'ca-logout', [
		{ body: { token: 'app-token', expires: future(), record } },
		{ body: { token: 'app-token-2', expires: future(), record } },
		{ body: { tkn: 'machhub-token' } }
	]);
	const machhubAuth = new Auth(http, 'ca-logout');

	await auth.signIn('ana@example.com', 'pw');
	await machhubAuth.logout();
	assert.equal(memoryTokens.has(tokenKey), false);
	assert.equal(memoryTokens.has(`${tokenKey}-app-user`), false);

	await auth.signIn('ana@example.com', 'pw');
	await machhubAuth.login('admin', 'pw');
	assert.equal(memoryTokens.get(tokenKey), 'machhub-token');
	assert.equal(auth.current(), null, 'a MACHHUB login replaces the app user');
});

test('a failed call throws with the server error code and status, and stores nothing', async (t) => {
	const { auth, tokenKey } = setup(t, 'ca-error', [
		{ status: 401, body: { error: { code: 'invalid_credentials', message: 'wrong email or password' } } }
	]);

	await assert.rejects(auth.signIn('ana@example.com', 'wrong-pw'), (e) => {
		assert.ok(e instanceof CollectionAuthError);
		assert.equal(e.code, 'invalid_credentials');
		assert.equal(e.status, 401);
		assert.match(e.message, /wrong email or password/);
		assert.doesNotMatch(e.message, /wrong-pw/);
		return true;
	});
	assert.equal(memoryTokens.has(tokenKey), false);
});
