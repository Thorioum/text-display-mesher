import { textDisplaysToSummonCommands } from '../utilities/textDisplayCommands';
import type { TextDisplayEntity } from '../utilities/textDisplays';
import { serve } from '../utilities/webworkerRpc';

export default serve({
	textDisplayCommands: async (textDisplays: TextDisplayEntity[], options?: { maxCommandLength?: number }) => {
		return textDisplaysToSummonCommands(textDisplays, options);
	}
});