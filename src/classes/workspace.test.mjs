// The MACHHUB 2 reads: the paths and parameters each one sends, and the shape
// each answers, against a stand-in for HTTPService.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';

import { Workspace } from '../../dist/classes/workspace.js';
import { Knowledge } from '../../dist/classes/knowledge.js';
import { Collection } from '../../dist/classes/collection.js';

// Records each call and answers with `reply(path)`.
function stand(calls, reply) {
	const params = {
		withJSON(body) {
			this.body = body;
			return this;
		},
		async get(path, query) {
			calls.push({ method: 'GET', path, query });
			return reply(path);
		},
		async post(path) {
			calls.push({ method: 'POST', path, body: this.body });
			return reply(path);
		},
		async patch(path) {
			calls.push({ method: 'PATCH', path, body: this.body });
			return reply(path);
		},
		async delete(path) {
			calls.push({ method: 'DELETE', path });
			return reply(path);
		}
	};
	return {
		get request() {
			return { ...params };
		}
	};
}

test('items sends its narrowing as query parameters and answers the list', async () => {
	const calls = [];
	const ws = new Workspace(stand(calls, () => ({ items: [{ name: 'Orders' }] })));
	const items = await ws.items({ type: 'collection', query: 'ord', limit: 5 });
	assert.deepEqual(items, [{ name: 'Orders' }]);
	assert.deepEqual(calls[0], { method: 'GET', path: 'items', query: { type: 'collection', q: 'ord', limit: '5' } });
});

test('items answers an empty list, not null, when there are none', async () => {
	const ws = new Workspace(stand([], () => ({ items: null })));
	assert.deepEqual(await ws.items(), []);
});

test('items refuses query or limit with folder, as the server does', async () => {
	const ws = new Workspace(stand([], () => ({ items: [] })));
	await assert.rejects(() => ws.items({ folder: 'folders:a', query: 'x' }), /cannot be combined/);
});

test('item and tree read their paths, an item id from either form', async () => {
	const calls = [];
	const ws = new Workspace(stand(calls, () => ({})));
	await ws.item({ Table: 'items', ID: 'abc' });
	await ws.tree();
	assert.equal(calls[0].path, 'items/items%3Aabc');
	assert.equal(calls[1].path, 'tree');
});

test('a collection lists and reads its views', async () => {
	const calls = [];
	const c = new Collection(stand(calls, (p) => (p.endsWith('/views') ? { items: [{ kind: 'table' }] } : { kind: 'form' })), null, 'line 3');
	assert.deepEqual(await c.views(), [{ kind: 'table' }]);
	assert.deepEqual(await c.view('collection_views:v1'), { kind: 'form' });
	assert.equal(calls[0].path, 'collections/line%203/views');
	assert.equal(calls[1].path, 'collections/line%203/views/collection_views%3Av1');
});

test('knowledge search posts the query and options and always answers hits', async () => {
	const calls = [];
	const k = new Knowledge(stand(calls, () => ({ method: 'none' })));
	const res = await k.search('pump pressure', { k: 3, sources: ['collections:a'] });
	assert.deepEqual(res.hits, []);
	assert.deepEqual(calls[0], { method: 'POST', path: 'knowledge/search', body: { query: 'pump pressure', k: 3, sources: ['collections:a'] } });
	await assert.rejects(() => k.search('  '), /needs a query/);
});

test('folder writes send their paths and bodies, ids from either form', async () => {
	const calls = [];
	const ws = new Workspace(stand(calls, () => ({})));
	await ws.createFolder({ name: 'Line 3', parent: { Table: 'folders', ID: 'p' } });
	await ws.createFolder({ name: 'Top' });
	await ws.renameFolder('folders:a', 'Line 4');
	await ws.updateFolder('folders:a', { order: 2 });
	await ws.moveFolder('folders:a', 'folders:b');
	await ws.deleteFolder('folders:a');
	await ws.moveItem({ Table: 'items', ID: 'i' }, 'folders:b');
	assert.deepEqual(calls, [
		{ method: 'POST', path: 'tree/folders', body: { name: 'Line 3', parent_id: 'folders:p' } },
		{ method: 'POST', path: 'tree/folders', body: { name: 'Top' } },
		{ method: 'PATCH', path: 'tree/folders/folders%3Aa', body: { name: 'Line 4' } },
		{ method: 'PATCH', path: 'tree/folders/folders%3Aa', body: { order: 2 } },
		{ method: 'POST', path: 'tree/folders/folders%3Aa/move', body: { parent_id: 'folders:b' } },
		{ method: 'DELETE', path: 'tree/folders/folders%3Aa' },
		{ method: 'POST', path: 'items/items%3Ai/move', body: { folder_id: 'folders:b' } }
	]);
	await assert.rejects(() => ws.updateFolder('folders:a', {}), /Nothing to change/);
});

test('versions list and read one, by record or item id', async () => {
	const calls = [];
	const reply = (p) => {
		if (p.startsWith('items/')) return { ref: { Table: 'processes', ID: 'q' } };
		return p.endsWith('/2') ? { n: 2, content: {} } : { items: null };
	};
	const ws = new Workspace(stand(calls, reply));
	assert.deepEqual(await ws.versions('processes:p'), []);
	assert.equal((await ws.version({ Table: 'items', ID: 'i' }, 2)).n, 2);
	assert.deepEqual(calls.map((c) => c.path), ['versions/processes%3Ap', 'items/items%3Ai', 'versions/processes%3Aq/2']);
	await assert.rejects(() => ws.version('processes:p', 0), /whole number/);
});

test('a collection creates, updates and deletes views, and reads a record history', async () => {
	const calls = [];
	const c = new Collection(stand(calls, (p) => (p.endsWith('/history') ? { items: null } : { id: 'v' })), null, 'line 3');
	await c.createView({ kind: 'table', name: 'Mine' });
	await c.updateView('collection_views:v', { name: 'Ours' });
	await c.deleteView('collection_views:v');
	assert.deepEqual(await c.history({ Table: 'line_3', ID: 'r' }, { limit: 10, before: '2026-01-01T00:00:00Z' }), { items: [], next: '' });
	assert.deepEqual(calls, [
		{ method: 'POST', path: 'collections/line%203/views', body: { kind: 'table', name: 'Mine' } },
		{ method: 'PATCH', path: 'collections/line%203/views/collection_views%3Av', body: { name: 'Ours' } },
		{ method: 'DELETE', path: 'collections/line%203/views/collection_views%3Av' },
		{ method: 'GET', path: 'collections/line%203/records/line_3%3Ar/history', query: { before: '2026-01-01T00:00:00Z', limit: '10' } }
	]);
	await assert.rejects(() => c.updateView('collection_views:v', {}), /Nothing to change/);
});
