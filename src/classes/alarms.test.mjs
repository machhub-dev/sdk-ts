// Tests for sdk.alarms: the paths and bodies it sends to /machhub/alarms, and
// subscribe's poll-and-compare behaviour.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';

import { Alarms } from '../../dist/classes/alarms.js';

// recordingHttpService stands in for HTTPService. `request` is a getter on the
// real class, so it is one here too; `answers` maps a path to what it returns.
function recordingHttpService(calls, answers = {}) {
	return {
		get request() {
			return {
				body: undefined,
				withJSON(body) {
					this.body = body;
					return this;
				},
				async get(path, query) {
					calls.push({ method: 'GET', path, query });
					const a = answers[path];
					return typeof a === 'function' ? a() : a;
				},
				async post(path) {
					calls.push({ method: 'POST', path, body: this.body });
					const a = answers[path];
					return typeof a === 'function' ? a() : a;
				}
			};
		}
	};
}

test('live reads alarms/live and passes activeOnly', async () => {
	const calls = [];
	const alarms = new Alarms(recordingHttpService(calls, { 'alarms/live': { version: 3, serverTime: 'x', alarms: null } }));

	const all = await alarms.live();
	const active = await alarms.live({ activeOnly: true });

	assert.deepEqual(all.alarms, [], 'a null list from the server becomes []');
	assert.equal(calls[0].path, 'alarms/live');
	assert.equal(calls[0].query, undefined);
	assert.deepEqual(calls[1].query, { activeOnly: 'true' });
	assert.equal(active.version, 3);
});

test('ack accepts strings and RecordIDs, one or many', async () => {
	const calls = [];
	const alarms = new Alarms(recordingHttpService(calls, { 'alarms/ack': { applied: ['alarm_rules:a'] } }));

	await alarms.ack('alarm_rules:a');
	await alarms.ack([{ Table: 'alarm_rules', ID: 'b' }, 'alarm_rules:c'], 'seen');

	assert.deepEqual(calls[0], { method: 'POST', path: 'alarms/ack', body: { ruleIDs: ['alarm_rules:a'] } });
	assert.deepEqual(calls[1].body, { ruleIDs: ['alarm_rules:b', 'alarm_rules:c'], comment: 'seen' });
});

test('an action with no rules is refused before any request', async () => {
	const calls = [];
	const alarms = new Alarms(recordingHttpService(calls));
	await assert.rejects(() => alarms.ack([]), /at least one alarm rule/);
	await assert.rejects(() => alarms.shelve('alarm_rules:a', 0), /positive number of minutes/);
	assert.equal(calls.length, 0);
});

test('shelve and unshelve send their bodies', async () => {
	const calls = [];
	const alarms = new Alarms(recordingHttpService(calls, {
		'alarms/shelve': { applied: [], skipped: { 'alarm_rules:a': 'shelving not allowed' } },
		'alarms/unshelve': { applied: ['alarm_rules:a'] }
	}));

	const shelved = await alarms.shelve('alarm_rules:a', 30.4, 'maintenance');
	await alarms.unshelve('alarm_rules:a');

	assert.deepEqual(calls[0].body, { ruleIDs: ['alarm_rules:a'], minutes: 30, comment: 'maintenance' });
	assert.deepEqual(shelved.skipped, { 'alarm_rules:a': 'shelving not allowed' });
	assert.deepEqual(calls[1], { method: 'POST', path: 'alarms/unshelve', body: { ruleIDs: ['alarm_rules:a'] } });
});

test('history queries map to the server parameter names', async () => {
	const calls = [];
	const alarms = new Alarms(recordingHttpService(calls, { 'alarms/occurrences': { items: null, total: 0 }, 'alarms/events': undefined }));
	const start = new Date('2026-11-01T00:00:00.000Z');

	const page = await alarms.occurrences({ start, priorities: ['high', 'critical'], ruleID: { Table: 'alarm_rules', ID: 'a' }, openOnly: true, order: 'asc', limit: 10, offset: 20 });
	const journal = await alarms.events({ types: ['raised', 'acknowledged'], search: 'pump' });

	assert.deepEqual(page, { items: [], total: 0 });
	assert.deepEqual(journal, { items: [], total: 0 });
	assert.deepEqual(calls[0].query, {
		start: start.toISOString(), priority: 'high,critical', ruleID: 'alarm_rules:a',
		open: 'true', order: 'asc', limit: '10', offset: '20'
	});
	assert.deepEqual(calls[1].query, { types: 'raised,acknowledged', search: 'pump' });
});

test('subscribe calls back only when the version changes, and stops', async () => {
	const versions = [1, 1, 2];
	let i = 0;
	const calls = [];
	const alarms = new Alarms(recordingHttpService(calls, {
		'alarms/live': () => ({ version: versions[Math.min(i++, versions.length - 1)], serverTime: 'x', alarms: [] })
	}));

	const seen = [];
	const stop = alarms.subscribe((snap) => seen.push(snap.version), { intervalMs: 500 });
	await new Promise((r) => setTimeout(r, 1200));
	stop();
	const polls = calls.length;
	await new Promise((r) => setTimeout(r, 700));

	assert.deepEqual(seen, [1, 2]);
	assert.equal(calls.length, polls, 'no poll after stop');
});

test('a failed poll reaches onError and polling continues', async () => {
	let n = 0;
	const errors = [];
	const alarms = new Alarms(recordingHttpService([], {
		'alarms/live': () => {
			if (n++ === 0) throw new Error('offline');
			return { version: 7, serverTime: 'x', alarms: [] };
		}
	}));

	const seen = [];
	const stop = alarms.subscribe((s) => seen.push(s.version), { intervalMs: 500, onError: (e) => errors.push(e.message) });
	await new Promise((r) => setTimeout(r, 700));
	stop();

	assert.deepEqual(errors, ['offline']);
	assert.deepEqual(seen, [7]);
});
