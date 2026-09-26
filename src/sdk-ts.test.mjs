// Surface tests for the SDK facade.
//
// `sdk.function` was a leftover: the field was never assigned by Initialize and
// there is no function API on the server, so reading it only ever produced a
// misleading "SDK is not initialized" error. It is gone as of 1.2.1 - code that
// wants to run a process calls sdk.processes.execute instead.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SDK } from '../dist/sdk-ts.js';

const dist = (file) => readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');

test('the removed `function` member is not part of the SDK surface', () => {
	const sdk = new SDK();

	assert.equal('function' in sdk, false, '`sdk.function` must not exist');
	assert.equal(sdk.function, undefined);
	assert.doesNotMatch(
		dist('sdk-ts.d.ts'),
		/get function/,
		'the declaration must not offer a `function` getter either'
	);
});

test('the initialization guards that remain still name their member', () => {
	// Removing `function` must not disturb the other lazily built services.
	const sdk = new SDK();

	for (const member of ['auth', 'historian', 'tag', 'processes']) {
		assert.throws(() => sdk[member], new RegExp('SDK is not initialized.+`' + member + '`'), member);
	}
});

test('log and env work before Initialize', () => {
	const sdk = new SDK();

	assert.doesNotThrow(() => sdk.log);
	assert.doesNotThrow(() => sdk.env);
});
