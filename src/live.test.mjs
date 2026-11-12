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
// removes both at the end, pass or fail. The v2 write tests remove what they
// make (folders, views) themselves.

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

test('v2: a folder is made, renamed, moved, filled, emptied and deleted', { skip }, async () => {
	const ws = live.sdk.workspace;
	const made = [];
	let item;
	let home;
	try {
		const tree = await ws.tree();
		const a = await ws.createFolder({ name: `${name}_a` });
		made.push(rid(a.id));
		assert.equal(rid(a.parent_id), rid(tree.root_id), 'a folder with no parent goes in the root');
		const b = await ws.createFolder({ name: `${name}_b`, parent: rid(tree.root_id) });
		made.push(rid(b.id));

		assert.equal((await ws.renameFolder(a.id, `${name}_a2`)).name, `${name}_a2`);
		const moved = await ws.moveFolder(a.id, b.id);
		assert.equal(rid(moved.parent_id), rid(b.id));

		[item] = (await ws.items({ type: 'collection', query: name, limit: 5 })).filter((i) => i.name === name);
		assert.ok(item, `no item for ${name}`);
		home = rid(item.folder_id);
		assert.equal(rid((await ws.moveItem(item.id, a.id)).folder_id), rid(a.id));
		assert.ok((await ws.items({ folder: rid(a.id) })).some((i) => rid(i.id) === rid(item.id)));

		// A folder with something in it is not deleted.
		await assert.rejects(() => ws.deleteFolder(b.id), (e) => e.status === 409);
	} finally {
		if (item && home) await ws.moveItem(item.id, home).catch((e) => console.error(e.message));
		// a is inside b, and was made first: delete in the order made.
		for (const id of made) await ws.deleteFolder(id).catch((e) => console.error(e.message));
	}
	const left = (await ws.tree()).folders.filter((f) => f.name.startsWith(name));
	assert.deepEqual(left, [], 'the folders were not all deleted');
});

test('v2: a view is created, updated and deleted', { skip }, async () => {
	const c = live.sdk.collection(name);
	// A key with no signed-in user makes shared views only.
	await assert.rejects(() => c.createView({ kind: 'table', name: `${name}_mine` }), (e) => e.status === 400);
	const view = await c.createView({ kind: 'table', name: `${name}_view`, shared: true, config: {} });
	try {
		assert.equal(view.name, `${name}_view`);
		assert.equal((await c.updateView(view.id, { name: `${name}_view2` })).name, `${name}_view2`);
		assert.ok((await c.views()).some((v) => v.id === view.id));
	} finally {
		await c.deleteView(view.id).catch((e) => console.error(e.message));
	}
	assert.ok(!(await c.views()).some((v) => v.id === view.id), 'the view was not deleted');
	const table = (await c.views()).find((v) => v.is_default);
	if (table) await assert.rejects(() => c.deleteView(table.id), (e) => e.status === 409);
});

test('v2: the schema versions of a collection, by record and by item id', { skip }, async () => {
	const ws = live.sdk.workspace;
	const versions = await ws.versions(live.collectionID);
	assert.ok(versions.length > 0, 'a new collection has a first version');
	const first = await ws.version(live.collectionID, versions[versions.length - 1].n);
	assert.equal(typeof first.content, 'object');
	const [item] = (await ws.items({ type: 'collection', query: name, limit: 5 })).filter((i) => i.name === name);
	assert.deepEqual((await ws.versions(item.id)).map((v) => v.n), versions.map((v) => v.n));
	await assert.rejects(() => ws.version(live.collectionID, 9999), (e) => e.status === 404);
});

test('v2: the value history of a record', { skip }, async () => {
	const c = live.sdk.collection(name);
	const rec = await c.create({ title: 'h1', count: 1 });
	try {
		await c.update(rec.id, { title: 'h2', count: 2 });
		// Record history is off by default; switching it on is the UI's call.
		try {
			const page = await c.history(rec.id);
			assert.ok(Array.isArray(page.items));
		} catch (e) {
			assert.equal(e.status, 503, `unexpected answer: ${e.status} ${e.message}`);
		}
		await api('PUT', `/api/collections/${live.collectionID}/record-history`, { enabled: true });
		await c.update(rec.id, { title: 'h3', count: 3 });
		const page = await c.history(rec.id, { limit: 5 });
		assert.ok(page.items.length > 0, 'an update with history on is kept');
		assert.equal(page.items[0].op, 'update');
	} finally {
		await c.delete(rec.id).catch((e) => console.error(e.message));
	}
});
