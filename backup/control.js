export function addControls(renderer, cubeGroup) {
  let dragging = false;
  let px = 0, py = 0;

  renderer.domElement.addEventListener("mousedown", e => {
    dragging = true;
    px = e.clientX;
    py = e.clientY;
  });

  window.addEventListener("mouseup", () => dragging = false);

  window.addEventListener("mousemove", e => {
    if (!dragging) return;

    cubeGroup.rotation.y += (e.clientX - px) * 0.005;
    cubeGroup.rotation.x += (e.clientY - py) * 0.005;

    px = e.clientX;
    py = e.clientY;
  });
}
