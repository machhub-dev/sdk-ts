# @machhub-dev/sdk-ts

Official TypeScript SDK for the MACHHUB platform by [Intellogic Technology Sdn Bhd](https://intellogic.com.my).

## Overview

MACHHUB is an industrial IoT platform for building real-time data-driven applications. This SDK provides a unified TypeScript interface to interact with MACHHUB services, including:

- **Authentication** — Login, session management, and permission checks
- **Collections** — Query and manage structured data with a fluent, chainable API
- **Tags** — Publish and subscribe to real-time machine/sensor data over MQTT
- **Historian** — Retrieve historical tag data and run time-series queries
- **Processes** — Execute named processes defined on the MACHHUB platform

The SDK supports both browser and Node.js environments and can be initialized with an explicit config or automatically when used alongside the MACHHUB VS Code Extension.

## Installation

```bash
npm install @machhub-dev/sdk-ts
```

## Quick Start

**With explicit config:**

```typescript
import { SDK, type SDKConfig } from '@machhub-dev/sdk-ts';

const config: SDKConfig = {
  application_id: 'your-app-id',
  httpUrl: 'http://localhost:6188', // optional, defaults to http://localhost:6188
  mqttUrl: 'ws://localhost:180',    // optional, defaults to ws://localhost:180
  developer_key: 'your-dev-key',   // optional
};

const sdk = new SDK();
await sdk.Initialize(config);
```

**With the MACHHUB VS Code Extension:**

When running inside a MACHHUB Extension environment, `Initialize()` can be called without any config. The SDK will automatically resolve the application ID and connection URLs from the Extension context.

```typescript
import { SDK } from '@machhub-dev/sdk-ts';

const sdk = new SDK();
await sdk.Initialize(); // config not required when using the Extension
```

## Modules

### Auth

```typescript
// Login
const session = await sdk.auth.login('username', 'password');

// Get current user
const user = await sdk.auth.getCurrentUser();

// Logout
await sdk.auth.logout();
```

### Collection

Query and manage data collections with a fluent builder API.

```typescript
const results = await sdk.collection('my-collection')
  .filter('status', 'eq', 'active')
  .sort('created_at', 'desc')
  .limit(20)
  .offset(0)
  .expand('related_field')
  .getAll();
```

### Tag

Publish and subscribe to real-time tag data over MQTT.

```typescript
// List all tags
const tags = await sdk.tag.getAllTags();

// Subscribe to live data
await sdk.tag.subscribe('my/topic', (data, topic) => {
  console.log(topic, data);
});

// Publish data
await sdk.tag.publish('my/topic', { value: 42 });

// Unsubscribe
await sdk.tag.unsubscribe('my/topic');
```

### Historian

Access historical tag data.

```typescript
// Fetch historical data from a start time
const history = await sdk.historian.getHistoricalData(
  'my/topic',
  new Date('2024-01-01T00:00:00Z'),
  '1h' // optional range
);

// Get the last N values (max 100)
const latest = await sdk.historian.getLastNValues('my/topic', 10);

// Subscribe to live historized data
await sdk.historian.subscribeLiveData('my/topic', (data) => {
  console.log(data);
});

// Raw SurrealQL query
const result = await sdk.historian.query('SELECT * FROM tag WHERE topic = "my/topic"');
```

### Processes

Execute named processes defined on the MACHHUB platform.

```typescript
// Execute a process by name
const result = await sdk.processes.execute('my-process', { key: 'value' });

// Execute without input
const result = await sdk.processes.execute('my-process');
```

## License

[MPL-2.0](LICENSE)
