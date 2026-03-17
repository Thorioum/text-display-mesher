import JSZip from "jszip";
import type { TextDisplayAnimationCommands } from "./textDisplayAnimationCommands";

export interface StaticDatapackOptions {
	name: string;
	summonCommands: string[];
}

export interface AnimatedDatapackOptions {
	name: string;
	summonCommands: string[];
	animations: TextDisplayAnimationCommands[];
}

const PACK_MCMETA = `{"pack":{"description":["thorioum","https://heledron.com/tools/text-display-mesher/"],"pack_format":1}}`;

export async function staticDatapackToZip({
	name,
	summonCommands,
}: StaticDatapackOptions): Promise<Blob> {
	const zip = new JSZip();
	const safeName = sanitizeName(name);

	zip.file("pack.mcmeta", PACK_MCMETA);

	const functionsFolder = zip.folder(`data/${safeName}/function`);
	if (!functionsFolder) {
		throw new Error("Failed to create datapack functions folder.");
	}

	functionsFolder.file("summon.mcfunction", summonCommands.join("\n"));

	return zip.generateAsync({ type: "blob" });
}

export async function animatedDatapackToZip({
	name,
	summonCommands,
	animations,
}: AnimatedDatapackOptions): Promise<Blob> {
	const zip = new JSZip();
	const safeName = sanitizeName(name);

	zip.file("pack.mcmeta", PACK_MCMETA);

	const functionsFolder = zip.folder(`data/${safeName}/function`);
	if (!functionsFolder) {
		throw new Error("Failed to create datapack functions folder.");
	}

	functionsFolder.file("summon.mcfunction", summonCommands.join("\n"));

	for (const animation of animations) {
		const safeAnimationName = sanitizeName(animation.name);
        if(animation.frames.length === 0) continue;

		const startLines: string[] = [];

		startLines.push(`function ${safeName}:${safeAnimationName}/0`);


		functionsFolder.file(
			`${safeAnimationName}_start.mcfunction`,
			startLines.join("\n")
		);

		const animationFolder = functionsFolder.folder(safeAnimationName);
		if (!animationFolder) {
			throw new Error(`Failed to create folder for animation "${animation.name}".`);
		}

		for (let frameIndex = 0; frameIndex < animation.frames.length; frameIndex++) {
			const frame = animation.frames[frameIndex]!;
            if(frameIndex !== animation.frames.length - 1) {
                frame.commands.push(`schedule function ${safeName}:${safeAnimationName}/${frameIndex + 1} 20t`);
            }
			animationFolder.file(`${frameIndex}.mcfunction`, frame.commands.join("\n"));
		}
	}

	return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();

	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 1000);
}

export function sanitizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/\.[^.]+$/, "")
		.replace(/[^a-z0-9_\-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "") || "model";
}