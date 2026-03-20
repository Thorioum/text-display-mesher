<script lang="ts">
import NumberField from '../ui-components/NumberField.svelte';
import * as THREE from 'three';
import MeshViewer from './MeshViewer.svelte';
import { createShadowProvider, meshToTextDisplays } from '../utilities/textDisplays';
import { textDisplayTrianglesToMesh } from '../utilities/textDisplayRendering';
import Button from '../ui-components/Button.svelte';
import { asyncState, debouncedState } from '../utilities/svelteUtilities.svelte';
import { fa5_solid_home, fa5_solid_info, fa5_brands_github } from 'fontawesome-svgs';
import CircleButton from '../ui-components/CircleButton.svelte';
import { githubRepositoryLink, homeLink } from './links';
import ModelSelector, { mountainrayMesh, phoenixGLTF, phoenixMesh } from './ModelSelector.svelte';
import Worker from './webworker.worker.js?worker';
import { rpc } from '../utilities/webworkerRpc';
import { untrack } from 'svelte';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
    import { gltfToTextDisplayAnimations, type TextDisplayAnimation } from '../utilities/textDisplayAnimations';
    import { textDisplayAnimationsToCommands } from '../utilities/textDisplayAnimationCommands';
    import { animatedDatapackToZip, downloadBlob, sanitizeName, staticDatapackToZip } from '../utilities/datapackCreator';

let meshView: "original" | "text" = $state("text");

// Inputs
let mesh: THREE.Object3D = $state.raw(phoenixMesh);
let gltf: GLTF | null = $state.raw(phoenixGLTF);
let scale = $state({ x: 1, y: 1, z: 1 });
let translate = $state({ x: 0, y: 0, z: 0 });
let lightPosition = $state({ x: 1, y: 1, z: 1 })
let minBrightness = $state(0.4);
let maxBrightness = $state(1.0);
let playAnimation = $state(false);
let selectedAnimationIndex = $state(0);

const worker = rpc<typeof import('./webworker.worker').default>(new Worker());

const modelName = $derived.by(() => {
	if (gltf?.scene?.name) return sanitizeName(gltf.scene.name);
	if (mesh?.name) return sanitizeName(mesh.name);
	return "model";
});

const transformedMesh = $derived.by(() => {
	const transformed = mesh.clone()
	transformed.applyMatrix4(
		new THREE.Matrix4()
			.makeScale(scale.x, scale.y, scale.z)
			.setPosition(translate.x, translate.y, translate.z)
	);
	return transformed;
});

let materialUpdateCounter = $state(0);
const textDisplays = $derived.by(()=> {
	materialUpdateCounter;
	return meshToTextDisplays(transformedMesh, createShadowProvider({
		light: new THREE.Vector3(lightPosition.x, lightPosition.y, lightPosition.z).normalize(),
		minBrightness,
		maxBrightness,
	}))
});



const summonCommandsAsync = asyncState(() => worker.textDisplayCreationCommands(textDisplays), {
	commands: [],
	batches: [],
});

const capturedGltf = $derived.by(() => {
	return gltf
});

const animationSummaries = $derived.by(() => {
	if (!gltf) return [];

	return gltf.animations.map((animation) => ({
		name: animation.name || 'Unnamed Animation',
		duration: animation.duration,
	}));
});

let parsedAnimations: TextDisplayAnimation[] | null = $state(null);
let animationParseInProgress = $state(false);
let animationParseError: string | null = $state(null);

$effect(() => {
	gltf;
	mesh;
	scale.x; scale.y; scale.z;
	translate.x; translate.y; translate.z;
	lightPosition.x; lightPosition.y; lightPosition.z;
	minBrightness; maxBrightness;
	materialUpdateCounter;

	parsedAnimations = null;
	animationParseError = null;
	playAnimation = false;
	selectedAnimationIndex = 0;
});
async function ensureAnimationsParsed() {
	if (!gltf || parsedAnimations || animationParseInProgress) return;

	animationParseInProgress = true;
	animationParseError = null;

	try {
		parsedAnimations = await Promise.resolve(
			gltfToTextDisplayAnimations(gltf,{
				lightPosition: {
					x: lightPosition.x,
					y: lightPosition.y,
					z: lightPosition.z,
				},
				minBrightness,
				maxBrightness,
			})
		);
	} catch (error) {
		console.error('Failed to parse animations:', error);
		animationParseError = error instanceof Error ? error.message : String(error);
	} finally {
		animationParseInProgress = false;
	}
}
const animationCommands = $derived.by(() => {
	if (!parsedAnimations) return [];
	return textDisplayAnimationsToCommands(parsedAnimations);
});

const summonCommands = $derived(summonCommandsAsync.value);

function changeButtonText(event: MouseEvent, text: string) {
	const button = event.currentTarget as HTMLButtonElement;
	
	const originalText = button.textContent;
	if (originalText === text) return;

	button.textContent = text;
	setTimeout(() => button.textContent = originalText, 2000);
}

async function downloadStaticDatapackZip() {
	try {
		const zipBlob = await staticDatapackToZip({
			name: modelName,
			summonCommands: summonCommands.commands,
		});

		downloadBlob(zipBlob, `${modelName}.zip`);
	} catch (error) {
		console.error("Failed to download static datapack zip:", error);
		animationParseError = error instanceof Error ? error.message : String(error);
	}
}
async function downloadAnimatedDatapackZip() {
	try {
		if (!parsedAnimations) {
			await ensureAnimationsParsed();
		}

		if (!parsedAnimations) {
			throw new Error("Animations were not parsed.");
		}

		const selectedParsedAnimation = parsedAnimations[selectedAnimationIndex];
		if (!selectedParsedAnimation) {
			throw new Error("Selected animation was not found.");
		}

		const animationCommands = textDisplayAnimationsToCommands([
			selectedParsedAnimation,
		]);

		const zipBlob = await animatedDatapackToZip({
			name: modelName,
			summonCommands: summonCommands.commands,
			animations: animationCommands,
		});

		downloadBlob(zipBlob, `${modelName}.zip`);
	} catch (error) {
		console.error("Failed to download animated datapack zip:", error);
		animationParseError = error instanceof Error ? error.message : String(error);
	}
}
console.group("For debugging, use these variables.");
console.log("mesh");
console.log("transformedMesh");
console.log("textDisplays");
console.log("summonCommands");
console.groupEnd();
$effect(()=>{
	Object.assign(globalThis, {
		mesh,
		transformedMesh,
		textDisplays,
		summonCommands,
	})
});

const cameraMaxDistance = $derived.by(() => {
	const boundingBox = new THREE.Box3().setFromObject(transformedMesh);
	const modelSize = boundingBox.getSize(new THREE.Vector3());
	const maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z) || 0;
	return Math.max(maxDimension * 1.1, 10);
});
</script>

<div class="
	md:grid md:grid-cols-[25em_1fr]
	flex flex-col-reverse *:flex-1
">
	<!-- Sidebar -->
	<div class="bg-surfaceContainer text-onSurfaceContainer p-4 overflow-y-auto">
		<ModelSelector
			bind:mesh={mesh}
			bind:gltf={gltf}
			onUpdateMaterial={() => untrack(()=>materialUpdateCounter++)}
		/>

		<hr class="my-4">
	
		{#if animationSummaries.length > 0}
			<div class="mt-3 flex items-center gap-2 flex-wrap">
				<select bind:value={selectedAnimationIndex} class="border rounded px-2 py-1">
					{#each animationSummaries as animation, index}
						<option value={index}>{animation.name}</option>
					{/each}
				</select>

				<Button
					variant={playAnimation ? 'filled' : 'outlined'}
					onPress={async () => {
						if (playAnimation) {
							playAnimation = false;
							return;
						}

						await ensureAnimationsParsed();

						if (parsedAnimations && parsedAnimations[selectedAnimationIndex]) {
							playAnimation = true;
						}
					}}
				>
					{#if animationParseInProgress}
						Parsing...
					{:else if playAnimation}
						Pause Animation
					{:else}
						Play Animation
					{/if}
				</Button>
			</div>
		{/if}


		<div class="mt-2 flex gap-2 flex-wrap">
			{#if animationSummaries.length > 0}

				<Button
					variant="outlined"
					onPress={downloadAnimatedDatapackZip}
				>
					Download Animated
				</Button>
			{/if}

				<Button
					variant="outlined"
					onPress={downloadStaticDatapackZip}
				>
					Download Static
				</Button>

		</div>

		<hr class="my-4">
		
		<h3 class="text-lg font-semibold">Transform</h3>
	
		<div class="mb-3">
			<h4 class="font-medium mb-2">Scale</h4>
			<div class="grid grid-cols-3 gap-4">
				<NumberField 
					label="X"
					bind:value={scale.x}
				/>
				<NumberField 
					label="Y"
					bind:value={scale.y}
				/>
				<NumberField 
					label="Z"
					bind:value={scale.z}
				/>
			</div>
		</div>

		<div class="mb-3">
			<h4 class="font-medium mb-2">Translate</h4>
			<div class="grid grid-cols-3 gap-4">
				<NumberField 
					label="X"
					bind:value={translate.x}
				/>
				<NumberField 
					label="Y"
					bind:value={translate.y}
				/>
				<NumberField 
					label="Z"
					bind:value={translate.z}
				/>
			</div>
		</div>

		<hr class="my-4">
		
		<h3 class="text-lg font-semibold">Lighting</h3>
	
		<div class="mb-3">
			<h4 class="font-medium mb-2">Position</h4>
			<div class="grid grid-cols-3 gap-4">
				<NumberField 
					label="X"
					bind:value={lightPosition.x}
				/>
				<NumberField 
					label="Y"
					bind:value={lightPosition.y}
				/>
				<NumberField 
					label="Z"
					bind:value={lightPosition.z}
				/>
			</div>
		</div>
		
		<div class="grid grid-cols-2 gap-4">
			<NumberField
				label="Min Brightness"
				value={minBrightness}
				onInput={e => minBrightness = e.value}
				hint="Range: 0.0-1.0"
			/>
			
			<NumberField
				label="Max Brightness"
				value={maxBrightness}
				onInput={e => maxBrightness = e.value}
				hint="Range: 0.0-1.0"
			/>
		</div>

		<hr class="my-4">

		<h2 class="text-xl font-bold mb-4">Output</h2>
		
		<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-3">
			<h3 class="font-bold text-lg">⚠️ Warning</h3>
			<p>Adding this many entities to your world can cause severe performance issues or even corrupt your save file. <strong>Always backup your world before using these commands.</strong></p>
		</div>
		
		<div class="bg-cyan-100 border border-cyan-400 text-cyan-700 px-4 py-3 rounded mb-3">
			<p>Commands are split into batches due to Minecraft's command length limits.</p>
		</div>
		
		<div>Text Displays: {textDisplays.length}</div>
		<div>Animations: {animationSummaries.length}</div>
		<div>
			Commands:
			{@render numberLoadingIndicator(summonCommands.commands.length, summonCommandsAsync.isLoading)}
		</div>

		<br>

		<div>Command Lengths:</div>
		{@render range(summonCommandsAsync.isLoading, summonCommands.commands.map(cmd => cmd.length))}

		<br>

		<div>Entities Per Command:</div>
		{@render range(summonCommandsAsync.isLoading, summonCommands.batches.map(batch => batch.length))}
		<br>

		{#snippet range(isLoading: boolean, items: number[])}
			<div>
				<span class="opacity-40">Min</span>
				{@render numberLoadingIndicator(Math.min(...items), isLoading)}
				<span class="ml-3 opacity-40">Max</span>
				{@render numberLoadingIndicator(Math.max(...items), isLoading)}
				<span class="ml-3 opacity-40">Avg</span>
				{@render numberLoadingIndicator(Math.round(items.reduce((acc, item) => acc + item, 0) / items.length), isLoading)}
			</div>
		{/snippet}

		{#snippet numberLoadingIndicator(current: number, isLoading: boolean)}
			{#if !isLoading}
				{current}
			{:else}
				<span class="inline-grid items-center h-lh align-bottom">
					<div class="bg-current/20 animate-pulse h-4 rounded">
						<span class="invisible">{current}</span>
					</div>
				</span>
			{/if}
		{/snippet}

		<label class="flex justify-between items-center mb-2" for="summon-commands">
			<div class="font-medium">
				Commands
			</div>
			
			<div class="flex gap-2">
				<Button 
					variant={'outlined'} 
					className="py-1! text-sm"
					onPress={(event) => {
						const commandText = summonCommands.commands.join('\n');
						navigator.clipboard.writeText(commandText);
						changeButtonText(event, 'Copied!');
					}}
				>
					Copy
				</Button>
			</div>
		</label>
		
		<textarea 
			id="summon-commands"
			value={summonCommands.commands.join('\n')}
			class="
				w-full p-3 font-mono whitespace-pre resize-none
				border-[.08rem] border-containerBorder rounded-md bg-transparent
				focus-visible:outline-[3px] outline-primary-500 outline-offset-[-3px]
			"
			rows={summonCommands.commands.length + 1}
			readonly
			onfocus={(e) => (e.target as HTMLTextAreaElement).select()}
		></textarea>
	</div>
	
	<!-- Model Viewer -->
	<div class="relative">
		<MeshViewer
			originalModel={transformedMesh}
			textDisplayModel={textDisplayTrianglesToMesh(textDisplays)}
			textDisplays={textDisplays}
			animations={parsedAnimations ?? []}
			selectedAnimationIndex={selectedAnimationIndex}
			playAnimation={meshView === 'text' && playAnimation}
			maxDistance={cameraMaxDistance}
			lightPosition={new THREE.Vector3(lightPosition.x, lightPosition.y, lightPosition.z).normalize()}
		/>

		<div class="absolute top-3 right-3 flex items-center">
			<Button 
				variant={meshView === 'original' ? 'filled' : 'outlined'}
				onPress={() => meshView = 'original'}
				className="mr-2"
			>
				Original
			</Button>
			<Button 
				variant={meshView === 'text' ? 'filled' : 'outlined'}
				onPress={() => meshView = 'text'}
			>
				Text Display
			</Button>
		</div>

		<div class="absolute bottom-3 right-3 flex flex-col gap-3">
			<a href="{githubRepositoryLink}" target="_blank" tabindex="-1">
				<CircleButton 
					onPress={() => {}}
					label="GitHub Repository"
				>
					{@html fa5_brands_github}
				</CircleButton>
			</a>

			<a href="{homeLink}" target="_blank" tabindex="-1">
				<CircleButton 
					onPress={() => {}}
					label="Home"
				>
					{@html fa5_solid_home}
				</CircleButton>
			</a>

			<a href="#info" tabindex="-1">
				<CircleButton 
					onPress={() => {}}
					label="Show Information"
				>
					{@html fa5_solid_info}
				</CircleButton>
			</a>
		</div>
	</div>
</div>
