import mqtt from 'mqtt';

interface SubscribedTopic {
    topic: string;
    handler: (message: unknown, topic?: string) => void;
}

export class MQTTService {
    private url!: string;
    public client!: mqtt.MqttClient;
    private static instance: MQTTService | undefined;
    private subscribedTopics: SubscribedTopic[] = [];

    constructor(url: string) {
        this.url = url;
    }

    static async getInstance(url: string = "ws://localhost:180", developerKey?:string): Promise<MQTTService> {
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
    public addTopicHandler(topic: string, handler: (message: unknown, topic?: string) => void): void {
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
    public publish(topic: string, message: unknown): boolean {
        try {
            const payload = JSON.stringify(message);
            // console.log("Publishing to", topic, "with payload:", payload);

            this.client.publish(topic, payload, {
                qos: 2,
                retain: true,
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

    private attachMessageListener(): void {
        this.client.on('connect', () => {
            // console.log("MQTT connected to", this.url);
        });

        this.client.on('error', (error: Error) => {
            console.error("MQTT connection error:", error);
        });

        this.client.on('message', (topic: string, message: Buffer) => {
            for (const subscribedTopic of this.subscribedTopics) {
                if (this.matchesTopic(subscribedTopic.topic, topic)) {
                    const parsedMessage = this.parseMessage(message, topic);
                    subscribedTopic.handler(parsedMessage, topic);
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
