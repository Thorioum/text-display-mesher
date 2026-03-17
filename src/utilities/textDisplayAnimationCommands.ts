import * as THREE from "three";
import JSZip from "jszip";
import type {
	TextDisplayAnimation,
	TextDisplayAnimationFrame,
	TextDisplayFrameDelta,
} from "./textDisplayAnimations";

export interface TextDisplayAnimationCommandFrame {
	time: number;
	commands: string[];
}

export interface TextDisplayAnimationCommands {
	name: string;
	duration: number;
	frames: TextDisplayAnimationCommandFrame[];
}

export interface TextDisplayAnimationCommandOptions {
	includeColor?: boolean;
	selectorForIndex?: (index: number) => string;
}

const DEFAULT_OPTIONS: Required<TextDisplayAnimationCommandOptions> = {
	includeColor: true,
	selectorForIndex: (index: number) =>
		`@e[type=minecraft:text_display,tag=${index},limit=1]`,
};

export function textDisplayAnimationsToCommands(
	animations: TextDisplayAnimation[],
	options: TextDisplayAnimationCommandOptions = {},
): TextDisplayAnimationCommands[] {
	const {
		includeColor,
		selectorForIndex,
	} = { ...DEFAULT_OPTIONS, ...options };

	return animations.map((animation) => ({
		name: animation.name,
		duration: animation.duration,
		frames: animation.frames.map((frame) =>
			textDisplayAnimationFrameToCommands(frame, {
				includeColor,
				selectorForIndex,
			}),
		),
	}));
}

export function textDisplayAnimationFrameToCommands(
	frame: TextDisplayAnimationFrame,
	options: TextDisplayAnimationCommandOptions = {},
): TextDisplayAnimationCommandFrame {
	const {
		includeColor,
		selectorForIndex,
	} = { ...DEFAULT_OPTIONS, ...options };

	return {
		time: frame.time,
		commands: frame.deltas.map((delta) =>
			textDisplayFrameDeltaToCommand(delta, {
				includeColor,
				selectorForIndex,
			}),
		),
	};
}

export function textDisplayFrameDeltaToCommand(
	delta: TextDisplayFrameDelta,
	options: TextDisplayAnimationCommandOptions = {},
): string {
	const {
		includeColor,
		selectorForIndex,
	} = { ...DEFAULT_OPTIONS, ...options };

	const selector = selectorForIndex(delta.index);

	const nbt: Record<string, string> = {
		transformation: mat4NBT(delta.transform),
	};

	if (includeColor && delta.color) {
		nbt.background = colorToSignedInt(delta.color, 1).toString();
	}

	return `data merge entity ${selector} ${nbtToString(nbt)}`;
}

function nbtToString(components: Record<string, string>): string {
	return `{${Object.entries(components)
		.map(([key, value]) => `${key}:${value}`)
		.join(",")}}`;
}

function colorToSignedInt(color: THREE.Color, alpha: number = 1): number {
	const r = Math.round(color.r * 255);
	const g = Math.round(color.g * 255);
	const b = Math.round(color.b * 255);
	const a = Math.round(alpha * 255);

	const unsignedInt = (a << 24) | (r << 16) | (g << 8) | b;
	return unsignedInt;
}

function mat4NBT(mat: THREE.Matrix4): string {
	return "[" +
		floatNBT(mat.elements[0]!) + "," +
		floatNBT(mat.elements[4]!) + "," +
		floatNBT(mat.elements[8]!) + "," +
		floatNBT(mat.elements[12]!) + "," +
		floatNBT(mat.elements[1]!) + "," +
		floatNBT(mat.elements[5]!) + "," +
		floatNBT(mat.elements[9]!) + "," +
		floatNBT(mat.elements[13]!) + "," +
		floatNBT(mat.elements[2]!) + "," +
		floatNBT(mat.elements[6]!) + "," +
		floatNBT(mat.elements[10]!) + "," +
		floatNBT(mat.elements[14]!) + "," +
		floatNBT(mat.elements[3]!) + "," +
		floatNBT(mat.elements[7]!) + "," +
		floatNBT(mat.elements[11]!) + "," +
		floatNBT(mat.elements[15]!) + "]";
}

function floatNBT(value: number): string {
	const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
	return `${rounded}f`;
}