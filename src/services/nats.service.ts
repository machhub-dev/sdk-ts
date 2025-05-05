import { NatsConnection, wsconnect} from "@nats-io/nats-core";
import { connect } from "@nats-io/transport-node";

const HEALTH_SUBJECT = "runtime.typescript.health";

interface SubscribedSubject {
    subject: string;
    handler: (message: unknown) => void;
}

export class NATSService {
    private url!: string;
    private functions: { [key: string]: (data: { [key: string]: any }) => { [key: string]: any } } = {};
    private connection: NatsConnection | null = null;
    private static instance: NATSService | undefined;
    private subscribedSubjects: SubscribedSubject[] = [];
    private readonly EXEC_FUNCTION_SUBJECT = "runtime.exec.typescript.*";

    constructor(url: string) {
        this.url = url;
    }

    /**
     * Returns a singleton instance of NATSService.
     */
    static async getInstance(url: string = "ws://localhost:7500"): Promise<NATSService> {
        if (!this.instance || !this.instance.connection) {
            this.instance = new NATSService(url);
            await this.instance.connect();
        }
        return this.instance;
    }

    /**
     * Resets the singleton instance.
     */
    public static resetInstance(): void {
        if (this.instance) {
            this.instance.connection?.close();
            this.instance = undefined;
        }
    }

    /**
     * Connects to the NATS broker.
     */
    private async connect(): Promise<void> {
        let retries = 0;
        const maxRetries = 10;

        while (!this.connection && retries < maxRetries) {
            try {
                NATSService.log(`Connecting to NATS server (${this.url})...`);
                if (this.url.startsWith("nats")){
                    NATSService.log("nats");
                    this.connection = await connect({ servers: this.url });
                } else if (this.url.startsWith("ws")){
                    NATSService.log("ws");
                    this.connection = await wsconnect({ servers: this.url });
                } else{
                    NATSService.log("Unsupported protocol : ", this.url.split("://")[0]);
                }
                this.connection?.publish(HEALTH_SUBJECT, JSON.stringify(true));
                NATSService.log(`Published message: true to ${HEALTH_SUBJECT}`);
                NATSService.log("Connected to NATS server");
            } catch (err: any) {
                NATSService.log("Caught an error during connection attempt:", err); // Debugging log
                retries++;
                console.error(`Failed to connect to NATS server. Retrying (${retries}/${maxRetries})...`, err);
                if (retries >= maxRetries) {
                    throw new Error("Max retries reached. Unable to connect to NATS server.");
                }
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }

        if (!this.connection) {
            throw new Error("Failed to establish a connection to the NATS server.");
        }
    }

    /**
     * Adds a subject and handler to the subscribed list.
     * @param subject {string} The subject to subscribe to.
     * @param handler {(message: unknown) => void} The handler function for incoming messages.
     */
    public addSubjectHandler(subject: string, handler: (message: unknown) => void): void {
        try {
            this.subscribedSubjects.push({ subject, handler });
            NATSService.log("New Subscription Handler:", subject);

            this.connection?.subscribe(subject, {
                callback: (err, msg) => {
                    if (err) {
                        console.error(`Error handling message for subject ${subject}:`, err);
                        return;
                    }
                    const parsedMessage = this.parseMessage(msg.data);
                    handler(parsedMessage);
                },
            });
        } catch (e) {
            console.error(`Failed to subscribe to subject ${subject}:`, e);
        }
    }

    /**
     * Subscribes to the EXEC_FUNCTION_SUBJECT and executes registered functions.
    */
    public initializeFunctions(): boolean {
        if (!this.connection) {
            throw new Error("No active connection. Please connect to the NATS server first.");
        }

        this.connection.subscribe(this.EXEC_FUNCTION_SUBJECT, {
            callback: (err, msg) => {
                if (err) {
                    console.error("Error handling message:", err);
                    return;
                }

                const data = JSON.parse(msg.data.toString()) as { [key: string]: any };
                const subjectParts = msg.subject.split(".");
                if (subjectParts.length !== 4) {
                    msg.respond(JSON.stringify({ error: "Invalid subject format" }));
                    return;
                }

                const functionName = subjectParts[3];
                try {
                    const result = this.executeFunction(functionName, data);
                    NATSService.log(JSON.stringify(result));
                    msg.respond(JSON.stringify(result));
                } catch (e: any) {
                    msg.respond(JSON.stringify({ error: e.message }));
                }
            },
        });

        NATSService.log(`Subscribed to '${this.EXEC_FUNCTION_SUBJECT}'`);
        return true
    }

    /**
 * Adds a new function to the registry.
 * @param functionName {string} The name of the function to add.
 * @param func {(data: Record<string, any>) => Record<string, any>} The function implementation.
 * @throws TypeError if the provided argument is not a function.
 */
    public addFunction(functionName: string, func: (data: { [key: string]: any }) => { [key: string]: any }): void {
        if (typeof func !== "function") {
            throw new TypeError(`The provided argument '${functionName}' is not a function.`);
        }
        this.functions[functionName] = func;
    }


    /**
     * Executes a registered function by name with the provided arguments.
     * @param functionName {string} The name of the function to execute.
     * @param arg {Record<string, any>} The arguments to pass to the function. (JSON)
     * @returns {Record<string, any>} The result of the function execution. (JSON)
     * @throws Error if the function is not found.
     */
    public executeFunction(functionName: string, arg: { [key: string]: any }): { [key: string]: any } {
        if (this.functions[functionName]) {
            return this.functions[functionName](arg);
        } else {
            throw new Error(`Function '${functionName}' not found`);
        }
    }

    /**
     * Clears all subscribed subjects.
     */
    public clearSubjects(): void {
        this.subscribedSubjects = [];
    }

    /**
     * Publishes a message to a specific subject.
     * @param subject {string} The subject to publish to.
     * @param message {unknown} The message to publish.
     * @returns {boolean} True if the message was published successfully.
     */
    public publish(subject: string, message: unknown): boolean {
        try {
            const payload = JSON.stringify(message);
            NATSService.log("Publishing to", subject, "with payload:", payload);

            this.connection?.publish(subject, payload);
        } catch (e) {
            console.error(`Failed to publish to subject ${subject}:`, e);
            throw e;
        }
        return true;
    }

    /**
     * Retrieves all registered functions.
     * @returns {Record<string, (data: Record<string, any>) => Record<string, any>>} An object containing all registered functions.
     */
    public getAllFunctions(): { [key: string]: (data: { [key: string]: any }) => { [key: string]: any } } {
        return this.functions;
    }

    public static log(message?: any, ...optionalParams: any[]) {
        console.log("[TYPESCRIPT] >", message, ...optionalParams);
    }

    /**
     * Prints the names of all available functions to the console.
     */
    public printFunctions(): void {
        NATSService.log("Available functions: ", Object.keys(this.functions).join(", "));
    }

    /**
     * Parses a message buffer into a JSON object.
     * @param message {Uint8Array} The message buffer.
     * @returns {unknown} The parsed message.
     */
    private parseMessage(message: Uint8Array): unknown {
        try {
            return JSON.parse(Buffer.from(message).toString());
        } catch (error) {
            console.error("Error parsing message:", error);
            return null;
        }
    }
}