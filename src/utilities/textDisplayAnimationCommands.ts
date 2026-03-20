import * as THREE from "three";
import JSZip from "jszip";
import type {
	TextDisplayAnimation,
} from "./textDisplayAnimations";
import { textDisplaysToSummonCommands } from "./textDisplayCreationCommands";

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
): TextDisplayAnimationCommands[] {
	return animations.map(animation => {
		const animationTag = sanitizeTag(animation.name);

		return {
			name: animation.name,
			duration: animation.duration,
			frames: animation.frames.map((frame, frameIndex) => {
				const frameTag = `frame_${frameIndex}`;
				const extraTags = [animationTag, frameTag];

				const summon = textDisplaysToSummonCommands(frame.textDisplays, extraTags).commands;

				const commands = [...summon];

				if (frameIndex > 0) {
					const previousFrameTag = `frame_${frameIndex - 1}`;
					commands.push(
						`kill @e[type=minecraft:text_display,tag=${previousFrameTag}]`
					);
				}

				return {
					time: frame.time,
					commands,
				};
			}),
		};
	});
}

function sanitizeTag(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9_\-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "") || "animation";
}