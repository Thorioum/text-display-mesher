import * as THREE from 'three';
import { lookAlongQuaternion, shearMatrix, translationMatrix } from './maths';
import { threeJSEmissiveShader, threeJSTextureShader, type TriangleShader } from './triangleShader';
import { deepFreeze } from './misc';
import { getTrianglesFromObject, MeshTriangle } from './getTrianglesFromMesh';
import { gltfToTextDisplayAnimations } from './textDisplayAnimations';

export interface TextDisplayBrightness {
	sky: number;
	block: number;
}

export interface TextDisplayEntity {
	color: THREE.Color;
	transform: THREE.Matrix4;
	brightness: TextDisplayBrightness;
	shape?: 'triangle' | 'parallelogram';
}

export const unitSquare = deepFreeze(
	new THREE.Matrix4()
		.multiply(translationMatrix(-0.1 + 0.5, -0.5 + 0.5, 0))
		.scale(new THREE.Vector3(8, 4.0, 1))
);

// Left aligned
export const unitTriangle = deepFreeze([
	// Left
	new THREE.Matrix4()
		.scale(new THREE.Vector3(0.5, 0.5, 0.5))
		.multiply(unitSquare),

	// Right
	new THREE.Matrix4()
		.scale(new THREE.Vector3(0.5, 0.5, 0.5))
		.multiply(translationMatrix(1, 0, 0))
		.multiply(shearMatrix({ yx: -1 }))
		.multiply(unitSquare),

	// Top
	new THREE.Matrix4()
		.scale(new THREE.Vector3(0.5, 0.5, 0.5))
		.multiply(translationMatrix(0, 1, 0))
		.multiply(shearMatrix({ xy: -1 }))
		.multiply(unitSquare),
]);

interface TextDisplayTriangleResult {
	transforms: THREE.Matrix4[];
	xAxis: THREE.Vector3;
	yAxis: THREE.Vector3;
	zAxis: THREE.Vector3;
	height: number;
	width: number;
	rotation: THREE.Quaternion;
	shear: number;
}

const DEFAULT_MERGE_OPTIONS = {
	positionEpsilon: 1e-10,
	normalEpsilon: 1e-4,
	colorEpsilon: 2 / 255,
	parallelogramTolerance: 1e-3
};

interface MergeOptions {
	positionEpsilon?: number;
	normalEpsilon?: number;
	colorEpsilon?: number;
	parallelogramTolerance?: number,
}

interface TriangleRenderData {
	triangle: MeshTriangle;
	color: THREE.Color;
	brightness: TextDisplayBrightness;
	normal: THREE.Vector3;
}

type EntityShape =
	| {
			type: 'triangle';
			triangle: TriangleRenderData;
	  }
	| {
			type: 'parallelogram';
			first: TriangleRenderData;
			second: TriangleRenderData;
			points: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
	  };

function textDisplayTriangle(
	point1: THREE.Vector3,
	point2: THREE.Vector3,
	point3: THREE.Vector3,
): TextDisplayTriangleResult {
	const p2 = point2.clone().sub(point1);
	const p3 = point3.clone().sub(point1);

	const zAxis = p2.clone().cross(p3).normalize();
	const xAxis = p2.clone().normalize();
	const yAxis = zAxis.clone().cross(xAxis).normalize();

	const width = p2.length();
	const height = p3.dot(yAxis);
	const p3Width = p3.dot(xAxis);

	const rotation = lookAlongQuaternion(zAxis.clone().multiplyScalar(-1), yAxis).conjugate();
	const shear = p3Width / width;

	const transform = new THREE.Matrix4()
		.multiply(translationMatrix(point1.x, point1.y, point1.z))
		.multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
		.scale(new THREE.Vector3(width, height, 1))
		.multiply(shearMatrix({ yx: shear }));

	const transforms = unitTriangle.map(unit => transform.clone().multiply(unit));

	return {
		transforms,
		xAxis,
		yAxis,
		zAxis,
		height,
		width,
		rotation,
		shear,
	};
}

function textDisplayParallelogram(
	point1: THREE.Vector3,
	point2: THREE.Vector3,
	point3: THREE.Vector3,
): THREE.Matrix4 {
	const p2 = point2.clone().sub(point1);
	const p3 = point3.clone().sub(point1);

	const zAxis = p2.clone().cross(p3).normalize();
	const xAxis = p2.clone().normalize();
	const yAxis = zAxis.clone().cross(xAxis).normalize();

	const width = p2.length();
	const height = p3.dot(yAxis);
	const p3Width = p3.dot(xAxis);

	const rotation = lookAlongQuaternion(zAxis.clone().multiplyScalar(-1), yAxis).conjugate();
	const shear = p3Width / width;

	return new THREE.Matrix4()
		.multiply(translationMatrix(point1.x, point1.y, point1.z))
		.multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
		.scale(new THREE.Vector3(width, height, 1))
		.multiply(shearMatrix({ yx: shear }))
		.multiply(unitSquare);
}

export function meshToTextDisplays(
	mesh: THREE.Object3D,
	shadowProvider: (color: THREE.Color, normal: THREE.Vector3, emission: number) => THREE.Color,
	options: MergeOptions = {},
): TextDisplayEntity[] {
	

	mesh.updateWorldMatrix(true, true);

	const triangulated = getTrianglesFromObject(mesh);

	const materialsToShaders = new Map<THREE.Material, { texture: TriangleShader; emissive: TriangleShader }>();
	for (const triangle of triangulated) {
		const material = triangle.first.material;
		if (!materialsToShaders.has(material)) {
			materialsToShaders.set(material, {
				texture: threeJSTextureShader(material),
				emissive: threeJSEmissiveShader(material),
			});
		}
	}

	const triangleRenderData: TriangleRenderData[] = triangulated.map(triangle => {
		const geometry = textDisplayTriangle(
			triangle.first.position,
			triangle.second.position,
			triangle.third.position,
		);

		const normal = geometry.zAxis;
		const material = triangle.first.material;
		const shaders = materialsToShaders.get(material)!;

		const emissiveColor = shaders.emissive(triangle);
		const emission = (emissiveColor.r + emissiveColor.g + emissiveColor.b) / 3;

		
		const color = shadowProvider(shaders.texture(triangle), normal, emission);

		const brightness = {
			sky: 15,
			block: Math.round(emission * 15),
		};

		return {
			triangle,
			color,
			brightness,
			normal,
		};
	});

	const mergeParallelograms = false;

	const patches = mergeParallelograms
		? mergeAdjacentTrianglesToParallelograms(triangleRenderData, options)
		: triangleRenderData.map(triangle => ({ type: 'triangle', triangle } as const));
		
	return patches.flatMap<TextDisplayEntity>(patch => {
			if (patch.type === 'triangle') {
			const triangle = patch.triangle.triangle;
			const { transforms } = textDisplayTriangle(
				triangle.first.position,
				triangle.second.position,
				triangle.third.position,
			);

			return transforms.map(transform => ({
				color: patch.triangle.color.clone(),
				transform,
				brightness: patch.triangle.brightness,
				shape: 'triangle' as const,
			}));
		}

		const [a, b, , d] = patch.points;
		const transform = textDisplayParallelogram(a, b, d);

		return [{
			color: patch.first.color.clone(),
			transform,
			brightness: patch.first.brightness,
			shape: 'parallelogram' as const,
		}];
	});

}

function mergeAdjacentTrianglesToParallelograms(
	triangles: TriangleRenderData[],
	options: MergeOptions = {},
): EntityShape[] {
	const {
		positionEpsilon,
		normalEpsilon,
		colorEpsilon,
		parallelogramTolerance
	} = { ...DEFAULT_MERGE_OPTIONS, ...options };

	const used = new Array<boolean>(triangles.length).fill(false);
	const patches: EntityShape[] = [];

	let cm = 0;
	for (let i = 0; i < triangles.length; i++) {
		if (used[i]) continue;

		const first = triangles[i]!;
		let merged = false;

		for (let j = i + 1; j < triangles.length; j++) {
			if (used[j] || i == j) continue;

			const second = triangles[j]!;

			if (!canMergeTriangles(first, second, positionEpsilon, normalEpsilon, colorEpsilon, parallelogramTolerance)) {
				continue;
			}

			const points = getMergedParallelogramPoints(
				first.triangle,
				second.triangle,
				positionEpsilon,
				parallelogramTolerance
			);

			if (!points) continue;

			used[i] = true;
			used[j] = true;
			patches.push({
				type: 'parallelogram',
				first,
				second,
				points,
			});
			cm++;
			merged = true;
			break;
		}

		if (!merged) {
			used[i] = true;
			patches.push({
				type: 'triangle',
				triangle: first,
			});
		}
	}

	console.log(cm, 'merged triangles into parallelograms');
	return patches;
}

function canMergeTriangles(
	first: TriangleRenderData,
	second: TriangleRenderData,
	positionEpsilon: number,
	normalEpsilon: number,
	colorEpsilon: number,
	parallelogramTolerance: number,
): boolean {
	if (first.triangle.first.material !== second.triangle.first.material) {
		return false;
	}

	if (!equalBrightness(first.brightness, second.brightness)) {
		return false;
	}

	if (!equalColor(first.color, second.color, colorEpsilon)) {
		return false;
	}

	if (!equalNormal(first.normal, second.normal, normalEpsilon)) {
		return false;
	}

	const ordered = getOrderedParallelogramPoints(first.triangle, second.triangle, positionEpsilon, parallelogramTolerance);
	return ordered !== null;
}

function getMergedParallelogramPoints(
	first: MeshTriangle,
	second: MeshTriangle,
	epsilon: number,
	parallelogramTolerance: number
): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] | null {
	return getOrderedParallelogramPoints(first, second, epsilon, parallelogramTolerance);
}

function getOrderedParallelogramPoints(
	first: MeshTriangle,
	second: MeshTriangle,
	epsilon: number,
	parallelogramTolerance: number
): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] | null {
	const vertices = dedupePositions([
		first.first.position,
		first.second.position,
		first.third.position,
		second.first.position,
		second.second.position,
		second.third.position,
	], epsilon);

	if (vertices.length !== 4) {
		return null;
	}

	const shared = getSharedVertices(first, second, epsilon);
	if (shared.length !== 2) {
		return null;
	}

	const ordered = orderPointsAroundCentroid(vertices, firstNormal(first), epsilon);
	if (!ordered) {
		return null;
	}

	const [a, b, c, d] = ordered;

	// Must actually be a parallelogram in cyclic order
	if (!isParallelogramOrdered(a, b, c, d, epsilon, parallelogramTolerance)) {
		return null;
	}

	// The shared edge between the two source triangles must be one of the diagonals
	// of the parallelogram, otherwise this is not the standard "two triangles make one quad" case.
	const isSharedAC =
		samePosition(shared[0]!, a, epsilon) && samePosition(shared[1]!, c, epsilon) ||
		samePosition(shared[1]!, a, epsilon) && samePosition(shared[0]!, c, epsilon);

	const isSharedBD =
		samePosition(shared[0]!, b, epsilon) && samePosition(shared[1]!, d, epsilon) ||
		samePosition(shared[1]!, b, epsilon) && samePosition(shared[0]!, d, epsilon);

	if (!isSharedAC && !isSharedBD) {
		return null;
	}

	return [a, b, c, d];
}

function dedupePositions(points: THREE.Vector3[], epsilon: number): THREE.Vector3[] {
	const unique: THREE.Vector3[] = [];

	for (const point of points) {
		if (!unique.some(existing => samePosition(existing, point, epsilon))) {
			unique.push(point);
		}
	}

	return unique;
}

function getSharedVertices(
	first: MeshTriangle,
	second: MeshTriangle,
	epsilon: number,
): THREE.Vector3[] {
	const firstVertices = [
		first.first.position,
		first.second.position,
		first.third.position,
	];

	const secondVertices = [
		second.first.position,
		second.second.position,
		second.third.position,
	];

	const shared: THREE.Vector3[] = [];

	for (const a of firstVertices) {
		if (secondVertices.some(b => samePosition(a, b, epsilon))) {
			shared.push(a);
		}
	}

	return shared;
}

function firstNormal(triangle: MeshTriangle): THREE.Vector3 {
	return triangle.second.position
		.clone()
		.sub(triangle.first.position)
		.cross(
			triangle.third.position.clone().sub(triangle.first.position)
		)
		.normalize();
}

function orderPointsAroundCentroid(
	points: THREE.Vector3[],
	normal: THREE.Vector3,
	epsilon: number,
): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] | null {
	if (points.length !== 4) {
		return null;
	}

	const centroid = new THREE.Vector3();
	for (const point of points) {
		centroid.add(point);
	}
	centroid.multiplyScalar(1 / points.length);

	// Build a stable 2D basis in the plane
	let xAxis = points[0]!.clone().sub(centroid);
	if (xAxis.length() <= epsilon) {
		xAxis = points[1]!.clone().sub(centroid);
	}
	if (xAxis.length() <= epsilon) {
		return null;
	}
	xAxis.normalize();

	const yAxis = normal.clone().cross(xAxis).normalize();
	if (yAxis.length() <= epsilon) {
		return null;
	}

	const sorted = points
		.map(point => {
			const offset = point.clone().sub(centroid);
			const x = offset.dot(xAxis);
			const y = offset.dot(yAxis);
			const angle = Math.atan2(y, x);

			return { point, angle };
		})
		.sort((a, b) => a.angle - b.angle)
		.map(entry => entry.point);

	// Ensure consistent winding with the supplied normal
	const cross = sorted[1]!.clone().sub(sorted[0]!).cross(
		sorted[2]!.clone().sub(sorted[1]!)
	);

	if (cross.dot(normal) < 0) {
		sorted.reverse();
	}

	return [
		sorted[0]!.clone(),
		sorted[1]!.clone(),
		sorted[2]!.clone(),
		sorted[3]!.clone(),
	];
}

function isParallelogramOrdered(
	a: THREE.Vector3,
	b: THREE.Vector3,
	c: THREE.Vector3,
	d: THREE.Vector3,
	epsilon: number,
	parallelogramTolerance: number
): boolean {
	const diagonalDelta = a.clone().add(c).sub(b.clone().add(d));
	const diagonalError = diagonalDelta.length();

	const scale = Math.max(
		a.distanceTo(b),
		b.distanceTo(c),
		c.distanceTo(d),
		d.distanceTo(a),
		epsilon
	);

	const allowedError = Math.max(epsilon, scale * 1e-3)

	if (diagonalError > allowedError) {
		return false;
	}

	const area = b.clone().sub(a).cross(d.clone().sub(a)).length();
	return area > epsilon;
}

function areCoplanar(
	a: THREE.Vector3,
	b: THREE.Vector3,
	c: THREE.Vector3,
	d: THREE.Vector3,
	epsilon: number,
): boolean {
	const normal = b.clone().sub(a).cross(c.clone().sub(a));
	const length = normal.length();

	if (length <= epsilon) {
		return false;
	}

	const distance = Math.abs(d.clone().sub(a).dot(normal.normalize()));
	return distance <= epsilon;
}

function equalBrightness(a: TextDisplayBrightness, b: TextDisplayBrightness): boolean {
	return a.sky === b.sky && a.block === b.block;
}

function equalColor(a: THREE.Color, b: THREE.Color, epsilon: number): boolean {
	return (
		Math.abs(a.r - b.r) <= epsilon &&
		Math.abs(a.g - b.g) <= epsilon &&
		Math.abs(a.b - b.b) <= epsilon
	);
}

function equalNormal(a: THREE.Vector3, b: THREE.Vector3, epsilon: number): boolean {
	return a.distanceTo(b) <= epsilon;
}

function samePosition(a: THREE.Vector3, b: THREE.Vector3, epsilon: number): boolean {
	return a.distanceTo(b) <= epsilon;
}

export function createShadowProvider({ light, minBrightness, maxBrightness }: {
	light: THREE.Vector3,
	minBrightness: number,
	maxBrightness: number,
}) {
	return function shadowProvider(color: THREE.Color, normal: THREE.Vector3, emission: number): THREE.Color {
		const lightDot = normal.dot(light);
		const brightness = (lightDot + 1) / 2 * (maxBrightness - minBrightness) + minBrightness;
		const brightnessAfterEmission = Math.min(1, brightness + emission);

		return new THREE.Color(
			color.r * brightnessAfterEmission,
			color.g * brightnessAfterEmission,
			color.b * brightnessAfterEmission
		);
	};
}