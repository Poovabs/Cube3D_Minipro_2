import * as THREE from 'three';

export class RubiksCube extends THREE.Group {
    constructor() {
        super();
        this.cubies = [];
        this.isAnimating = false;

        const colors = {
            R: 0xb90000, // Right - Red
            L: 0xff5900, // Left - Orange
            U: 0xffffff, // Up - White
            D: 0xffd500, // Down - Yellow
            F: 0x009b48, // Front - Green
            B: 0x0045ad  // Back - Blue
        };

        const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);

        // Grid range
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {

                    // Materials for this specific cubie based on position
                    // Order: +x, -x, +y, -y, +z, -z
                    const materials = [
                        new THREE.MeshStandardMaterial({ color: x === 1 ? colors.R : 0x222222 }), // Right
                        new THREE.MeshStandardMaterial({ color: x === -1 ? colors.L : 0x222222 }), // Left
                        new THREE.MeshStandardMaterial({ color: y === 1 ? colors.U : 0x222222 }), // Top
                        new THREE.MeshStandardMaterial({ color: y === -1 ? colors.D : 0x222222 }), // Bottom
                        new THREE.MeshStandardMaterial({ color: z === 1 ? colors.F : 0x222222 }), // Front
                        new THREE.MeshStandardMaterial({ color: z === -1 ? colors.B : 0x222222 }), // Back
                    ];

                    const cubie = new THREE.Mesh(geometry, materials);
                    cubie.position.set(x, y, z);

                    // Store initial grid coords to help mostly, but we'll rely on world position for selection
                    cubie.userData = { isCubie: true };

                    this.add(cubie);
                    this.cubies.push(cubie);
                }
            }
        }
    }

    // Helper to snap values to clean integers (-1, 0, 1) to avoid floating point drift
    snap() {
        this.cubies.forEach(cubie => {
            cubie.position.x = Math.round(cubie.position.x);
            cubie.position.y = Math.round(cubie.position.y);
            cubie.position.z = Math.round(cubie.position.z);

            cubie.updateMatrix();
        });
    }

    // Axis: 'x', 'y', 'z'
    // Index: -1, 0, 1
    // Direction: 1 (counter-clockwise/normal), -1 (clockwise/inverse)
    rotateLayer(axis, index, direction, animate = true, duration = 300) {
        if (this.isAnimating) return;

        // Find cubies in the slice
        const activeCubies = this.cubies.filter(c => Math.round(c.position[axis]) === index);

        if (activeCubies.length === 0) return;

        // Create a pivot object
        const pivot = new THREE.Object3D();
        pivot.rotation.set(0, 0, 0);
        this.add(pivot);

        // Attach cubies to pivot
        activeCubies.forEach(c => {
            pivot.attach(c);
        });

        const targetRotation = (Math.PI / 2) * direction * -1; // -1 to match standard inspection controls usually

        if (animate) {
            this.isAnimating = true;
            const startRot = { value: 0 };
            // const endRot = { value: targetRotation }; // Unused

            const startTime = performance.now();

            const animateStep = (time) => {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease out cubic
                const ease = 1 - Math.pow(1 - progress, 3);

                pivot.rotation[axis] = targetRotation * ease;

                if (progress < 1) {
                    requestAnimationFrame(animateStep);
                } else {
                    this.finishRotation(pivot, activeCubies, axis);
                }
            };
            requestAnimationFrame(animateStep);
        } else {
            pivot.rotation[axis] = targetRotation;
            this.finishRotation(pivot, activeCubies, axis);
        }
    }

    finishRotation(pivot, activeCubies, axis) {
        pivot.updateMatrixWorld();
        activeCubies.forEach(c => {
            this.attach(c); // Re-attach to main group

            // Round positions and rotations to prevent drift
            c.position.x = Math.round(c.position.x);
            c.position.y = Math.round(c.position.y);
            c.position.z = Math.round(c.position.z);

            c.rotation.x = Math.round(c.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
            c.rotation.y = Math.round(c.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
            c.rotation.z = Math.round(c.rotation.z / (Math.PI / 2)) * (Math.PI / 2);

            c.updateMatrix();
        });

        this.remove(pivot);
        this.isAnimating = false;
    }
}
