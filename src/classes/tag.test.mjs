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

test('a subscriber gets the quality MACHHUB sends as user properties', () => {
	const service = serviceWithFakeClient();
	service.client.subscribe = () => {};
	const tag = new Tag(null, service);
	const got = [];
	tag.subscribe('Plant/Pump/Speed', (value, topic, meta) => got.push({ value, topic, meta }));

	service.client.emit('message', 'Plant/Pump/Speed', Buffer.from('41.5'), {
		retain: true,
		properties: { userProperties: { 'mh-q': 'uncertain', 'mh-src-ts': '2026-11-18T10:00:00Z', 'mh-status': '1073741824' } }
	});
	service.client.emit('message', 'Plant/Pump/Speed', Buffer.from('42'), { retain: false });
	service.client.emit('message', 'Plant/Pump/Speed', Buffer.from('43'), { properties: { userProperties: { 'mh-q': 'weird', 'mh-status': '0' } } });

	assert.deepEqual(got, [
		{ value: 41.5, topic: 'Plant/Pump/Speed', meta: { retained: true, quality: 'uncertain', sourceTime: '2026-11-18T10:00:00Z', status: 1073741824 } },
		{ value: 42, topic: 'Plant/Pump/Speed', meta: { retained: false } },
		{ value: 43, topic: 'Plant/Pump/Speed', meta: { retained: false } }
	]);
});
