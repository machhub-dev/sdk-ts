// Export-argument tests for the Historian CSV export, plus a guard on the
// public shape of AggregationOption.
//
// AggregationOption used to be declared as an object interface
// (`{ mean: "mean", ... }`), so `getHistoricalDataAsCSV(..., 'mean')` did not
// typecheck and callers had to write `'mean' as any`. It is a string union now,
// and the declaration assertions below fail if it ever regresses to a shape a
// plain string cannot satisfy.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { Historian } from '../../dist/classes/historian.js';

const dist = (file) => readFileSync(new URL(`../../dist/${file}`, import.meta.url), 'utf8');

// recordingHttpService stands in for HTTPService, capturing the body the export
// sends. `request` is a getter on the real class, so it is one here too.
function recordingHttpService(calls) {
	const params = {
		withJSON(body) {
			this.body = body;
			return this;
		},
		async postAsBlob(path) {
			calls.push({ path, body: this.body });
			return new Blob([]);
		}
	};
	return {
		get request() {
			return { ...params };
		}
	};
}

const start = new Date('2026-09-01T00:00:00.000Z');
const end = new Date('2026-09-02T00:00:00.000Z');

test('a plain aggregation string reaches the server untouched', async () => {
	const calls = [];
	const historian = new Historian(recordingHttpService(calls), null);

	for (const aggregation of ['mean', 'sum', 'min', 'max', 'median', 'none']) {
		await historian.getHistoricalDataAsCSV(['Line/Temp'], start, end, undefined, '1_minute', aggregation);
	}

	assert.equal(calls.length, 6);
	assert.deepEqual(
		calls.map((call) => call.body.aggregation),
		['mean', 'sum', 'min', 'max', 'median', 'none'],
		'every union member must be forwarded verbatim'
	);
	assert.equal(calls[0].path, 'historian/export/aggregated');
});

test('an omitted aggregation and sampleRate fall back to empty strings', async () => {
	const calls = [];
	const historian = new Historian(recordingHttpService(calls), null);

	await historian.getHistoricalDataAsCSV(['Line/Temp'], start, end);

	assert.equal(calls[0].body.aggregation, '', 'the server reads "" as no aggregation');
	assert.equal(calls[0].body.sampleRate, '');
	assert.deepEqual(calls[0].body.mapping, {});
	assert.equal(calls[0].body.startDate, start.toISOString());
	assert.equal(calls[0].body.endDate, end.toISOString());
});

test('AggregationOption is declared as a string union and re-exported', () => {
	// A .mjs test is not typechecked, so assert on the emitted declarations -
	// they are what a consuming project actually compiles against.
	assert.match(
		dist('classes/historian.d.ts'),
		/export (declare )?type AggregationOption = "mean" \| "sum" \| "min" \| "max" \| "median" \| "none"/,
		'AggregationOption must stay a string union, not an object shape'
	);
	assert.match(
		dist('index.d.ts'),
		/AggregationOption/,
		'AggregationOption must be exported from the package entry point'
	);
});
