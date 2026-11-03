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
