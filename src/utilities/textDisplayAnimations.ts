import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { TextDisplayEntity } from "./textDisplays";
import { meshToTextDisplays } from "./textDisplays";

export interface TextDisplayAnimationFrame {
	time: number;
	textDisplays: TextDisplayEntity[];
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
	restoreOriginalPose?: boolean;
}

const DEFAULT_OPTIONS = {
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

			let expectedDisplayCount: number | null = null;

			for (let frameIndex = 0; frameIndex < sampleTimes.length; frameIndex++) {
				const time = sampleTimes[frameIndex]!;
				sampleAnimationAtTime(mixer, action, clip, time);

				root.updateWorldMatrix(true, true);

				const currentDisplays = meshToTextDisplays(root, shadowProvider, meshToTextDisplayOptions);

				if (expectedDisplayCount === null) {
					expectedDisplayCount = currentDisplays.length;
				} else if (expectedDisplayCount !== currentDisplays.length) {
					throw new Error(
						`Animation "${clip.name}" produced a different text display count between frames (${expectedDisplayCount} -> ${currentDisplays.length}). ` +
						`Use deterministic merging or disable approximate merging for animation export.`
					);
				}

				frames.push({
					time,
					textDisplays: currentDisplays.map(display => ({
						...display,
						color: display.color.clone(),
						transform: display.transform.clone(),
						brightness: { ...display.brightness },
					})),
				});
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