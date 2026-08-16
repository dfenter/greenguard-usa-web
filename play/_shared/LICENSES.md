# Vendored engine licenses (/play/_shared/)

- phaser.min.js — Phaser 3.87.0, MIT License, (c) Photon Storm Ltd / Richard Davey. https://github.com/phaserjs/phaser
- three/three.module.min.js — three.js r160.1, MIT License, (c) 2010-2023 Three.js Authors. https://github.com/mrdoob/three.js
- three/GLTFLoader.js — three.js r160.1 examples/jsm loader, MIT License, same authors.
- three/OBJLoader.js — three.js r160.1 examples/jsm loader, MIT License, same authors.
- three/MTLLoader.js — three.js r160.1 examples/jsm loader, MIT License, same authors.
- utils/BufferGeometryUtils.js — three.js r160.1 examples/jsm utility, MIT License, same authors.
- ggkit.js — GreenGuard studio kit, original work, no third-party code.

Games load Three via an import map: {"imports": {"three": "/play/_shared/three/three.module.min.js"}}.
