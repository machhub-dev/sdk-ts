// End-to-end run of sign-in for a collection's records against a live API,
// through the SDK build in dist/. Not part of the suite: run by hand with
//   npm run build && MACHHUB_URL=http://localhost:6192 node scripts/e2e-app-users.mjs
// It leaves its collection behind for the browser check (KEEP=1) or removes it.

import { SDK } from '../dist/sdk-ts.js';

const url = process.env.MACHHUB_URL;
const keep = process.env.KEEP === '1';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass, detail });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const rid = (id) => (typeof id === 'string' ? id : `${id.Table}:${id.ID}`);

let headers;
async function api(method, path, body, h = headers) {
	const res = await fetch(`${url}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await res.text();
	let json;
	try { json = JSON.parse(text); } catch { json = text; }
	return { status: res.status, json, text, headers: res.headers };
}
async function must(method, path, body) {
	const r = await api(method, path, body);
	if (r.status >= 300) throw new Error(`${method} ${path}: ${r.status} ${r.text.slice(0, 300)}`);
	return r.json;
}
async function expectErr(name, fn, status, code) {
	try {
		await fn();
		ok(name, false, 'no error');
	} catch (e) {
		const pass = e.status === status && (!code || e.code === code);
		ok(name, pass, `status=${e.status} code=${e.code}`);
	}
}
const noSecrets = (label, obj) => {
	const s = JSON.stringify(obj);
	const bad = /"password"|"token_key"|"hash"|argon2/i.test(s) || s.includes(PW.alice) || s.includes(PW.bob);
	ok(`no password, hash or token_key in ${label}`, !bad, bad ? s.slice(0, 200) : '');
};

const PW = { alice: 'alice-pass-1234', bob: 'bob-pass-5678', carol: 'carol-pass-9012', alice2: 'alice-new-pass-77', set: 'set-by-manager-42' };
const name = `e2e_users_${Date.now()}`;

const login = await (await fetch(`${url}/auth/login`, {
	method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ username: 'admin', password: 'admin' })
})).json();
headers = { Authorization: `Bearer ${login.tkn}`, Domain: login.domainID, 'Content-Type': 'application/json' };
const key = await must('POST', '/api/api-key/generate', { name, description: 'auth e2e', access: 'read-write' });

const created = await must('POST', '/api/collection', {
	name, description: 'auth e2e', holds: 'records',
	fields: [{ name: 'name', type: 'string' }, { name: 'team', type: 'string' }]
});
const collectionID = rid(created.id);
const current = (await must('GET', `/api/collection/${collectionID}`));
const col = current.collection ?? current;
const put = await api('PUT', '/api/collection', {
	oldName: name,
	updatedCollection: {
		...col,
		auth: { enabled: true, sign_up: 'open' },
		rules: { manage: { match: 'all', clauses: [{ field: 'team', operator: '=', value_from: 'auth.team' }] } }
	}
});
ok('switch sign-in on with a manage rule (PUT /api/collection)', put.status === 200, `${put.status} ${put.text.slice(0, 200)}`);
const after = await must('GET', `/api/collection/${collectionID}`);
const ac = after.collection ?? after;
ok('auth reads back with defaults', ac.auth?.enabled === true && ac.auth?.sign_up === 'open' && ac.auth?.min_password_length === 8 && ac.auth?.token_ttl_hours === 24, JSON.stringify(ac.auth));
ok('system fields added', ['email', 'verified', 'email_visibility'].every((f) => ac.fields.some((x) => x.name === f)), ac.fields.map((f) => f.name).join(','));

const sdk = new SDK();
await sdk.Initialize({ application_id: login.domainID.replace('domains:', ''), developer_key: key.token, httpUrl: url, mqttUrl: 'ws://localhost:292' });
const c = sdk.collection(name);
const auth = c.auth;

// Sign-up
const a = await auth.signUp(PW.alice ? '  Alice@Example.com ' : '', PW.alice, { name: 'Alice', team: 'red', verified: true });
ok('sign-up answers a token and the record', !!a.token && typeof a.expires === 'number' && !!a.record?.id);
ok('email stored trimmed and lower-cased', a.record.email === 'alice@example.com', a.record.email);
ok('verified in a sign-up body is ignored', a.record.verified !== true, String(a.record.verified));
ok('expires about 24 h out', Math.abs(a.expires - (Date.now() / 1000 + 86400)) < 120, String(a.expires));
noSecrets('the sign-up answer', a);
const aliceID = rid(a.record.id);
await expectErr('sign-up with a taken email is 409 conflict', () => auth.signUp('alice@example.com', 'whatever-123'), 409, 'conflict');
await expectErr('sign-up with a short password is 400', () => auth.signUp('short@example.com', 'abc'), 400);
const b = await auth.signUp('bob@example.com', PW.bob, { name: 'Bob', team: 'blue' });
const cRec = await auth.signUp('carol@example.com', PW.carol, { name: 'Carol', team: 'red' });
const bobID = rid(b.record.id), carolID = rid(cRec.record.id);

// Sign-in
await expectErr('wrong password is 401 invalid_credentials', () => auth.signIn('alice@example.com', 'nope-nope-nope'), 401, 'invalid_credentials');
await expectErr('unknown email is 401 invalid_credentials', () => auth.signIn('nobody@example.com', 'nope-nope-nope'), 401, 'invalid_credentials');
const s = await auth.signIn('ALICE@example.com', PW.alice);
ok('sign-in as Alice (email case-insensitive)', rid(s.record.id) === aliceID);
ok('current() is Alice', rid(auth.current()?.record.id) === aliceID);
ok('current() is null for another collection', sdk.collection('someother').auth.current() === null);
const aliceToken = s.token;

// Reads as Alice
const rows = await c.getAll();
const byID = Object.fromEntries(rows.map((r) => [rid(r.id), r]));
ok('Alice sees her own email', byID[aliceID]?.email === 'alice@example.com', JSON.stringify(byID[aliceID]));
ok("Alice does not see Bob's email", byID[bobID] && !('email' in byID[bobID]), JSON.stringify(byID[bobID]));
ok("Alice sees Carol's email (manage rule, same team)", byID[carolID]?.email === 'carol@example.com', JSON.stringify(byID[carolID]));
noSecrets('getAll as an app user', rows);
const one = await c.getOne(bobID);
ok("getOne(Bob) as Alice has no email", !('email' in one), JSON.stringify(one));
let filterErr;
try { await sdk.collection(name).filter('email', '=', 'bob@example.com').getAll(); } catch (e) { filterErr = e; }
ok('Alice filtering by email is refused', !!filterErr, String(filterErr?.message ?? 'no error').slice(0, 160));

// Writes as Alice
let emailErr;
try { await c.update(bobID, { email: 'evil@example.com' }); } catch (e) { emailErr = e; }
ok("Alice setting Bob's email is refused (not under her manage rule)", !!emailErr && /manager/.test(emailErr.message), String(emailErr?.message ?? 'no error').slice(0, 160));
let pwErr;
try { await c.update(aliceID, { password: 'sneaky-pass-1' }); } catch (e) { pwErr = e; }
ok('a record update with a password key is 400', /Bad Request/.test(pwErr?.message ?? ''), String(pwErr?.message ?? 'no error').slice(0, 160));
await expectErr('Alice cannot set Bob\'s password (other team)', () => auth.setPassword(bobID, PW.set), 403, 'forbidden');
await auth.setPassword(carolID, PW.set);
ok("Alice sets Carol's password (manage rule)", true);
await expectErr("Carol's old password stops working", () => auth.signIn('carol@example.com', PW.carol), 401, 'invalid_credentials');
// Signed in as Alice again in case that call succeeded as Carol.
await auth.signIn('alice@example.com', PW.alice);

// App user token on /api
const onApi = await api('GET', '/api/collection', undefined, { Authorization: `Bearer ${aliceToken}`, Domain: login.domainID });
ok('an app-user token is 401 on /api', onApi.status === 401, String(onApi.status));

// Refresh, change password, sign out everywhere
const r1 = await auth.refresh();
ok('refresh answers a fresh token', !!r1.token);
const cp = await auth.changePassword(PW.alice, PW.alice2);
ok('change password answers a token', !!cp.token);
const oldTok = await api('POST', `/machhub/collections/${name}/auth/refresh`, undefined, { Authorization: `Bearer ${r1.token}`, Domain: login.domainID, 'X-Machhub-Api-Key': key.token });
ok('the token from before the change stops working', oldTok.status === 401, `${oldTok.status} ${oldTok.text.slice(0, 120)}`);
await expectErr('the old password is refused', () => auth.signIn('alice@example.com', PW.alice), 401, 'invalid_credentials');
await auth.signIn('alice@example.com', PW.alice2);
await auth.signOutEverywhere();
ok('sign out everywhere clears current()', auth.current() === null);

// As the developer key alone (manager by credential)
const all = await c.getAll();
ok('the key alone sees every email', all.every((r) => typeof r.email === 'string'), all.map((r) => r.email).join(','));
noSecrets('getAll as the key', all);
await auth.setPassword(bobID, PW.set);
ok("the key sets Bob's password", true);
const bobIn = await auth.signIn('bob@example.com', PW.set);
ok('Bob signs in with the password the key set', rid(bobIn.record.id) === bobID);
await auth.signOut();

// A manage rule that leaves out the caller's own record (the contract's advice)
{
	const cur = await must('GET', `/api/collection/${collectionID}`);
	const cc = cur.collection ?? cur;
	const r = await api('PUT', '/api/collection', {
		oldName: name,
		updatedCollection: {
			...cc,
			rules: { manage: { match: 'all', clauses: [
				{ field: 'team', operator: '=', value_from: 'auth.team' },
				{ field: 'id', operator: '!=', value_from: 'auth.id' }
			] } }
		}
	});
	ok('save a manage rule of team = auth.team and id != auth.id', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`);
	await new Promise((res) => setTimeout(res, 31_000)); // the collection cache
	await auth.signIn('alice@example.com', PW.alice2);
	let selfErr;
	try { await c.update(aliceID, { verified: true }); } catch (e) { selfErr = e; }
	ok('with id != auth.id, Alice cannot verify herself', !!selfErr && /manager/.test(selfErr.message), String(selfErr?.message ?? 'no error').slice(0, 120));
	let mateErr;
	try { await c.update(carolID, { verified: true }); } catch (e) { mateErr = e; }
	ok('with id != auth.id, Alice still verifies Carol', !mateErr, String(mateErr?.message ?? '').slice(0, 120));
	await auth.signOut();
}

// UI routes and other read paths
const uiSign = await must('GET', `/api/collections/${collectionID}/records/${encodeURIComponent(bobID)}/sign-in`);
ok('UI route reports password_set', uiSign.password_set === true, JSON.stringify(uiSign));
const uiRecords = await api('GET', `/api/collections/${collectionID}/records`);
if (uiRecords.status === 200) noSecrets('the UI records list', uiRecords.json);
const exp = await api('POST', `/api/collection/export/${collectionID}`, {});
if (exp.status === 200) noSecrets('collection export', exp.text);
const hist = await api('GET', `/api/collection/${collectionID}/history`);
if (hist.status === 200) noSecrets('schema history', hist.json);

// Lockout
let locked;
for (let i = 1; i <= 12 && !locked; i++) {
	const r = await api('POST', `/machhub/collections/${name}/auth/sign-in`, { email: 'carol@example.com', password: 'wrong-wrong-' + i }, { 'Content-Type': 'application/json', Domain: login.domainID, 'X-Machhub-Api-Key': key.token });
	if (r.status === 429) locked = { i, retry: r.headers.get('retry-after'), body: r.text.slice(0, 120) };
}
ok('repeated failures lock the email (429 with Retry-After)', !!locked?.retry, JSON.stringify(locked));

// Switch off
const now = (await must('GET', `/api/collection/${collectionID}`));
const nc = now.collection ?? now;
const off = await api('PUT', '/api/collection', { oldName: name, updatedCollection: { ...nc, auth: { enabled: false } } });
ok('switch sign-in off', off.status === 200, `${off.status} ${off.text.slice(0, 160)}`);
await expectErr('after switching off, sign-in is 400 no_sign_in', () => auth.signIn('bob@example.com', PW.set), 400, 'no_sign_in');
const offTok = await api('GET', `/machhub/${name}/all`, undefined, { Authorization: `Bearer ${bobIn.token}`, Domain: login.domainID, 'X-Machhub-Api-Key': key.token });
ok("Bob's token stops working at once after switch-off", offTok.status === 401, `${offTok.status} ${offTok.text.slice(0, 120)}`);
await new Promise((r) => setTimeout(r, 31_000));
const offTok2 = await api('GET', `/machhub/${name}/all`, undefined, { Authorization: `Bearer ${bobIn.token}`, Domain: login.domainID, 'X-Machhub-Api-Key': key.token });
ok("Bob's token stops working 31 s after switch-off", offTok2.status === 401, `${offTok2.status} ${offTok2.text.slice(0, 120)}`);

if (keep) {
	// Switch it back on for the browser check; credentials are gone.
	const n2 = (await must('GET', `/api/collection/${collectionID}`));
	await api('PUT', '/api/collection', { oldName: name, updatedCollection: { ...(n2.collection ?? n2), auth: { enabled: true } } });
	console.log(`kept collection ${name} (${collectionID})`);
} else {
	await api('DELETE', `/api/collection/${collectionID}`);
}
{
	const keys = await must('GET', '/api/api-key/');
	const mine = keys.find((k) => k.name === name);
	if (mine) await api('DELETE', `/api/api-key/delete/${rid(mine.id)}`);
}
sdk.Close?.();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log(`passwords used: ${Object.values(PW).join(' ')}`);
process.exit(failed.length ? 1 : 0);
