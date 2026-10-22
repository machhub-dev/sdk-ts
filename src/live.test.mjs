// Live contract test: the v1 SDK against a running API (CI runs it against v2).
//
// The other tests in this package use fake HTTP services. This one talks to a
// real machhub-api, so it catches a v2 change that breaks what a v1 app calls:
// login, the current user, tags, the historian list and the collection CRUD
// the SDK sends through /machhub/:table_name.
//
// Every /machhub/* route needs a developer API key (X-Machhub-Api-Key), so the
// test signs in as the operator on /auth/login, mints a short-lived key through
// /api/api-key/generate and gives it to the SDK, the way an app is configured.
// The key needs a licence with the api_keys module; a CI box activates a trial.
//
// It is skipped unless MACHHUB_SDK_LIVE_URL is set, so a plain `npm test` stays
// offline. Credentials come from the environment too, defaulting to the
// seeded superuser (admin/admin on a fresh database):
//
//   MACHHUB_SDK_LIVE_URL    e.g. http://localhost:6188
//   MACHHUB_SDK_LIVE_USER   default admin
//   MACHHUB_SDK_LIVE_PASS   default admin
//   MACHHUB_SDK_LIVE_APP    domain id, default machhub_admin
//
// Run: MACHHUB_SDK_LIVE_URL=http://localhost:6188 npm test

import assert from 'node:assert/strict';
import test from 'node:test';

import { Auth } from '../dist/classes/auth.js';
import { Collection } from '../dist/classes/collection.js';
import { Historian } from '../dist/classes/historian.js';
import { Tag } from '../dist/classes/tag.js';
import { HTTPService } from '../dist/services/http.service.js';

const url = process.env.MACHHUB_SDK_LIVE_URL;
const user = process.env.MACHHUB_SDK_LIVE_USER ?? 'admin';
const pass = process.env.MACHHUB_SDK_LIVE_PASS ?? 'admin';
const app = process.env.MACHHUB_SDK_LIVE_APP ?? 'machhub_admin';

// HTTPService reads the bearer token from localStorage (a browser). Node has
// none by default, so give it a minimal one, as the SDK's browser target has.
const store = new Map();
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
	globalThis.localStorage = {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => void store.set(k, String(v)),
		removeItem: (k) => void store.delete(k)
	};
}

const live = { skip: url ? false : 'MACHHUB_SDK_LIVE_URL is not set' };

// A SurrealDB record id as "table:id", whichever shape the server sent.
const rid = (id) => (typeof id === 'string' ? id : `${id.Table ?? id.tb}:${id.ID ?? id.id}`);

// Operator-side calls the SDK has no verb for (signing in, minting a key,
// making a collection). Bearer token of the operator session.
let operatorToken = '';
async function admin(path, init = {}) {
	const tkn = operatorToken;
	const res = await fetch(new URL(path, url), {
		...init,
		headers: { Authorization: `Bearer ${tkn}`, Domain: `domains:${app}`, 'Content-Type': 'application/json', ...init.headers }
	});
	const body = await res.text();
	assert.ok(res.ok, `${init.method ?? 'GET'} ${path}: ${res.status} ${body}`);
	return body ? JSON.parse(body) : null;
}

test('v1 SDK against a live API', live, async (t) => {
	// The operator session, then a developer key for the SDK.
	const login = await fetch(new URL('/auth/login', url), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: user, password: pass })
	});
	assert.ok(login.ok, `operator login: ${login.status}`);
	operatorToken = (await login.json()).tkn;
	assert.ok(operatorToken, 'operator login returned no tkn');

	const minted = await admin('/api/api-key/generate', {
		method: 'POST',
		body: JSON.stringify({ name: `sdk-ci-${Date.now()}`, expiration: 1, description: 'sdk-ts live test', access: 'read-write' })
	});
	const developerKey = minted?.token ?? minted?.data?.token;
	assert.equal(typeof developerKey, 'string', `no key in the generate response: ${JSON.stringify(minted)}`);

	const http = new HTTPService(url, 'machhub', app, developerKey);
	const auth = new Auth(http, app);

	await t.test('login stores a token the server accepts', async () => {
		const res = await auth.login(user, pass);
		assert.ok(res?.tkn, 'login returned no tkn');
		assert.equal(localStorage.getItem(`x-machhub-auth-tkn-${app}`), res.tkn);
		const check = await auth.validateJWT(res.tkn);
		assert.equal(check.valid, true);
	});

	await t.test('getCurrentUser answers for the signed-in user', async () => {
		const me = await auth.getCurrentUser();
		assert.ok(me && typeof me === 'object');
		assert.equal(me.username ?? me.name, user);
	});

	await t.test('tag list and historian list are arrays', async () => {
		assert.ok(Array.isArray(await new Tag(http, null).getAllTags()));
		assert.ok(Array.isArray(await new Historian(http, null).getAllHistorizedTags()));
	});

	await t.test('collection create, read, update, count, delete', async (t2) => {
		const name = `sdkci${Date.now()}`;
		const field = (n, type, extra = {}) => ({ name: n, type, required: false, onDelete: 'ignore', ...extra });
		await admin('/api/collection', {
			method: 'POST',
			body: JSON.stringify({
				data: {
					name,
					description: '',
					fields: [
						field('id', 'record', { required: true }),
						field('title', 'string', { required: true }),
						field('qty', 'number'),
						field('created_dt', 'date'),
						field('updated_dt', 'date')
					],
					indexDetails: []
				}
			})
		});
		const made = (await admin('/api/collection')).find((c) => c.name === name);
		assert.ok(made, 'the collection was not created');
		const colId = rid(made.id);
		t2.after(() => admin(`/api/collection/${colId}`, { method: 'DELETE' }).catch(() => undefined));

		const col = () => new Collection(http, null, name);
		const created = await col().create({ title: 'pump seal', qty: 4 });
		assert.ok(created, 'create returned nothing');

		const rows = await col().getAll();
		assert.equal(rows.length, 1);
		assert.equal(rows[0].title, 'pump seal');
		const id = rid(rows[0].id);

		assert.equal((await col().getOne(id)).title, 'pump seal');
		await col().update(id, { title: 'pump seal', qty: 9 });
		assert.equal((await col().getOne(id)).qty, 9);
		assert.equal(await col().count(), 1);

		await col().delete(id);
		assert.equal(await col().count(), 0);
	});
});
