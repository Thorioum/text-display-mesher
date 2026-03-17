import * as THREE from "three";
import { unitSquare, type TextDisplayEntity } from "./textDisplays";
import type { TextDisplayAnimationFrame } from "./textDisplayAnimations";

const unitDisplayVertices = [
	new THREE.Vector3(0, 0, 0),
	new THREE.Vector3(1, 0, 0),
	new THREE.Vector3(1, 1, 0),
	new THREE.Vector3(0, 1, 0),
].map(vertex => vertex.applyMatrix4(unitSquare.clone().invert()));

export interface AnimatedTextDisplayPreview {
	group: THREE.Group;
	objects: THREE.Mesh[];
	applyFrame(frame: TextDisplayAnimationFrame): void;
}

export function createAnimatedTextDisplayPreview(
	textDisplays: TextDisplayEntity[],
): AnimatedTextDisplayPreview {
	const group = new THREE.Group();
	const objects: THREE.Mesh[] = [];

	for (const textDisplay of textDisplays) {
		const geometry = createGeometryFromVertices([
			unitDisplayVertices[0]!,
			unitDisplayVertices[1]!,
			unitDisplayVertices[2]!,
			unitDisplayVertices[0]!,
			unitDisplayVertices[2]!,
			unitDisplayVertices[3]!,
		]);

		const material = new THREE.MeshBasicMaterial({
			color: textDisplay.color,
			side: THREE.DoubleSide,
		});

		const mesh = new THREE.Mesh(geometry, material);
		mesh.matrixAutoUpdate = false;
		mesh.matrix.copy(textDisplay.transform);

		group.add(mesh);
		objects.push(mesh);
	}

	return {
		group,
		objects,
		applyFrame(frame) {
			for (const delta of frame.deltas) {
                const object = objects[delta.index];
                if (!object) continue;

                object.matrix.copy(delta.transform);
                object.matrixWorldNeedsUpdate = true;

                if (delta.color) {
                    const material = object.material;
                    if (material instanceof THREE.MeshBasicMaterial) {
                        material.color.copy(delta.color);
                    }
                }
            }
		},
	};
}

function createGeometryFromVertices(vertices: THREE.Vector3[]): THREE.BufferGeometry {
	const positions: number[] = [];

	for (const vertex of vertices) {
		positions.push(vertex.x, vertex.y, vertex.z);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	return geometry;
}