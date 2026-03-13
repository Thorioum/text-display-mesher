import { debounce } from "./misc";

export function debouncedState<T>({delay, deps, value} :{ delay: number, deps: ()=>void, value: () => T }) {
	let state = $state(value());
	
	const debouncedUpdate = debounce(delay, () => {
		state = value()
	});

	$effect(() => {
		deps();
		debouncedUpdate();
	});

	return {
		get value() {
			return state;
		},

		invalidate() {
			debouncedUpdate();
		}
	}
}

export function asyncState<T>(asyncFn: () => Promise<T>, initialValue: T) {
	let state = $state(initialValue);
	let loading = $state(false);
	
	async function load() {
		loading = true;
		try {
			state = await asyncFn();
		} finally {
			loading = false;
		}
	}

	effect_rooted(() => {
		load();
	});

	return {
		get value() {
			return state;
		},
		get isLoading() {
			return loading;
		},
		refresh() {
			load();
		}
	}
}

export function effect_rooted(effectFn: () => void) {
	if ($effect.tracking()) {
		$effect(effectFn);
	} else {
		$effect.root(()=>{
			$effect(effectFn);
		})
	}
}