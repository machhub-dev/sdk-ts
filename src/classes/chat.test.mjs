// sdk.chat (app agents): the ticket it asks for, the socket messages it
// sends, and the events it turns the server's messages into, against a
// stand-in HTTPService and WebSocket.
//
// Run: npm test        (node --test, no framework)

import assert from 'node:assert/strict';
import test from 'node:test';

import { Chat, ChatMessages } from '../../dist/classes/chat.js';
import { HTTPException } from '../../dist/services/http.service.js';

function http(calls, reply) {
	const params = {
		withJSON(body) {
			this.body = body;
			return this;
		},
		async post(path, query) {
			calls.push({ path, query, body: this.body });
			return reply(path, query);
		}
	};
	return {
		url: new URL('https://plant.example/apps/hmi/machhub'),
		get request() {
			return { ...params };
		}
	};
}

// A WebSocket that opens at once and records what is sent.
function socketClass(sockets) {
	return class FakeSocket {
		constructor(url) {
			this.url = url;
			this.sent = [];
			this.readyState = 0;
			sockets.push(this);
			queueMicrotask(() => {
				this.readyState = 1;
				this.onopen?.();
			});
		}
		send(data) {
			this.sent.push(JSON.parse(data));
		}
		close() {
			this.readyState = 3;
			this.onclose?.({ code: 1000 });
		}
		// The server's side.
		reply(m) {
			this.onmessage?.({ data: JSON.stringify(m) });
		}
	};
}

const ticket = () => ({ ticket: 'tk-1', session_id: 'app-s1', socket: '/machhub/assistant/ws/app-s1' });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('ask takes a ticket, opens the app path with it and sends no agent', async () => {
	const calls = [];
	const sockets = [];
	const chat = new Chat(http(calls, ticket), { WebSocket: socketClass(sockets) });
	const answered = chat.ask('What was L3 scrap last shift?', { sources: ['line3-sops'] });
	await tick();
	await tick();
	assert.equal(calls[0].path, 'assistant/ticket');
	const url = new URL(sockets[0].url);
	assert.equal(url.protocol, 'wss:');
	assert.equal(url.pathname, '/apps/hmi/machhub/assistant/ws/app-s1');
	assert.equal(url.searchParams.get('ticket'), 'tk-1');
	assert.deepEqual(sockets[0].sent[0], { question: 'What was L3 scrap last shift?', sources: ['line3-sops'] });
	assert.equal('agent_id' in sockets[0].sent[0], false);

	const deltas = [];
	chat.on('delta', (t) => deltas.push(t));
	sockets[0].reply({ type: 'status', text: 'OEE summary…' });
	sockets[0].reply({ type: 'delta', text: 'L3 scrapped ' });
	sockets[0].reply({ type: 'answer', text: 'L3 scrapped 14.', citations: [{ verb: 'app__hmi__oee_summary' }], trace_id: 't1' });
	const a = await answered;
	assert.equal(a.text, 'L3 scrapped 14.');
	assert.equal(a.citations.length, 1);
	assert.deepEqual(deltas, ['L3 scrapped ']);
	assert.equal(chat.sessionId, 'app-s1');
	const h = await chat.history();
	assert.equal(h.length, 1);
	assert.equal(h[0].answer.text, 'L3 scrapped 14.');
});

test('a confirm request becomes a card whose confirm and decline answer the server', async () => {
	const sockets = [];
	const chat = new Chat(http([], ticket), { WebSocket: socketClass(sockets) });
	const cards = [];
	chat.on('confirm', (req) => cards.push(req));
	const answered = chat.ask('Changeover L3 to SKU 42');
	await tick();
	await tick();
	const expires = new Date(Date.now() + 60_000).toISOString();
	sockets[0].reply({ type: 'confirm_request', action_id: 'a1', tool: 'Start changeover', text: 'Start changeover on L3 to SKU 42?', expires, can_confirm: true });
	assert.equal(cards.length, 1);
	assert.equal(cards[0].text, 'Start changeover on L3 to SKU 42?');
	assert.equal(cards[0].canConfirm, true);
	assert.ok(cards[0].expires instanceof Date);

	const confirmed = cards[0].confirm();
	assert.deepEqual(sockets[0].sent.at(-1), { type: 'confirm', action_id: 'a1' });
	sockets[0].reply({ type: 'confirm_ok', action_id: 'a1', text: 'confirm' });
	await confirmed;
	sockets[0].reply({ type: 'answer', text: 'Changeover started on L3.' });
	assert.equal((await answered).text, 'Changeover started on L3.');
});

test('a kiosk card cannot confirm, and the server says why', async () => {
	const sockets = [];
	const chat = new Chat(http([], ticket), { WebSocket: socketClass(sockets) });
	let card;
	chat.on('confirm', (req) => (card = req));
	chat.ask('Changeover L3').catch(() => {});
	await tick();
	await tick();
	sockets[0].reply({ type: 'confirm_request', action_id: 'a2', tool: 'Start changeover', text: 'Start changeover on L3?', can_confirm: false });
	assert.equal(card.canConfirm, false);
	const tried = card.confirm();
	sockets[0].reply({ type: 'confirm_error', action_id: 'a2', text: ChatMessages.sharedLogin });
	await assert.rejects(tried, { message: ChatMessages.sharedLogin });
	const declined = card.decline();
	assert.deepEqual(sockets[0].sent.at(-1), { type: 'decline', action_id: 'a2' });
	sockets[0].reply({ type: 'confirm_ok', action_id: 'a2', text: 'decline' });
	await declined;
});

test('handle runs a client tool and sends back what it returns or throws', async () => {
	const sockets = [];
	const chat = new Chat(http([], ticket), { WebSocket: socketClass(sockets) });
	chat.handle('highlight_line', async ({ line }) => ({ highlighted: line }));
	chat.handle('broken', () => {
		throw new Error('no screen');
	});
	chat.ask('Show me L2').catch(() => {});
	await tick();
	await tick();
	sockets[0].reply({ type: 'client_tool', call_id: 'c1', name: 'highlight_line', args: { line: 'L2' } });
	sockets[0].reply({ type: 'client_tool', call_id: 'c2', name: 'broken', args: {} });
	sockets[0].reply({ type: 'client_tool', call_id: 'c3', name: 'unknown', args: {} });
	await tick();
	const results = sockets[0].sent.filter((m) => m.type === 'client_tool_result').sort((a, b) => a.call_id.localeCompare(b.call_id));
	assert.deepEqual(results[0], { type: 'client_tool_result', call_id: 'c1', result: { highlighted: 'L2' } });
	assert.deepEqual(results[1].result, { error: 'no screen' });
	assert.match(results[2].result.error, /does not handle unknown/);
});

test('stop cancels, and the ask rejects as stopped', async () => {
	const sockets = [];
	const chat = new Chat(http([], ticket), { WebSocket: socketClass(sockets) });
	const answered = chat.ask('Long question');
	await tick();
	await tick();
	chat.stop();
	assert.deepEqual(sockets[0].sent.at(-1), { type: 'cancel' });
	sockets[0].reply({ type: 'stopped' });
	await assert.rejects(answered, { code: 'stopped' });
});

test('the server\'s budget error rejects the ask with its line', async () => {
	const sockets = [];
	const chat = new Chat(http([], ticket), { WebSocket: socketClass(sockets) });
	const errors = [];
	chat.on('error', (e) => errors.push(e));
	const answered = chat.ask('Anything');
	await tick();
	await tick();
	sockets[0].reply({ type: 'error', code: 'budget', text: ChatMessages.budget });
	await assert.rejects(answered, { message: ChatMessages.budget, code: 'budget' });
	assert.equal(errors[0].code, 'budget');
});

test('a pending agent is refused at the ticket with the server\'s line', async () => {
	const chat = new Chat(
		http([], () => {
			throw new HTTPException(409, 'Conflict', JSON.stringify({ code: 'not_ready', message: ChatMessages.notReady }));
		}),
		{ WebSocket: socketClass([]) }
	);
	await assert.rejects(chat.ask('Hello'), { message: ChatMessages.notReady, code: 'not_ready' });
});

test('one question at a time', async () => {
	const sockets = [];
	const chat = new Chat(http([], ticket), { WebSocket: socketClass(sockets) });
	chat.ask('First').catch(() => {});
	await tick();
	await tick();
	await assert.rejects(chat.ask('Second'), { code: 'busy' });
	chat.close();
});
