// Transport-selection tests for Collection reads.
//
// A large filter set does not fit in a URL: the API server reads the request
// line and all headers into one buffer, so past that budget it answers 431
// (through the Designer proxy, an opaque 500) before any handler runs. getAll
// and count therefore move the options into a PATCH body once the encoded query
// string passes the budget, and must otherwise stay on GET so the SDK keeps
// working against API builds that predate the PATCH routes.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';

import { Collection } from '../../dist/classes/collection.js';

// recordingHttpService stands in for HTTPService, capturing the transport each
// read chooses. `request` is a getter on the real class, so it is one here too.
function recordingHttpService(calls) {
	const params = {
		withJSON(body) {
			this.body = body;
			return this;
		},
		async get(path, query) {
			calls.push({ method: 'GET', path, options: query });
			return [];
		},
		async patch(path) {
			calls.push({ method: 'PATCH', path, options: this.body });
			return [];
		}
	};
	return {
		get request() {
			return { ...params };
		}
	};
}

function collectionWithFilters(calls, filterCount) {
	const collection = new Collection(recordingHttpService(calls), null, 'item_location');
	for (let i = 0; i < filterCount; i++) {
		collection.orFilter('itemId', '=', `wms.item_location:${String(i).padStart(7, '0')}`);
	}
	return collection;
}

test('a small filter set stays on GET', async () => {
	const calls = [];
	await collectionWithFilters(calls, 3).getAll();

	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'GET', 'a short query must not need the PATCH route');
	assert.equal(calls[0].path, 'item_location/all');
});

test('a large filter set moves to PATCH with the options in the body', async () => {
	const calls = [];
	await collectionWithFilters(calls, 80).getAll();

	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'PATCH', 'a filter set this size overflows the server read buffer on GET');
	assert.equal(calls[0].path, 'item_location/all');
	assert.equal(Object.keys(calls[0].options).length, 80);
});

test('count switches transport on the same budget as getAll', async () => {
	const small = [];
	await collectionWithFilters(small, 3).count();
	assert.equal(small[0].method, 'GET');

	const large = [];
	await collectionWithFilters(large, 80).count();
	assert.equal(large[0].method, 'PATCH');
	assert.equal(large[0].path, 'item_location/count');
});

test('both transports carry an identical option map', async () => {
	// The same query must return the same rows however it travelled, so the two
	// paths may differ only in transport - never in what the server receives.
	const viaGet = [];
	await collectionWithFilters(viaGet, 3).getAll();

	const viaPatch = [];
	await collectionWithFilters(viaPatch, 3).getAll();
	// Force the large-payload branch for the identical filter set.
	const collection = collectionWithFilters(viaPatch, 0);
	collection.queryParams = { ...viaGet[0].options, padding: 'x'.repeat(1300) };
	await collection.getAll();

	assert.equal(viaPatch[1].method, 'PATCH');
	for (const [key, value] of Object.entries(viaGet[0].options)) {
		assert.equal(viaPatch[1].options[key], value, `option ${key} must survive the PATCH path`);
	}
});

test('the switch is driven by encoded size, not filter count', async () => {
	// One filter with a very long value must switch too - the budget is bytes.
	const calls = [];
	const collection = new Collection(recordingHttpService(calls), null, 'item_location');
	collection.filter('note', '=', 'x'.repeat(1300));
	await collection.getAll();

	assert.equal(calls[0].method, 'PATCH');
});
