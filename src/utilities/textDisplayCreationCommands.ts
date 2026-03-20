import * as THREE from "three";
import type { TextDisplayEntity } from "./textDisplays";
import { benchmark } from "./misc";


export function textDisplaysToSummonCommands(textDisplays: TextDisplayEntity[], extraTags: string[] =[], {
	maxCommandLength = 30000,
} = {}) {
	const commands: string[] = [];
	const containerPosition = "~ ~ ~";

	const summonCommand = (batch: TextDisplayEntity[], startIndex: number) => {
		if (batch.length === 0) return "";

		const containerNBT = textDisplayNBT(batch[0]!, [extraTags,startIndex.toString()].flat());

		const passengersNBT = batch
			.slice(1)
			.map((entity, localIndex) =>
				nbtToString(textDisplayNBT(entity, [extraTags,(startIndex + localIndex + 1).toString()].flat()))
			)
			.join(",");

		delete containerNBT.id;
		if (passengersNBT.length) containerNBT.Passengers = `[${passengersNBT}]`;

		return `summon text_display ${containerPosition} ${nbtToString(containerNBT)}`;
	};

	const batchFits = (command: string, _batch: TextDisplayEntity[]) => {
		return command.length <= maxCommandLength;
	};

	let added = 0;
	let expectedBatchSize = maxCommandLength / 100;

	const batches: TextDisplayEntity[][] = [];

	while (added < textDisplays.length) {
		const currentBatch = textDisplays.slice(
			added,
			Math.min(added + expectedBatchSize, textDisplays.length)
		);
		added += currentBatch.length;

		const batchStartIndex = added - currentBatch.length;

		let currentCommand = "";

		while (
			batchFits(currentCommand = summonCommand(currentBatch, batchStartIndex), currentBatch) &&
			added < textDisplays.length
		) {
			currentBatch.push(textDisplays[added]!);
			added++;
		}

		while (
			!batchFits(currentCommand = summonCommand(currentBatch, batchStartIndex), currentBatch) &&
			currentBatch.length > 0
		) {
			currentBatch.pop();
			added--;
		}

		expectedBatchSize = currentBatch.length;
		commands.push(currentCommand);
		batches.push(currentBatch);
	}

	return { commands, batches };
}

function nbtToString(components: Record<string, string>): string {
	return `{${Object.entries(components).map(([key, value]) => `${key}:${value}`).join(",")}}`;
}

function textDisplayNBT(textDisplay: TextDisplayEntity, tags: string[]) {

	let tagsStr = "[";
	for(let i = 0; i < tags.length; i++) {
		tagsStr += "\"" + tags[i] + "\"";
		if(i !== tags.length - 1) {
			tagsStr += ",";
		}
	}
	tagsStr += "]";

	const components: Record<string, string> = {
		id: `"text_display"`,
		text: `' '`,
		transformation: mat4NBT(textDisplay.transform),
		background: colorToSignedInt(textDisplay.color, 1).toString(),
		Tags: tagsStr
	}

	if (textDisplay.brightness.sky !== 15 || textDisplay.brightness.block !== 0) {
		components.brightness = `{sky:${textDisplay.brightness.sky},block:${textDisplay.brightness.block}}`;
	}


	return components;
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
	floatNBT(mat.elements[0]) + "," +
	floatNBT(mat.elements[4]) + "," +
	floatNBT(mat.elements[8]) + "," +
	floatNBT(mat.elements[12]) + "," +
	floatNBT(mat.elements[1]) + "," +
	floatNBT(mat.elements[5]) + "," +
	floatNBT(mat.elements[9]) + "," +
	floatNBT(mat.elements[13]) + "," +
	floatNBT(mat.elements[2]) + "," +
	floatNBT(mat.elements[6]) + "," +
	floatNBT(mat.elements[10]) + "," +
	floatNBT(mat.elements[14]) + "," +
	floatNBT(mat.elements[3]) + "," +
	floatNBT(mat.elements[7]) + "," +
	floatNBT(mat.elements[11]) + "," +
	floatNBT(mat.elements[15]) + "]";

}

function floatNBT(value: number): string {
	return `${parseFloat(value.toFixed(7))}f`;
}