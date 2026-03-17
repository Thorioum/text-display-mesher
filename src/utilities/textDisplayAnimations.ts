import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { TextDisplayEntity } from "./textDisplays";
import { meshToTextDisplays } from "./textDisplays";

export interface TextDisplayFrameDelta {
	index: number;
	transform: THREE.Matrix4;
	color?: THREE.Color;
}

export interface TextDisplayAnimationFrame {
	time: number;
	deltas: TextDisplayFrameDelta[];
}

export interface TextDisplayAnimation {
	name: string;
	duration: number;
	frames: TextDisplayAnimationFrame[];
}

export interface TextDisplayAnimationOptions {
	lightPosition: { x: number; y: number; z: number };
	minBrightness: number;
	maxBrightness: number;
	meshToTextDisplayOptions?: Parameters<typeof meshToTextDisplays>[2];
	matrixEpsilon?: number;
	includeFirstFrame?: boolean;
	restoreOriginalPose?: boolean;
}

const DEFAULT_OPTIONS = {
	matrixEpsilon: 1e-6,
	includeFirstFrame: true,
	restoreOriginalPose: true,
};

export function gltfToTextDisplayAnimations(
	gltf: GLTF,
	options: TextDisplayAnimationOptions,
) {

    console.log("a");
    const animations: TextDisplayAnimation[] = [];

	const {
        lightPosition,
        minBrightness,
        maxBrightness,
        meshToTextDisplayOptions,
        matrixEpsilon,
        includeFirstFrame,
        restoreOriginalPose,
    } = { ...DEFAULT_OPTIONS, ...options };

    const light = new THREE.Vector3(
        lightPosition.x,
        lightPosition.y,
        lightPosition.z,
    ).normalize();

    const shadowProvider = (
        color: THREE.Color,
        normal: THREE.Vector3,
        emission: number,
    ): THREE.Color => {
        const lightDot = normal.dot(light);
        const brightness = (lightDot + 1) / 2 * (maxBrightness - minBrightness) + minBrightness;
        const brightnessAfterEmission = Math.min(1, brightness + emission);

        return new THREE.Color(
            color.r * brightnessAfterEmission,
            color.g * brightnessAfterEmission,
            color.b * brightnessAfterEmission,
        );
    };

	const root = gltf.scene;
	const mixer = new THREE.AnimationMixer(root);

	const originalMatrices = restoreOriginalPose ? captureOriginalLocalMatrices(root) : null;

	try {
		gltf.animations.map(clip => {
			const action = mixer.clipAction(clip);
			action.enabled = true;
			action.play();

			const sampleTimes = getClipSampleTimes(clip);
			const frames: TextDisplayAnimationFrame[] = [];

			let previousDisplays: TextDisplayEntity[] | null = null;

			for (let frameIndex = 0; frameIndex < sampleTimes.length; frameIndex++) {
				const time = sampleTimes[frameIndex]!;
				sampleAnimationAtTime(mixer, action, clip, time);

				root.updateWorldMatrix(true, true);

				const currentDisplays = meshToTextDisplays(root, shadowProvider, meshToTextDisplayOptions);

				if (previousDisplays !== null && previousDisplays.length !== currentDisplays.length) {
					throw new Error(
						`Animation "${clip.name}" produced a different text display count between frames (${previousDisplays.length} -> ${currentDisplays.length}). ` +
						`Use deterministic merging or disable approximate merging for animation export.`
					);
				}

				const deltas =
					previousDisplays === null
						? (includeFirstFrame ? fullFrameDeltas(currentDisplays) : [])
						: diffTextDisplayFrames(previousDisplays, currentDisplays, matrixEpsilon);

				frames.push({
					time,
					deltas,
				});

				previousDisplays = currentDisplays;
			}

			action.stop();
			mixer.uncacheAction(clip, root);

			animations.push({
				name: clip.name || "Unnamed Animation",
				duration: clip.duration,
				frames,
			});
		});
        return animations;
	} finally {
		if (originalMatrices) {
			restoreLocalMatrices(root, originalMatrices);
			root.updateWorldMatrix(true, true);
		}
        return animations;
	}
}

function getClipSampleTimes(clip: THREE.AnimationClip): number[] {
	const times = new Set<number>();

	times.add(0);
	times.add(clip.duration);

	for (const track of clip.tracks) {
		for (const time of track.times) {
			times.add(time);
		}
	}

	return [...times].sort((a, b) => a - b);
}

function sampleAnimationAtTime(
	mixer: THREE.AnimationMixer,
	action: THREE.AnimationAction,
	clip: THREE.AnimationClip,
	time: number,
) {
	action.reset();
	action.play();
	mixer.setTime(time);

	// force evaluation of animated transforms
	action.paused = true;
}

function fullFrameDeltas(displays: TextDisplayEntity[]): TextDisplayFrameDelta[] {
	return displays.map((display, index) => ({
		index,
		transform: display.transform.clone(),
		color: display.color.clone(),
	}));
}

function diffTextDisplayFrames(
	previous: TextDisplayEntity[],
	current: TextDisplayEntity[],
	matrixEpsilon: number,
	colorEpsilon = 1 / 255,
): TextDisplayFrameDelta[] {
	const deltas: TextDisplayFrameDelta[] = [];

	for (let i = 0; i < current.length; i++) {
		const prev = previous[i]!;
		const curr = current[i]!;

		const transformChanged = !matrixApproximatelyEquals(prev.transform, curr.transform, matrixEpsilon);
		const colorChanged = !colorApproximatelyEquals(prev.color, curr.color, colorEpsilon);

		if (transformChanged || colorChanged) {
			deltas.push({
				index: i,
				transform: curr.transform.clone(),
				color: colorChanged ? curr.color.clone() : undefined,
			});
		}
	}

	return deltas;
}
function colorApproximatelyEquals(a: THREE.Color, b: THREE.Color, epsilon: number): boolean {
	return (
		Math.abs(a.r - b.r) <= epsilon &&
		Math.abs(a.g - b.g) <= epsilon &&
		Math.abs(a.b - b.b) <= epsilon
	);
}
function matrixApproximatelyEquals(a: THREE.Matrix4, b: THREE.Matrix4, epsilon: number): boolean {
	const ae = a.elements;
	const be = b.elements;

	for (let i = 0; i < 16; i++) {
		if (Math.abs(ae[i]! - be[i]!) > epsilon) {
			return false;
		}
	}

	return true;
}

function captureOriginalLocalMatrices(root: THREE.Object3D): Map<THREE.Object3D, THREE.Matrix4> {
	const matrices = new Map<THREE.Object3D, THREE.Matrix4>();

	root.traverse(object => {
		matrices.set(object, object.matrix.clone());
	});

	return matrices;
}

function restoreLocalMatrices(root: THREE.Object3D, matrices: Map<THREE.Object3D, THREE.Matrix4>) {
	root.traverse(object => {
		const matrix = matrices.get(object);
		if (!matrix) return;

		object.matrix.copy(matrix);
		object.matrix.decompose(object.position, object.quaternion, object.scale);
	});
}