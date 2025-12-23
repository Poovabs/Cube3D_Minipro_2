import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RubiksCube } from './cube.js';

// Setup Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6, 4, 6);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls (Orbit around the cube)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 20;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Cube
const rubiksCube = new RubiksCube();
scene.add(rubiksCube);

// Interaction Logic
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let startIntersect = null; // { object, point, face }
let isDragging = false;

// We need to know which face of the cube we clicked on to determine axes
// Normal to Face mapping:
// (1,0,0) -> R, (-1,0,0) -> L
// (0,1,0) -> U, (0,-1,0) -> D
// (0,0,1) -> F, (0,0,-1) -> B

function getIntersect(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(rubiksCube.cubies, false)[0];
}

renderer.domElement.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);

function onMouseDown(event) {
  if (rubiksCube.isAnimating) return;

  // Only left click
  if (event.button !== 0) return;

  const intersect = getIntersect(event);
  if (intersect) {
    controls.enabled = false; // Disable orbit while interacting with cube
    startIntersect = intersect;
    isDragging = true;
  }
}

function onMouseMove(event) {
  if (!isDragging || !startIntersect || rubiksCube.isAnimating) return;

  const intersect = getIntersect(event);

  // We need a drag of some distance to determine direction
  // If we have a second intersection with the SAME cubie, or even a different one...
  // But getting the exact logic right in 3D is tricky with raycasting alone.
  // Easier approach: Project drag vector onto screen, compare with projected axes of the touched face.

  // Detailed Interaction Logic:
  // 1. We have a start point `P1` on a specific face with normal `N`.
  // 2. We drag to current mouse position. We need a way to map 2D mouse motion to 3D cube axes.
  // 3. Simple approach: Compare deltaX and deltaY on screen.
  //    BUT, the visual orientation of axes depends on camera.
  //    Better: Raycast to a plane defined by the touched face.

  if (!intersect) {
    // If we drag off the cube, we can try to guess or just cancel.
    // Let's use simple screen-space vector analysis for robustness.
    return;
  }

  // Determine move vector
  // We need to find the "Major Axis" of movement relative to the clicked face.
  // The clicked face normal defines the plane we are inspecting (e.g. Front Face -> XY plane)
  // Actually simpler:
  // If normal is X-axis (Right/Left face): We can rotate around Y (Vertical) or Z (Horizontal)
  // If normal is Y-axis (Top/Bottom face): We can rotate around X (Horizontal) or Z (Vertical)
  // If normal is Z-axis (Front/Back face): We can rotate around X (Horizontal) or Y (Vertical)

  // Let's get the 3D point of current mouse ray on the plane of the `startIntersect`.
  // Plane normal = startIntersect.face.normal (in local space of cubie?)
  // Need world normal.
  // Mesh is rotated? No, cubies are rotated. 
  // Wait, cubies rotation is reset/tracked. `face.normal` is local to geometry, which is axis-aligned box.
  // But the cubie mesh itself rotates.

  // Let's use a simpler heuristic for this step ID:
  // 1. Get screen Delta.
  // 2. Project the two possible 3D axes for that face onto the screen.
  // 3. See which screen-projected axis matches the mouse drag direction best (dot product).

  const moveX = event.clientX - (mouse.x * window.innerWidth / 2 + window.innerWidth / 2); // Approximate standard px delta?
  // Actually correct flow:

  const dx = event.movementX;
  const dy = event.movementY;

  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // threshold

  // Get Normal in World Space
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(startIntersect.object.matrixWorld);
  const worldNormal = startIntersect.face.normal.clone().applyMatrix3(normalMatrix).normalize();

  // Determine the two possible rotation axes
  // The axes are the ones perpendicular to the normal.
  // E.g. Normal (1,0,0) -> Axes are (0,1,0) and (0,0,1)

  let possibleAxes = [];
  if (Math.abs(worldNormal.x) > 0.9) possibleAxes = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  else if (Math.abs(worldNormal.y) > 0.9) possibleAxes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  else possibleAxes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];

  // Project these 3D axes to 2D screen space
  const origin = startIntersect.point.clone().project(camera);

  let bestAxis = null;
  let maxDot = 0;

  // Mouse drag vector in "projected space" (normalized -1 to 1) 
  // movementX/Y is pixels. We need direction.
  const dragVec = new THREE.Vector2(dx, -dy).normalize();

  possibleAxes.forEach(axis => {
    // A point along this axis in 3D
    const pt = startIntersect.point.clone().add(axis).project(camera);
    const axisVec2D = new THREE.Vector2(pt.x - origin.x, pt.y - origin.y).normalize();

    const dot = Math.abs(dragVec.dot(axisVec2D));
    if (dot > maxDot) {
      maxDot = dot;
      bestAxis = axis;
    }
  });

  if (maxDot > 0.5) { // Confidence threshold
    // We found the axis! 
    // Now determine direction +1 or -1
    // We need to define "Layer Index".

    // Axis name 'x', 'y' or 'z'
    let axisName = 'x';
    if (Math.abs(bestAxis.y) > 0.9) axisName = 'y';
    if (Math.abs(bestAxis.z) > 0.9) axisName = 'z';

    // Find which layer index: -1, 0, or 1.
    // We use the startInteersect.object.position.[axisName]
    const layerIndex = Math.round(startIntersect.object.position[axisName]);

    // Determine rotation direction (CW vs CCW)
    // We compare the dot product sign again but need to be careful with coordinate systems.
    // A simpler way: just project the drag onto the 2D axis.

    const pt = startIntersect.point.clone().add(bestAxis).project(camera);
    const axisVec2D = new THREE.Vector2(pt.x - origin.x, pt.y - origin.y); // Not normalized

    // Project drag onto this 2D axis vector
    const projected = dragVec.dot(axisVec2D.normalize());

    // The `rotationAxis` is NOT the `bestAxis`. The `bestAxis` is the direction of MOVEMENT.
    // The Rotation Axis is the cross product of Normal and Movement Axis.
    // Wait.
    // If I drag mouse horizontally on the Front face (Normal Z), I am moving along X.
    // Rotation happens around Y.
    // So Rotation Axis = Cross(Normal, MovementVector)

    // Let's re-eval:
    // Movement along bestAxis means rotation around the OTHER axis perpendicular to normal.

    // E.g. Normal Z(Front). Move along X(Right). Rotation is around Y.

    // The actual rotation axis we want to feed to rotateLayer:
    // We have `possibleAxes`. Let's say `bestAxis` is the one we hold.
    // The rotation axis is the `other` one in the pair? No.
    // Example: Normal Front (0,0,1). Possible (1,0,0) [X] and (0,1,0) [Y].
    // If I drag along X, I am rotating the Horizontal slice. The Axis of rotation is Y.
    // So yes, the Rotation Axis is the *other* one.

    const movementAxis = bestAxis;
    const rotationAxisVector = new THREE.Vector3().crossVectors(movementAxis, worldNormal).normalize();

    // Ideally rotationAxisVector should align with X, Y, or Z.
    let rotAxisName = 'x';
    if (Math.abs(rotationAxisVector.y) > 0.9) rotAxisName = 'y';
    if (Math.abs(rotationAxisVector.z) > 0.9) rotAxisName = 'z';

    // Now Direction.
    // This is tricky. Let's try to infer from cross products or just heuristic.
    // If we drag "positive" along movement axis...
    // Drag +X on Front Face -> Rotates Layer around +Y (or -Y depending on convention).
    // Let's trust the dot product sign of the drag vs screen-projected movement axis.

    const directionSign = projected > 0 ? 1 : -1;

    // We might need to invert direction based on face or where we are.
    // Let's trial and error or solve strictly:
    // World Movement = directionSign * movementAxis.
    // Torque = Cross(Radius, Force).
    // Here, logically:
    // Dragging Right (+X) on Front (+Z) -> Rotates around Y.
    // Standard Right Hand Rule: Thumb +Y -> Fingers curl (Right to Back).
    // That matches dragging Right.

    // We can pass this to the cube.
    // However, we need to respect the layer of the *Rotation Axis*.
    // Wait, if I drag along X, I rotate around Y. Which Y layer?
    // The Y layer corresponding to my position? No.
    // If I drag along X, I rotate the entire horizontal row.
    // The "Row" is defined by the Y coordinate of the piece I touched.

    const layerCoord = Math.round(startIntersect.object.position[rotAxisName]);

    // Direction fix:
    // The visual drag direction on screen might be inverted relative to 3D world axis depending on camera view.
    // But we computed `projected` using camera projection, so `directionSign` tells us if we move TOWARDS the projected axis positive end or away.
    // So if we move Towards +X, `directionSign` is +1.

    // We need to correlate "Moving +X" with "Rotation Direction in Y".
    // Cross(Normal Z, Move X) = +Y.
    // Cross(Normal -Z, Move X) = -Y.
    // So we can use the cross product logic.

    const cross = new THREE.Vector3().crossVectors(worldNormal, movementAxis).normalize();

    // If cross matches +RotationAxis -> +1, else -1?
    // Let's just pass `directionSign` adjusted by the dot of (Cross vs StandardRotationAxis).

    const standardRotAxis = new THREE.Vector3();
    standardRotAxis[rotAxisName] = 1;

    let rotDir = directionSign;
    if (cross.dot(standardRotAxis) < 0) rotDir *= -1;

    // Final invert based on testing usually needed, but let's try this.

    rubiksCube.rotateLayer(rotAxisName, layerCoord, rotDir);

    isDragging = false;
    startIntersect = null;
    controls.enabled = true;
  }
}

function onMouseUp() {
  isDragging = false;
  controls.enabled = true;
  startIntersect = null;
}

// UI Handlers
document.getElementById('btn-scramble').addEventListener('click', () => {
  if (rubiksCube.isAnimating) return;

  // Perfrom 20 random moves
  const axes = ['x', 'y', 'z'];
  const indices = [-1, 0, 1];
  const dirs = [1, -1];

  // We want to animate them sequentially? Or fast?
  // Let's do fast animation or instant.
  // Instant is better for "Scramble".

  for (let i = 0; i < 20; i++) {
    const axis = axes[Math.floor(Math.random() * axes.length)];
    const index = indices[Math.floor(Math.random() * indices.length)];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    rubiksCube.rotateLayer(axis, index, dir, false);
  }
});

document.getElementById('btn-reset').addEventListener('click', () => {
  // Reload page or reverse moves? Reload is easiest.
  location.reload();
});


// Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
