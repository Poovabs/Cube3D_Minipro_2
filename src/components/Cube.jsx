import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RubiksCube } from '../RubiksCube';

const Cube = forwardRef((props, ref) => {
    const groupRef = useRef();
    const rubiksCubeRef = useRef(null);
    const { camera, gl, controls } = useThree();

    // Interaction state
    const isDraggingRef = useRef(false);
    const startIntersectRef = useRef(null);

    useEffect(() => {
        // Instantiate the RubiksCube logic class
        const cube = new RubiksCube();
        rubiksCubeRef.current = cube;

        // Add it to the standard Three.js group used by R3F
        if (groupRef.current) {
            groupRef.current.add(cube);
        }

        return () => {
            // Cleanup
            if (groupRef.current) {
                groupRef.current.remove(cube);
            }
        };
    }, []);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        scramble: () => {
            if (rubiksCubeRef.current && !rubiksCubeRef.current.isAnimating) {
                const axes = ['x', 'y', 'z'];
                const indices = [-1, 0, 1];
                const dirs = [1, -1];

                for (let i = 0; i < 20; i++) {
                    const axis = axes[Math.floor(Math.random() * axes.length)];
                    const index = indices[Math.floor(Math.random() * indices.length)];
                    const dir = dirs[Math.floor(Math.random() * dirs.length)];
                    rubiksCubeRef.current.rotateLayer(axis, index, dir, false);
                }
            }
        },
        rotateLayer: (axis, index, dir) => {
            if (rubiksCubeRef.current) {
                rubiksCubeRef.current.rotateLayer(axis, index, dir, true);
            }
        }
    }));

    // Interaction Logic
    useEffect(() => {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const getIntersect = (event) => {
            if (!rubiksCubeRef.current) return null;

            // Calculate mouse position in normalized device coordinates
            // (-1 to +1) for both components
            const rect = gl.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(rubiksCubeRef.current.cubies, false);
            return intersects.length > 0 ? intersects[0] : null;
        };

        const onMouseDown = (event) => {
            // Only left click
            if (event.button !== 0) return;
            if (!rubiksCubeRef.current || rubiksCubeRef.current.isAnimating) return;

            const intersect = getIntersect(event);
            if (intersect) {
                if (controls) controls.enabled = false;
                startIntersectRef.current = intersect;
                isDraggingRef.current = true;
            }
        };

        const onMouseMove = (event) => {
            if (!isDraggingRef.current || !startIntersectRef.current || !rubiksCubeRef.current) return;
            if (rubiksCubeRef.current.isAnimating) return;

            // Logic from main.js
            const dx = event.movementX;
            const dy = event.movementY;

            if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // threshold

            const startIntersect = startIntersectRef.current;
            const rubiksCube = rubiksCubeRef.current;

            // Get Normal in World Space
            // startIntersect.object is the Mesh (cubie)
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(startIntersect.object.matrixWorld);
            const worldNormal = startIntersect.face.normal.clone().applyMatrix3(normalMatrix).normalize();

            // Determine the two possible rotation axes perpendicular to normal
            let possibleAxes = [];
            if (Math.abs(worldNormal.x) > 0.9) possibleAxes = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
            else if (Math.abs(worldNormal.y) > 0.9) possibleAxes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
            else possibleAxes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];

            // Project these 3D axes to 2D screen space
            const origin = startIntersect.point.clone().project(camera);

            let bestAxis = null;
            let maxDot = 0;

            // Mouse drag vector
            const dragVec = new THREE.Vector2(dx, -dy).normalize();

            possibleAxes.forEach(axis => {
                const pt = startIntersect.point.clone().add(axis).project(camera);
                // We use a small delta in 3D (1 unit) to get screen direction
                // The screen direction is (pt.x - origin.x, pt.y - origin.y)
                // Since we are comparing directions, magnitude doesn't matter much as long as it's not zero
                const axisVec2D = new THREE.Vector2(pt.x - origin.x, pt.y - origin.y).normalize();

                const dot = Math.abs(dragVec.dot(axisVec2D));
                if (dot > maxDot) {
                    maxDot = dot;
                    bestAxis = axis;
                }
            });

            if (maxDot > 0.5) {
                // We found the axis of MOVEMENT
                const movementAxis = bestAxis;

                // Rotation Axis is cross product (Movement x Normal) -> Normalized
                const rotationAxisVector = new THREE.Vector3().crossVectors(movementAxis, worldNormal).normalize();

                // Determine axis name (x, y, z)
                let rotAxisName = 'x';
                if (Math.abs(rotationAxisVector.y) > 0.9) rotAxisName = 'y';
                if (Math.abs(rotationAxisVector.z) > 0.9) rotAxisName = 'z';

                // Determine which layer
                const layerCoord = Math.round(startIntersect.object.position[rotAxisName]);

                // Determine direction
                // Project drag onto the 2D axis of movement
                const pt = startIntersect.point.clone().add(movementAxis).project(camera);
                const axisVec2D = new THREE.Vector2(pt.x - origin.x, pt.y - origin.y); // Not normalized for sign check? No wait.
                const projected = dragVec.dot(axisVec2D.normalize());
                const directionSign = projected > 0 ? 1 : -1;

                // Cross check for CW/CCW
                const cross = new THREE.Vector3().crossVectors(worldNormal, movementAxis).normalize();

                const standardRotAxis = new THREE.Vector3();
                standardRotAxis[rotAxisName] = 1;

                let rotDir = directionSign;
                // If the calculated cross product points opposite to standard axis, invert?
                // Logic: Standard Axis + Rotation -> Positive Angle.
                // We need to map our physical gesture to that.
                if (cross.dot(standardRotAxis) < 0) rotDir *= -1;

                // Execute rotation
                rubiksCube.rotateLayer(rotAxisName, layerCoord, rotDir);

                // Reset state
                isDraggingRef.current = false;
                startIntersectRef.current = null;
                if (controls) controls.enabled = true;
            }
        };

        const onMouseUp = () => {
            isDraggingRef.current = false;
            startIntersectRef.current = null;
            if (controls) controls.enabled = true;
        };

        const domElement = gl.domElement;
        domElement.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            domElement.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [camera, gl, controls]);

    return <group ref={groupRef} {...props} />;
});

export default Cube;
