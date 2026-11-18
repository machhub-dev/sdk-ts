import mqtt from 'mqtt';
import type { TagMessageMeta, TagQuality } from '../types/tag.models.js';

interface SubscribedTopic {
    topic: string;
    handler: (message: unknown, topic?: string, meta?: TagMessageMeta) => void;
}

export class MQTTService {
    private url!: string;
    public client!: mqtt.MqttClient;
    private static instance: MQTTService | undefined;
    private subscribedTopics: SubscribedTopic[] = [];
    private connectionListeners = new Set<(connected: boolean) => void>();
    private _connected = false;

    constructor(url: string) {
        this.url = url;
    }

    static async getInstance(url: string = "ws://localhost:180", developerKey?: string): Promise<MQTTService> {
        if (!this.instance || !this.instance.client) {
            this.instance = new MQTTService(url);

            // Ensure the URL is set correctly
            this.instance.url = url;

            // Initialize the MQTT client
            const connectOptions = {
                protocolVersion: 5 as const,
                ...(developerKey && {
                    username: "mch_developer_key",
                    password: developerKey,
                })
            };
            this.instance.client = mqtt.connect(this.instance.url, connectOptions);
            this.instance.attachMessageListener();
            // console.log("MQTT Client initialized with URL:", this.instance.url);
        }
        return this.instance;
    }

    // Method to reset the instance
    public static resetInstance(): void {
        if (this.instance) {
            this.instance.client.end();
            this.instance = undefined;
        }
    }

    // addTopicHandler Adds a topic and handler to the subscribed list
    public addTopicHandler(topic: string, handler: (message: unknown, topic?: string, meta?: TagMessageMeta) => void): void {
        try {
            // Check if already subscribed to this topic
            const existingSubscription = this.subscribedTopics.find(sub => sub.topic === topic);

            if (existingSubscription) {
                // If already subscribed, unsubscribe first to get retained message again
                this.removeTopicHandler(topic);
            }

            this.subscribedTopics.push({ topic, handler });
            if (topic == "") return;
            // console.log("New Subscription Handler:", topic);
            this.client.subscribe(topic, { qos: 2 }, (err?: unknown) => {
                if (err) {
                    console.error(`Failed to subscribe to topic ${topic}:`, err);
                }
            });
        } catch (e) {
            console.error(`Failed to subscribe to topic ${topic}:`, e);
        }
    }

    // removeTopicHandler removes a specific topic handler and unsubscribes from the topic
    public removeTopicHandler(topic: string): void {
        try {
            // Remove all handlers for this topic
            this.subscribedTopics = this.subscribedTopics.filter(sub => sub.topic !== topic);

            // Unsubscribe from the MQTT topic
            if (topic && topic !== "") {
                this.client.unsubscribe(topic, (err?: unknown) => {
                    if (err) {
                        console.error(`Failed to unsubscribe from topic ${topic}:`, err);
                    }
                });
            }
        } catch (e) {
            console.error(`Failed to unsubscribe from topic ${topic}:`, e);
        }
    }

    // clearTopics clears all the topics subscribed to
    public clearTopics(): void {
        this.subscribedTopics = [];
    }

    // Publishes a message to a specific topic
    public publish(topic: string, message: unknown, retain: boolean = true): boolean {
        try {

            const payload = typeof message === 'object' && message !== null
                ? JSON.stringify(message)
                : String(message);
            // console.log("Publishing to", topic, "with payload:", payload);

            this.client.publish(topic, payload, {
                qos: 2,
                retain,
                properties: {
                    contentType: "json",
                },
            }, (err?: Error) => {
                if (err) {
                    console.error(`Failed to publish message to ${topic}:`, err);
                }
            });
        } catch (e) {
            console.error(`Failed to publish to topic ${topic}:`, e);
            throw e;
        }
        return true;
    }

    /** Whether the broker connection is up now. */
    public get connected(): boolean {
        return this._connected;
    }

    /**
     * Calls `listener` with the connection state now and on every change.
     * Returns a function that removes it.
     */
    public onConnectionChange(listener: (connected: boolean) => void): () => void {
        this.connectionListeners.add(listener);
        listener(this._connected);
        return () => {
            this.connectionListeners.delete(listener);
        };
    }

    private setConnected(connected: boolean): void {
        if (connected === this._connected) return;
        this._connected = connected;
        for (const listener of this.connectionListeners) {
            try {
                listener(connected);
            } catch (error) {
                console.error("MQTT connection listener failed:", error);
            }
        }
    }

    private attachMessageListener(): void {
        this.client.on('connect', () => this.setConnected(true));
        this.client.on('close', () => this.setConnected(false));
        this.client.on('offline', () => this.setConnected(false));

        this.client.on('error', (error: Error) => {
            console.error("MQTT connection error:", error);
        });

        this.client.on('message', (topic: string, message: Buffer, packet?: mqtt.IPublishPacket) => {
            for (const subscribedTopic of this.subscribedTopics) {
                if (this.matchesTopic(subscribedTopic.topic, topic)) {
                    const parsedMessage = this.parseMessage(message, topic);
                    subscribedTopic.handler(parsedMessage, topic, messageMeta(packet));
                    break;
                }
            }
        });
    }

    // Matches MQTT topic patterns with wildcards (+ for single level, # for multi-level)
    private matchesTopic(pattern: string, topic: string): boolean {
        // Handle exact match first for performance
        if (pattern === topic) {
            return true;
        }

        const patternParts = pattern.split('/');
        const topicParts = topic.split('/');

        let i = 0;
        let j = 0;

        while (i < patternParts.length && j < topicParts.length) {
            const patternPart = patternParts[i];

            if (patternPart === '#') {
                // Multi-level wildcard matches everything from this point
                return true;
            } else if (patternPart === '+') {
                // Single-level wildcard matches any single level
                i++;
                j++;
            } else if (patternPart === topicParts[j]) {
                // Exact match
                i++;
                j++;
            } else {
                // No match
                return false;
            }
        }

        // Check if we've consumed both pattern and topic completely
        return i === patternParts.length && j === topicParts.length;
    }

    private parseMessage(message: Buffer, topic: string): unknown {
        try {
            return JSON.parse(message.toString());
        } catch (error) {
            console.warn("Failed to parse message as JSON '" + topic + "' : ", message.toString());
            return message.toString();
        }
    }
}

const QUALITIES: readonly string[] = ["good", "uncertain", "bad"];

function firstProp(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** Reads the quality MACHHUB sends as MQTT 5 user properties (see TagMessageMeta). */
export function messageMeta(packet?: mqtt.IPublishPacket): TagMessageMeta {
    const meta: TagMessageMeta = { retained: packet?.retain === true };
    const props = packet?.properties?.userProperties as Record<string, string | string[]> | undefined;
    if (!props) return meta;
    const q = firstProp(props["mh-q"]);
    if (q && QUALITIES.includes(q)) meta.quality = q as TagQuality;
    const ts = firstProp(props["mh-src-ts"]);
    if (ts) meta.sourceTime = ts;
    const status = Number(firstProp(props["mh-status"]));
    if (Number.isFinite(status) && status !== 0) meta.status = status;
    return meta;
}
