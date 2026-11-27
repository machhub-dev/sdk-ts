import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { HTTPService } from '../../dist/services/http.service.js';
import { Server } from '../../dist/classes/server.js';
import { SDK_VERSION, CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE } from '../../dist/version.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('SDK_VERSION matches package.json and X-Machhub-Client is sent on every request', async () => {
	assert.equal(SDK_VERSION, pkg.version);
	assert.equal(CLIENT_HEADER_VALUE, `machhub-sdk-ts/${pkg.version}`);

	const seenHeaders = [];
	const realFetch = globalThis.fetch;
	globalThis.fetch = async (_url, init) => {
		seenHeaders.push(init?.headers ?? {});
		return new Response(JSON.stringify({ version: '2.0.0', capabilities: ['knowledge'] }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	};
	try {
		const http = new HTTPService('http://localhost:6188', 'machhub', 'plant', 'dev-key');
		const server = new Server(http);
		await server.info();
	} finally {
		globalThis.fetch = realFetch;
	}

	assert.equal(seenHeaders.length, 1);
	assert.equal(seenHeaders[0][CLIENT_HEADER_NAME], CLIENT_HEADER_VALUE);
	assert.equal('key' in seenHeaders[0], false, 'must not send a stray literal "key" header');
});

test('server.capabilities() and has() read, cache, and refresh advertised capabilities', async () => {
	let calls = 0;
	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => {
		calls++;
		const caps = calls === 1 ? ['collections-v2', 'knowledge'] : ['collections-v2', 'knowledge', 'app-agents'];
		return new Response(JSON.stringify({ version: '2.0.0', capabilities: caps }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	};
	try {
		const server = new Server(new HTTPService('http://localhost:6188', 'machhub', 'plant'));
		assert.deepEqual(await server.capabilities(), ['collections-v2', 'knowledge']);
		assert.equal(await server.has('knowledge'), true);
		assert.equal(await server.has('app-agents'), false);
		assert.equal(calls, 1, 'second call should use cached capabilities');

		assert.equal(await server.has('app-agents', true), true);
		assert.equal(calls, 2, 'refresh=true should re-fetch');
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('older server without capabilities field or /machhub/info returns [] and false', async () => {
	const realFetch = globalThis.fetch;

	// Case 1: 200 JSON without capabilities field
	globalThis.fetch = async () => new Response(JSON.stringify({ version: '1.9.0' }), { status: 200 });
	try {
		const server = new Server(new HTTPService('http://localhost:6188', 'machhub', 'plant'));
		assert.deepEqual(await server.capabilities(), []);
		assert.equal(await server.has('multi-app'), false);
	} finally {
		globalThis.fetch = realFetch;
	}

	// Case 2: 404 from an older server
	globalThis.fetch = async () => new Response('Not Found', { status: 404, statusText: 'Not Found' });
	try {
		const server = new Server(new HTTPService('http://localhost:6188', 'machhub', 'plant'));
		assert.deepEqual(await server.capabilities(), []);
		assert.equal(await server.has('multi-app'), false);
	} finally {
		globalThis.fetch = realFetch;
	}
});
