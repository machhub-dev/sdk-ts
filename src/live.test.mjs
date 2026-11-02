// The SDK against a running MACHHUB: what a v1 app calls must keep working on
// MACHHUB 2, and the v2 reads must answer. machhub-api's "SDK compatibility"
// workflow runs this against every push to its v2 branch.
//
// Skipped unless MACHHUB_SDK_LIVE_URL is set:
//
//   MACHHUB_SDK_LIVE_URL=http://localhost:6188 npm test
//
// MACHHUB_SDK_LIVE_MQTT is the broker's WebSocket URL, ws://<host>:180 by default.
//
// It signs in as MACHHUB_SDK_LIVE_USER / _PASS (default admin / admin), makes
// an API key and a collection named sdk_live_<time> for the SDK to use, and
// removes both at the end, pass or fail.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { SDK } from '../dist/sdk-ts.js';

const url = process.env.MACHHUB_SDK_LIVE_URL;
// The broker's WebSocket listener (mochi.ws_port, 180 by default).
const mqttUrl = process.env.MACHHUB_SDK_LIVE_MQTT || (url ? `ws://${new URL(url).hostname}:180` : '');
const user = process.env.MACHHUB_SDK_LIVE_USER || 'admin';
const pass = process.env.MACHHUB_SDK_LIVE_PASS || 'admin';
const skip = url ? false : 'set MACHHUB_SDK_LIVE_URL to run against a MACHHUB';

const name = `sdk_live_${Date.now()}`;
const live = { sdk: undefined, headers: undefined, workspace: '', keyID: '', collectionID: '' };

const rid = (id) => (typeof id === 'string' ? id : `${id.Table}:${id.ID}`);

async function api(method, path, body) {
	const res = await fetch(`${url}${path}`, {
		method,
		headers: live.headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = text;
	}
	if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
	return json;
}

before(async () => {
	if (skip) return;
	const res = await fetch(`${url}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: user, password: pass })
	});
	const login = await res.json();
	assert.ok(login.tkn, `signing in as ${user} failed: ${JSON.stringify(login)}`);
	live.workspace = login.domainID;
	live.headers = { Authorization: `Bearer ${login.tkn}`, Domain: login.domainID, 'Content-Type': 'application/json' };

	const key = await api('POST', '/api/api-key/generate', { name, description: 'SDK live test', access: 'read-write' });
	const keys = await api('GET', '/api/api-key/');
	live.keyID = rid(keys.find((k) => k.name === name).id);
	const created = await api('POST', '/api/collection', {
		name,
		description: 'SDK live test',
		fields: [
			{ name: 'title', type: 'string' },
			{ name: 'count', type: 'number' }
		]
	});
	live.collectionID = rid(created.id);

	live.sdk = new SDK();
	const ok = await live.sdk.Initialize({
		application_id: live.workspace.replace('domains:', ''),
		developer_key: key.token,
		httpUrl: url,
		mqttUrl
	});
	assert.equal(ok, true, 'Initialize failed');
});

after(async () => {
	if (skip) return;
	// The MQTT connection would otherwise keep the test process running.
	live.sdk?.Close();
	if (live.collectionID) await api('DELETE', `/api/collection/${live.collectionID}`).catch((e) => console.error(e.message));
	if (live.keyID) await api('DELETE', `/api/api-key/delete/${live.keyID}`).catch((e) => console.error(e.message));
});

test('v1: tag and historian lists', { skip }, async () => {
	assert.ok(Array.isArray(await live.sdk.tag.getAllTags()));
	assert.ok(Array.isArray(await live.sdk.historian.getAllHistorizedTags()));
});

test('v1: sign-in and the current user', { skip }, async () => {
	const res = await live.sdk.auth.login(user, pass);
	assert.ok(res?.tkn);
	const me = await live.sdk.auth.getCurrentUser();
	assert.equal(me.username, user);
});

test('v1: a record is created, read, updated, counted and deleted', { skip }, async () => {
	const c = live.sdk.collection(name);
	await c.create({ title: 'one', count: 1 });
	assert.equal(await c.count(), 1);
	const [record] = await c.getAll();
	assert.equal(record.title, 'one');

	const updated = await c.update(record.id, { title: 'two', count: 2 });
	assert.equal(updated.title, 'two');
	assert.equal((await c.getOne(record.id)).count, 2);

	await c.delete(record.id);
	assert.equal(await live.sdk.collection(name).count(), 0);
});

test('v2: the collection is an item, in the tree, with its default view', { skip }, async () => {
	const items = await live.sdk.workspace.items({ type: 'collection', query: name, limit: 5 });
	const item = items.find((i) => i.name === name);
	assert.ok(item, `no item for ${name}`);
	assert.equal(rid(item.ref), live.collectionID);
	assert.equal((await live.sdk.workspace.item(item.id)).name, name);

	const tree = await live.sdk.workspace.tree();
	assert.ok(tree.items.some((i) => i.name === name));
	assert.ok(tree.folders.length > 0);

	const views = await live.sdk.collection(name).views();
	const table = views.find((v) => v.kind === 'table');
	assert.ok(table, 'a collection is made with a Table view');
	assert.equal((await live.sdk.collection(name).view(table.id)).id, table.id);
});

test('v2: Knowledge search answers, or says why it cannot', { skip }, async () => {
	// A fresh box has no embedder and may not license Knowledge for a key, so
	// a refusal with a reason is an answer too. A missing route is not.
	try {
		const res = await live.sdk.knowledge.search('pump pressure', { k: 3 });
		assert.ok(Array.isArray(res.hits));
	} catch (e) {
		assert.notEqual(e.status, 404, `the search route is missing: ${e.message}`);
		assert.ok([401, 403, 503].includes(e.status), `unexpected answer: ${e.status} ${e.message}`);
	}
});
