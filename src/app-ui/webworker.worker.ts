import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gltfToTextDisplayAnimations, type TextDisplayAnimationOptions } from '../utilities/textDisplayAnimations';
import { textDisplaysToSummonCommands } from '../utilities/textDisplayCreationCommands';
import type { TextDisplayEntity } from '../utilities/textDisplays';
import { serve } from '../utilities/webworkerRpc';

export default serve({
	textDisplayCreationCommands: async (textDisplays: TextDisplayEntity[], options?: { maxCommandLength?: number }) => {
		return textDisplaysToSummonCommands(textDisplays, options);
	},
	textDisplayAnimationCommands: async (gltf: GLTF, options: TextDisplayAnimationOptions) => {
		return gltfToTextDisplayAnimations(gltf, options);
	}
});