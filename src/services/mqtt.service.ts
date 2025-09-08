import mqtt from 'mqtt';

interface SubscribedTopic {
    topic: string;
    handler: (message: unknown) => void;
}

export class MQTTService {
    private url!: string;
    public client!: mqtt.MqttClient;
    private static instance: MQTTService | undefined;
    private subscribedTopics: SubscribedTopic[] = [];

    constructor(url: string) {
        this.url = url;
    }

    static async getInstance(url: string = "ws://localhost:180"): Promise<MQTTService> {
        if (!this.instance || !this.instance.client) {
            this.instance = new MQTTService(url);

            // Ensure the URL is set correctly
            this.instance.url = url;

            // Initialize the MQTT client
            this.instance.client = mqtt.connect(this.instance.url, { protocolVersion: 5 });
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
    public addTopicHandler(topic: string, handler: (message: unknown) => void): void {
        try {
            this.subscribedTopics.push({ topic, handler });
            if (topic == "") return;
            console.log("New Subscription Handler:", topic);
            this.client.subscribe(topic, { qos: 2 }, (err?: unknown) => {
                if (err) {
                    console.error(`Failed to subscribe to topic ${topic}:`, err);
                }
            });
        } catch (e) {
            console.error(`Failed to subscribe to topic ${topic}:`, e);
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
            console.log("Publishing to", topic, "with payload:", payload);

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
            console.log("MQTT connected to", this.url);
        });

        this.client.on('error', (error: Error) => {
            console.error("MQTT connection error:", error);
        });

        this.client.on('message', (topic: string, message: Buffer) => {
            for (const subscribedTopic of this.subscribedTopics) {
                if (topic === subscribedTopic.topic) {
                    const parsedMessage = this.parseMessage(message);
                    subscribedTopic.handler(parsedMessage);
                    break;
                }
            }
        });
    }

    private parseMessage(message: Buffer): unknown {
        try {
            return JSON.parse(message.toString());
        } catch (error) {
            console.error("Error parsing message:", error);
            return null;
        }
    }
}
