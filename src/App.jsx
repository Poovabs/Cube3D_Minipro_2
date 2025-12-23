import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Cube from './components/Cube';
import './index.css';

function App() {
  const cubeRef = useRef();

  const handleScramble = () => {
    if (cubeRef.current) {
      cubeRef.current.scramble();
    }
  };

  const handleReset = () => {
    window.location.reload();
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#333' }}>
      <div id="ui">
        <button onClick={handleScramble}>Scramble</button>
        <button onClick={handleReset}>Reset</button>
      </div>
      <Canvas camera={{ position: [5, 5, 7], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <Cube ref={cubeRef} />
        <OrbitControls enableDamping makeDefault />
      </Canvas>
    </div>
  );
}

export default App;
