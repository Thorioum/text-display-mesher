import { Transformer } from "./Transformer.js";

export interface WebworkerInboundPacket {
	type: "webworker.rpc.call";
	id: number;
	method: string;
	args: unknown[];
}

export interface WebworkerResponsePacket {
	type: "webworker.rpc.response";
	id: number;
	result?: unknown;
	error?: any;
}

export interface WebworkerReadyPacket {
	type: "webworker.rpc.ready";
}

export type WebworkerOutboundPacket = WebworkerResponsePacket | WebworkerReadyPacket;

export type WebworkerProcedure = (...args: any[]) => Promise<any>;

export function serve<T extends Record<string, WebworkerProcedure>>(handlers: T): T {
	const transformer = Transformer.defaultTransferable;

	addEventListener('message', async (e) => {
		const { id, method, args } = transformer.unTransform(e.data) as WebworkerInboundPacket;
		if (!(method in handlers)) {
			self.postMessage(transformer.transform({
				type: "webworker.rpc.response",
				id,
				error: new Error(`Method '${method}' not found`)
			} satisfies WebworkerResponsePacket));
			return;
		}
		try {
			const result = await handlers[method]!(...args);
			self.postMessage(transformer.transform({ type: "webworker.rpc.response", id, result } satisfies WebworkerResponsePacket));
		} catch (error) {
			self.postMessage(transformer.transform({ type: "webworker.rpc.response", id, error } satisfies WebworkerResponsePacket));
		}
	});

	postMessage({ type: "webworker.rpc.ready" } satisfies WebworkerReadyPacket);

	return handlers;
}


export function rpc<T extends Record<string, WebworkerProcedure>>(worker: Worker): T {
	const resolvers: { [key: number]: { resolve: (value: unknown) => void; reject: (reason?: any) => void } } = {};
	let messageId = 0;
	const transformer = Transformer.defaultTransferable;

	worker.addEventListener('message', event => {
		const message = event.data as WebworkerOutboundPacket;
		if (message.type !== "webworker.rpc.response") return;

		const { result, error } = transformer.unTransform(message) as WebworkerResponsePacket;
		const id = message.id;
		const resolver = resolvers[id];
		if (!resolver) {
			console.error('WebWorker: No resolver found for message ID', id);
			return;
		}
		if (error) {
			resolver.reject(error);
		} else {
			resolver.resolve(result);
		}
		delete resolvers[id];
	});

	return new Proxy({}, {
		get(_, method: string) {
			return function (...args: unknown[]) {
				return new Promise((resolve, reject) => {
					const id = messageId++;
					resolvers[id] = { resolve, reject };
					worker.postMessage(transformer.transform({ type: "webworker.rpc.call", id, method, args } satisfies WebworkerInboundPacket));
				});
			}
		}
	}) as T;
}

//export async function awaitReady(worker: Worker) {
//	await new Promise<void>((resolve) => {
//		worker.addEventListener('message', function onMessage(event) {
//			const message = event.data as WebworkerOutboundPacket;
//			if (message.type !== "webworker.rpc.ready") return;
//			worker.removeEventListener('message', onMessage);
//			resolve();
//		});
//	});
//}