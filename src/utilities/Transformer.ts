export interface TransformerPlugin<T, O> {
	id: string;
	isInstance(value: unknown): value is T;
	transform(value: T): O;
	unTransform(value: O): T;
}

export interface TransformerWalkPlugin {
	walk(value: unknown, recurse: (value: unknown) => unknown): unknown | undefined;
}

export class Transformer {
	/**
	 * Creates [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).
	 * 
	 * i.e. objects that can be used with `postMessage` and `structuredClone`.
	 */
	static readonly defaultTransferable = new Transformer();
	
	/**
	 * Creates JSON-serializable objects.
	 */
	static readonly defaultJson = new Transformer([this.defaultTransferable]);

	readonly #plugins: TransformerPlugin<any, any>[] = [];
	readonly #walkPlugins: TransformerWalkPlugin[] = [];
	typeKey = '__type';

	registerPlugin<T, O>(plugin: TransformerPlugin<T, O>) {
		this.#plugins.unshift(plugin);
	}

	registerWalkPlugin(plugin: TransformerWalkPlugin) {
		this.#walkPlugins.push(plugin);
	}

	transform(value: unknown): unknown {
		const allPlugins = this.inherit.map(p => p.#plugins).flat();
		const allWalkPlugins = this.inherit.map(p => p.#walkPlugins).flat();
		return this.#transform(value, allPlugins, allWalkPlugins);
	}


	unTransform(value: unknown): unknown {
		const allPlugins = new Map(this.inherit.map(p => p.#plugins).flat().map(p => [p.id, p]));
		const allWalkPlugins = this.inherit.map(p => p.#walkPlugins).flat();
		return this.#unTransform(value, allPlugins, allWalkPlugins);
	}

	constructor(readonly inherit: Transformer[] = []) {
		inherit.push(this);
	}

	#transform(
		value: unknown,
		plugins: TransformerPlugin<any, any>[],
		walkPlugins: TransformerWalkPlugin[],
		includeSelf = true
	): unknown {
		if (includeSelf) for (const plugin of plugins) {
			if (!plugin.isInstance(value)) continue;
			
			return {
				[this.typeKey]: plugin.id,
				value: this.#transform(plugin.transform(value), plugins, walkPlugins, false)
			};
		}

		for (const plugin of walkPlugins) {
			const walked = plugin.walk(value, (val) => this.#transform(val, plugins, walkPlugins));
			if (walked !== undefined) {
				return walked;
			}
		}

		return value;
	}

	#unTransform(value: unknown, plugins: Map<string, TransformerPlugin<any, any>>, walkPlugins: TransformerWalkPlugin[]): unknown {
		if (value && typeof value === 'object' && this.typeKey in value) {
			const typeId = (value as Record<string, unknown>)[this.typeKey] as string;
			const plugin = plugins.get(typeId);
			if (plugin) {
				const transformed = (value as { value: unknown }).value;
				return plugin.unTransform(this.#unTransform(transformed, plugins, walkPlugins));
			}
		}
		
		for (const plugin of walkPlugins) {
			const walked = plugin.walk(value, (val) => this.#unTransform(val, plugins, walkPlugins));
			if (walked !== undefined) {
				return walked;
			}
		}

		return value;
	}
}

Transformer.defaultTransferable.registerWalkPlugin({
	walk(value: unknown, recurse: (value: unknown) => unknown): unknown | undefined {
		// array
		if (Array.isArray(value)) {
			return value.map(item => recurse(item));
		}
		
		// object
		if (value && typeof value === 'object' && value.constructor === Object) {
			const result: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(value)) {
				result[key] = recurse(val);
			}
			return result;
		}

		// map
		if (value instanceof Map) {
			return new Map([...value.entries()].map(([key, val]) => [key, recurse(val)]));
		}

		// set
		if (value instanceof Set) {
			return new Set([...value.values()].map(val => recurse(val)));
		}

		return undefined;
	}
});


Transformer.defaultJson.registerPlugin({
	id: 'Date',
	isInstance(value: unknown) {
		return value instanceof Date;
	},
	transform(value: Date): string {
		return value.toISOString();
	},
	unTransform(value: string): Date {
		return new Date(value);
	}
});

Transformer.defaultJson.registerPlugin({
	id: 'Map',
	isInstance(value: unknown) {
		return value instanceof Map;
	},
	transform(value) {
		return [...value.entries()];
	},
	unTransform(value) {
		return new Map(value);
	}
});

Transformer.defaultJson.registerPlugin({
	id: 'Set',
	isInstance(value: unknown) {
		return value instanceof Set;
	},
	transform(value) {
		return [...value.values()];
	},
	unTransform(value) {
		return new Set(value);
	}
});


Transformer.defaultJson.registerPlugin({
	id: 'undefined',
	isInstance(value: unknown) {
		return value === undefined;
	},
	transform(value) {
		return null;
	},
	unTransform(value) {
		return undefined;
	}
});