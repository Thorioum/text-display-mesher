import * as THREE from "three";
import { unitSquare, unitTriangle, type TextDisplayEntity } from "./textDisplays";

const unitTriangleVertices = [
	new THREE.Vector3(0, 0, 0),
	new THREE.Vector3(1, 0, 0),
	new THREE.Vector3(0, 1, 0),
].map(vertex =>
	vertex.applyMatrix4(unitTriangle[0]!.clone().invert())
);

const unitSquareVertices = [
	new THREE.Vector3(0, 0, 0),
	new THREE.Vector3(1, 0, 0),
	new THREE.Vector3(1, 1, 0),
	new THREE.Vector3(0, 1, 0),
].map(vertex =>
	vertex.applyMatrix4(unitSquare.clone().invert())
);

export function textDisplayTrianglesToMesh(textDisplays: TextDisplayEntity[]) {
	const positions: number[] = [];
	const colors: number[] = [];

	for (let i = 0; i < textDisplays.length; i++) {
		const textDisplay = textDisplays[i]!;

		if (textDisplay.shape === 'parallelogram') {
			const worldVerts = unitSquareVertices.map(vertex =>
				vertex.clone().applyMatrix4(textDisplay.transform)
			);

			pushTriangle(worldVerts[0]!, worldVerts[1]!, worldVerts[2]!, textDisplay.color, positions, colors);
			pushTriangle(worldVerts[0]!, worldVerts[2]!, worldVerts[3]!, textDisplay.color, positions, colors);
			continue;
		}

		if (textDisplay.shape === 'triangle' || textDisplay.shape === undefined) {
			if (i + 2 >= textDisplays.length) break;

			const first = textDisplays[i]!;

			for (const vertex of unitTriangleVertices) {
				const point = vertex.clone().applyMatrix4(first.transform);
				positions.push(point.x, point.y, point.z);
				colors.push(first.color.r, first.color.g, first.color.b);
			}

			i += 2;
		}
	}

	// Create the geometry
	const geometry = new THREE.BufferGeometry();
	
	// Add attributes
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

	// Create the mesh
	return new THREE.Mesh(geometry, textDisplayMaterial);
}

function pushTriangle(
	a: THREE.Vector3,
	b: THREE.Vector3,
	c: THREE.Vector3,
	color: THREE.Color,
	positions: number[],
	colors: number[],
) {
	for (const point of [a, b, c]) {
		positions.push(point.x, point.y, point.z);
		colors.push(color.r, color.g, color.b);
	}
}

const textDisplayMaterial = new THREE.ShaderMaterial({
	vertexShader: `
		attribute vec3 color;
		varying vec3 vColor;

		void main() {
			vColor = color;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: `
		varying vec3 vColor;

		void main() {
			gl_FragColor = vec4(vColor, 1.0);
		}
	`,
});