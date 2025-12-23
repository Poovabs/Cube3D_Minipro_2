import { rotateFace } from "./cube.js";

let moveHistory = [];

export function makeMove(cubeGroup, move) {
  rotateFace(cubeGroup, move);
  moveHistory.push(move);
}

export function scramble(cubeGroup, steps = 20) {
  moveHistory = [];

  const moves = ["R", "L", "U", "D", "F", "B"];
  for (let i = 0; i < steps; i++) {
    const m = moves[Math.floor(Math.random() * moves.length)];
    makeMove(cubeGroup, m);
  }
}

export function autoSolve(cubeGroup) {
  const reverse = [...moveHistory].reverse();

  let i = 0;
  const interval = setInterval(() => {
    if (i >= reverse.length) {
      clearInterval(interval);
      return;
    }
    rotateFace(cubeGroup, reverse[i]);
    i++;
  }, 300);
}
