// Tests for the live-data connection state on sdk.tag.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';

import { MQTTService } from '../../dist/services/mqtt.service.js';
import { Tag } from '../../dist/classes/tag.js';

// A service whose client is a bare emitter, so connect, close and offline can
// be raised by hand without a broker.
function serviceWithFakeClient() {
	const service = new MQTTService('ws://unused');
	service.client = new EventEmitter();
	service['attachMessageListener']();
	return service;
}

test('connection state follows connect, offline and close', () => {
	const service = serviceWithFakeClient();
	const tag = new Tag(null, service);
	const seen = [];

	const stop = tag.onConnectionChange((up) => seen.push(up));
	assert.equal(tag.connected, false);

	service.client.emit('connect');
	service.client.emit('connect'); // no change, no call
	service.client.emit('offline');
	service.client.emit('close');
	service.client.emit('connect');
	stop();
	service.client.emit('close');

	assert.deepEqual(seen, [false, true, false, true], 'called now, then once per change, never after stop');
	assert.equal(tag.connected, false);
});

test('without an MQTT service the state is down', () => {
	const tag = new Tag(null, null);
	const seen = [];
	tag.onConnectionChange((up) => seen.push(up))();
	assert.deepEqual(seen, [false]);
	assert.equal(tag.connected, false);
});
