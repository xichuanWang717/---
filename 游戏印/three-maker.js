const canvas = document.getElementById("threeStage");
const artifact = document.getElementById("artifact");
const workbench = document.querySelector(".workbench");
const sealViewToggle = document.getElementById("sealViewToggle");

let THREE;

try {
  THREE = await import("https://unpkg.com/three@0.165.0/build/three.module.js");
} catch (error) {
  canvas?.remove();
  console.warn("Three.js could not load; keeping CSS fallback.", error);
}

if (THREE && canvas && artifact && workbench) {
  document.documentElement.classList.add("three-ready");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.32, 6.2);

  const key = new THREE.DirectionalLight(0xfff2d6, 4.4);
  key.position.set(-2.1, 5.2, 3.8);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xb7ead9, 2.2);
  rim.position.set(3.2, 1.9, -2.2);
  scene.add(rim);

  // A low side light makes shallow ceramic relief read as changing highlights,
  // instead of leaving the pattern looking like ink laid on the surface.
  const reliefLight = new THREE.DirectionalLight(0xf7dfb0, 1.65);
  reliefLight.position.set(-4.4, 0.75, 2.8);
  scene.add(reliefLight);

  const fill = new THREE.AmbientLight(0x5c8178, 0.38);
  scene.add(fill);

  const group = new THREE.Group();
  group.scale.setScalar(0.9);
  scene.add(group);
  let groupScale = 0.9;

  const fireGlow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 64),
    new THREE.MeshBasicMaterial({
      color: 0xd9864c,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  fireGlow.rotation.x = -Math.PI / 2;
  fireGlow.position.y = -1.05;
  scene.add(fireGlow);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 64),
    new THREE.MeshBasicMaterial({
      color: 0x020706,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.04;
  shadow.scale.y = 0.28;
  scene.add(shadow);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xb49f84,
    side: THREE.DoubleSide,
    roughness: 0.36,
    metalness: 0,
    transmission: 0,
    thickness: 0.8,
    clearcoat: 0.72,
    clearcoatRoughness: 0.24,
    sheen: 0.38,
    sheenColor: 0xdffff0,
    vertexColors: true,
  });
  const footMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2b2118,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.18,
  });
  const innerMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x07110f,
    roughness: 0.7,
    metalness: 0,
    clearcoat: 0.04,
    side: THREE.DoubleSide,
  });
  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xaed8c6,
    roughness: 0.26,
    metalness: 0,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
    side: THREE.DoubleSide,
  });

  let vessel;
  let rimRing;
  let footRing;
  let sealPatternGroup;
  let sealLetterGroup;
  let currentKey = "";
  let targetRot = 0;
  let userRot = 0;
  let userPitch = 0;
  let userZoom = 1;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartRot = 0;
  let dragStartPitch = 0;
  let isRotating = false;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  const activePointers = new Map();
  let patternTexture;
  let handStrokes = [];
  let activeHandStroke = null;
  let activeHandPointerId = null;
  let handStrokeVersion = 0;
  let lastSealViewKey = "";
  let sealFaceView = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const brushCursor = document.createElement("div");
  brushCursor.className = "brush-cursor";
  workbench.appendChild(brushCursor);

  function isHandCarveMode() {
    return (artifact.dataset.currentPattern || artifact.dataset.pattern) === "pinch"
      && artifact.dataset.patternTool !== "rotate";
  }

  function setSealFaceView(active) {
    const wasActive = sealFaceView;
    sealFaceView = active;
    if (sealViewToggle) {
      sealViewToggle.textContent = active ? "看全形" : "看印面";
      sealViewToggle.setAttribute("aria-pressed", active ? "true" : "false");
    }
    if (active) {
      userPitch = 1.38;
      userRot = -0.42;
      userZoom = Math.max(userZoom, 1.18);
    } else if (wasActive) {
      userPitch = 0.18;
      userZoom = Math.min(userZoom, 1.08);
    }
  }

  function pointerToCarvePoint(event) {
    if (vessel) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(vessel, false)[0];
      if (hit) {
        const local = vessel.worldToLocal(hit.point.clone());
        vessel.geometry.computeBoundingBox();
        const box = vessel.geometry.boundingBox;
        const shape = artifact.dataset.shape || "bowl";
        if (isSealShape(shape)) {
          return {
            u: Math.max(-1, Math.min(1, local.x / Math.max(0.001, Math.max(Math.abs(box.min.x), Math.abs(box.max.x))))),
            v: Math.max(-1, Math.min(1, local.z / Math.max(0.001, Math.max(Math.abs(box.min.z), Math.abs(box.max.z))))),
          };
        }
        const theta = Math.atan2(local.z, local.x);
        const centerTheta = Math.PI / 2;
        const thetaWidth = Math.PI;
        const angle = Math.atan2(Math.sin(theta - centerTheta), Math.cos(theta - centerTheta));
        return {
          u: Math.max(-1, Math.min(1, angle / thetaWidth)),
          v: Math.max(-0.92, Math.min(0.88, ((local.y - box.min.y) / Math.max(0.001, box.max.y - box.min.y)) * 2 - 1)),
        };
      }
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    return {
      u: Math.max(-0.92, Math.min(0.92, x * 1.35)),
      v: Math.max(-0.92, Math.min(0.88, y * 1.1 - 0.08)),
    };
  }

  function brushSize() {
    return Math.max(0.45, Math.min(1.8, cssNumber("--pattern-brush", 1)));
  }

  function updateBrushCursor(event) {
    const active = isHandCarveMode() && isInsideWorkbench(event);
    brushCursor.dataset.show = active ? "true" : "false";
    if (!active) return;
    const rect = workbench.getBoundingClientRect();
    const size = 34 * brushSize();
    brushCursor.style.width = `${size}px`;
    brushCursor.style.height = `${size}px`;
    brushCursor.style.transform = `translate(${event.clientX - rect.left - size / 2}px, ${event.clientY - rect.top - size / 2}px)`;
    brushCursor.dataset.tool = artifact.dataset.patternTool || "carve";
  }

  function isInsideWorkbench(event) {
    const rect = workbench.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  function beginHandStroke(event) {
    if (!isHandCarveMode()) return false;
    if (activeHandStroke) return true;
    const tool = artifact.dataset.patternTool || "carve";
    const point = { ...pointerToCarvePoint(event), brush: brushSize() };
    activeHandStroke = { tool, points: [point] };
    activeHandPointerId = event.pointerId ?? "mouse";
    handStrokes.push(activeHandStroke);
    handStrokeVersion += 1;
    currentKey = "";
    window.__celadonCarveCount = handStrokes.length;
    return true;
  }

  function addHandStrokePoint(event) {
    if (!activeHandStroke || !isHandCarveMode()) return false;
    if ((event.pointerId ?? "mouse") !== activeHandPointerId) return true;
    const point = { ...pointerToCarvePoint(event), brush: brushSize() };
    const last = activeHandStroke.points[activeHandStroke.points.length - 1];
    if (!last || Math.hypot(point.u - last.u, point.v - last.v) > 0.01) {
      activeHandStroke.points.push(point);
      handStrokeVersion += 1;
      currentKey = "";
      window.__celadonCarveCount = handStrokes.length;
    }
    return true;
  }

  function distanceToStroke(stroke, u, v) {
    let best = 99;
    const points = stroke.points || stroke;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.u - a.u;
      const dy = b.v - a.v;
      const len2 = dx * dx + dy * dy || 0.0001;
      const t = Math.max(0, Math.min(1, ((u - a.u) * dx + (v - a.v) * dy) / len2));
      const px = a.u + dx * t;
      const py = a.v + dy * t;
      const width = Math.max(0.45, ((a.brush || 1) + (b.brush || 1)) * 0.5);
      best = Math.min(best, Math.hypot(u - px, v - py) / width);
    }
    if (points.length === 1) best = Math.min(best, Math.hypot(u - points[0].u, v - points[0].v) / Math.max(0.45, points[0].brush || 1));
    return best;
  }

  function distanceToHandStrokes(u, v, tool) {
    let best = 99;
    handStrokes.forEach((stroke) => {
      if ((stroke.tool || "carve") !== tool) return;
      best = Math.min(best, distanceToStroke(stroke, u, v));
    });
    return best;
  }

  function cssNumber(name, fallback) {
    const value = Number.parseFloat(getComputedStyle(artifact).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function dataNumber(name, fallback) {
    const value = Number.parseFloat(artifact.dataset[name]);
    return Number.isFinite(value) ? value : fallback;
  }

  function isSealShape(shape) {
    return String(shape || "").startsWith("seal-");
  }

  function profile(shape, clay, mouth, belly, height) {
    const lift = 0.9 + clay * 0.18;
    const h = lift * height;
    const b = belly;
    const m = mouth;

    if (shape === "jar") {
      return [
        [0.0, -h],
        [0.28 * b, -h * 0.99],
        [0.58 * b, -h * 0.86],
        [0.82 * b, -h * 0.58],
        [0.9 * b, -h * 0.28],
        [0.74 * b, -h * 0.02],
        [0.5 * b, h * 0.16],
        [0.36 * m, h * 0.38],
        [0.34 * m, h * 0.6],
        [0.44 * m, h * 0.66],
      ];
    }

    if (shape === "cup") {
      return [
        [0.0, -h * 0.9],
        [0.42 * b, -h * 0.86],
        [0.54 * b, -h * 0.22],
        [0.68 * m, h * 0.38],
        [0.8 * m, h * 0.46],
        [0.84 * m, h * 0.46],
      ];
    }

    return [
      [0.0, -h * 0.78],
      [0.38 * b, -h * 0.76],
      [0.68 * b, -h * 0.55],
      [0.82 * b, -h * 0.16],
      [0.9 * m, h * 0.25],
      [0.96 * m, h * 0.38],
    ];
  }

  function makeGeometry() {
    const shape = artifact.dataset.shape || "bowl";
    const clay = cssNumber("--clay-step", 0) / 3;
    const mouth = cssNumber("--mouth", 1);
    const belly = cssNumber("--belly", 1);
    const height = cssNumber("--height", 1);
    const clayQuality = dataNumber("clayQuality", 1);
    if (isSealShape(shape)) {
      const heightScale = 0.86 + clay * 0.22 + height * 0.08;
      let geometry;
      if (shape === "seal-round") {
        geometry = new THREE.CylinderGeometry(0.66 * belly, 0.72 * belly, 1.52 * heightScale, 96, 12);
      } else if (shape === "seal-rect") {
        geometry = new THREE.BoxGeometry(0.82 * mouth, 1.64 * heightScale, 0.82 * belly, 10, 18, 10);
      } else {
        geometry = new THREE.BoxGeometry(1.22 * mouth, 1.44 * heightScale, 1.22 * belly, 12, 18, 12);
      }
      geometry.translate(0, -0.08, 0);
      if (clayQuality < 0.96) {
        leanThrownBody(geometry, (0.96 - clayQuality) * 0.08);
      }
      softenSealBody(geometry, shape);
      spoilFailedBody(geometry, Number.parseInt(artifact.dataset.failCount || "0", 10));
      carvePatternIntoGeometry(geometry);
      geometry.computeVertexNormals();
      return geometry;
    }
    const basePoints = profile(shape, clay, mouth, belly, height).map(([x, y]) => new THREE.Vector2(x, y));
    const points = new THREE.SplineCurve(basePoints).getPoints(90).map((point) => {
      point.x = Math.max(0.001, point.x);
      return point;
    });
    const geometry = new THREE.LatheGeometry(points, 192);
    geometry.rotateY(Math.PI / 2);
    if (clayQuality < 0.96) {
      leanThrownBody(geometry, (0.96 - clayQuality) * 0.14);
    }
    const thrownSoftness = shape === "jar"
      ? Math.max(0.12, 0.28 - Math.max(0, clayQuality - 0.9) * 0.7)
      : Math.max(0.2, 0.38 - Math.max(0, clayQuality - 0.9) * 0.65);
    softenThrownBody(geometry, thrownSoftness);
    spoilFailedBody(geometry, Number.parseInt(artifact.dataset.failCount || "0", 10));
    carvePatternIntoGeometry(geometry);
    geometry.computeVertexNormals();
    return geometry;
  }

  function softenSealBody(geometry, shape) {
    const pos = geometry.attributes.position;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const maxX = Math.max(0.001, Math.max(Math.abs(box.min.x), Math.abs(box.max.x)));
    const maxZ = Math.max(0.001, Math.max(Math.abs(box.min.z), Math.abs(box.max.z)));
    const spanY = Math.max(0.001, box.max.y - box.min.y);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const v = (y - box.min.y) / spanY;
      const topBottomEase = 1 - Math.abs(v - 0.5) * 0.22;
      const edgeX = Math.abs(x) / maxX;
      const edgeZ = Math.abs(z) / maxZ;
      const cornerSoft = shape === "seal-round" ? 1 : 1 - Math.max(0, Math.min(edgeX, edgeZ) - 0.72) * 0.045;
      const taper = 0.94 + topBottomEase * 0.04;
      const wobble = Math.sin(y * 8.4 + x * 1.7 + z * 1.2) * 0.0025;
      pos.setX(i, x * taper * cornerSoft + Math.sign(x || 1) * wobble);
      pos.setZ(i, z * taper * cornerSoft - Math.sign(z || 1) * wobble * 0.8);
    }
    pos.needsUpdate = true;
  }

  function glazeColor() {
    const map = {
      raw: 0xb49f84,
      pale: 0xc8dccf,
      lake: 0x9fcac1,
      green: 0x9cca9a,
      gray: 0xaebbb5,
    };
    return map[artifact.dataset.glaze || "raw"] || map.raw;
  }

  function firedGlazeColor() {
    const color = new THREE.Color(glazeColor());
    const fire = artifact.dataset.fire || "medium";
    const failCount = Number.parseInt(artifact.dataset.failCount || "0", 10);
    const isMasterwork = artifact.dataset.masterwork === "true";
    if (fire === "low") {
      color.lerp(new THREE.Color(0xd8ddd1), 0.26);
    } else if (fire === "high") {
      color.multiplyScalar(0.82).lerp(new THREE.Color(0x6e9789), 0.18);
    }
    if (failCount >= 10) {
      color.lerp(new THREE.Color(0x8b8b7b), 0.38);
      color.multiplyScalar(0.84);
    } else if (failCount >= 6) {
      color.lerp(new THREE.Color(0xa6a08e), 0.2);
    }
    if (isMasterwork) {
      color.lerp(new THREE.Color(0xd9f2e6), 0.18);
    }
    return color;
  }

  function drawTextureLine(ctx, points) {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function buildPatternTexture(kind, sealSurface = false) {
    const texCanvas = document.createElement("canvas");
    texCanvas.width = 1024;
    texCanvas.height = 512;
    const ctx = texCanvas.getContext("2d");
    ctx.fillStyle = sealSurface ? "#eeeeee" : "#d8d8d8";
    ctx.fillRect(0, 0, texCanvas.width, texCanvas.height);
    ctx.strokeStyle = sealSurface ? "rgba(54, 72, 64, .34)" : "#4b5851";
    ctx.lineWidth = sealSurface ? 5 : 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = sealSurface ? 0.82 : 1;

    if (kind === "pinch" && handStrokes.length) {
      ctx.strokeStyle = "#5b5b5b";
      ctx.lineWidth = 18;
      handStrokes.forEach((stroke) => {
        if ((stroke.tool || "carve") !== "carve") return;
        const points = stroke.points.map((point) => [512 + point.u * 430, 310 + point.v * 330]);
        drawTextureLine(ctx, points);
      });
      ctx.strokeStyle = "#adadad";
      ctx.lineWidth = 20;
      handStrokes.forEach((stroke) => {
        if (stroke.tool !== "add") return;
        const points = stroke.points.map((point) => [512 + point.u * 430, 310 + point.v * 330]);
        drawTextureLine(ctx, points);
      });
    }

    const yBase = 270;
    if (kind === "wave") {
      for (let band = 0; band < 4; band += 1) {
        const points = [];
        for (let x = 70; x <= 950; x += 18) {
          const y = yBase + band * 42 + Math.sin(x * 0.012 + band * 0.9) * (15 - band * 2);
          points.push([x, y]);
        }
        drawTextureLine(ctx, points);
      }
      ctx.lineWidth = 3.5;
      for (let i = 0; i < 6; i += 1) {
        const cx = 150 + i * 145;
        ctx.beginPath();
        ctx.ellipse(cx, 315 + Math.sin(i) * 16, 48, 22, -0.18, Math.PI * 0.08, Math.PI * 1.1);
        ctx.stroke();
      }
    } else if (kind === "cloud") {
      for (let i = 0; i < 5; i += 1) {
        const cx = 150 + i * 178;
        ctx.beginPath();
        ctx.ellipse(cx, 305, 76, 40, 0, Math.PI * 0.05, Math.PI * 1.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx + 52, 284, 54, 28, 0.08, Math.PI * 0.05, Math.PI * 1.68);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx + 24, 336, 42, 18, -0.08, Math.PI * 0.18, Math.PI * 1.45);
        ctx.stroke();
      }
    } else if (kind === "pinch" && !handStrokes.length) {
      ctx.strokeStyle = "#808080";
    } else if (kind === "pinch") {
      ctx.lineWidth = 8;
      for (let row = 0; row < 3; row += 1) {
        for (let i = 0; i < 8; i += 1) {
          const cx = 88 + i * 122 + (row % 2) * 46;
          const cy = 276 + row * 42 + Math.sin(i * 1.7 + row) * 7;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 34 + Math.sin(i) * 7, 17 + Math.cos(i + row) * 4, Math.sin(i) * 0.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (kind === "lotus") {
      for (let i = 0; i < 8; i += 1) {
        const cx = 64 + i * 128;
        if (sealSurface) {
          const base = 352;
          ctx.beginPath();
          ctx.moveTo(cx - 50, base + 22);
          ctx.quadraticCurveTo(cx - 36, base - 20, cx, base - 34);
          ctx.quadraticCurveTo(cx + 36, base - 20, cx + 50, base + 22);
          ctx.stroke();
          ctx.lineWidth = 2.4;
          drawTextureLine(ctx, [[cx, base - 24], [cx, base + 18]]);
          drawTextureLine(ctx, [[cx, base - 2], [cx - 27, base + 18]]);
          drawTextureLine(ctx, [[cx, base - 2], [cx + 27, base + 18]]);
          ctx.lineWidth = 5;
        } else {
          ctx.beginPath();
          ctx.moveTo(cx, 396);
          ctx.quadraticCurveTo(cx - 52, 326, cx, 242);
          ctx.quadraticCurveTo(cx + 52, 326, cx, 396);
          ctx.stroke();
          ctx.lineWidth = 2.8;
          drawTextureLine(ctx, [[cx, 262], [cx, 386]]);
          drawTextureLine(ctx, [[cx, 318], [cx - 28, 368]]);
          drawTextureLine(ctx, [[cx, 318], [cx + 28, 368]]);
          ctx.lineWidth = 6;
        }
      }
    } else {
      ctx.strokeStyle = "#808080";
    }

    const texture = new THREE.CanvasTexture(texCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.needsUpdate = true;
    return texture;
  }

  function buildSealBodyTexture(kind) {
    const texCanvas = document.createElement("canvas");
    texCanvas.width = 1024;
    texCanvas.height = 1024;
    const ctx = texCanvas.getContext("2d");
    // Keep the body field bright so the motif remains visible under the celadon color.
    ctx.fillStyle = "#d8d8d8";
    ctx.fillRect(0, 0, texCanvas.width, texCanvas.height);
    ctx.strokeStyle = "#36443e";
    ctx.lineWidth = 3.2;
    ctx.globalAlpha = 0.92;
    for (let column = -2; column < 15; column += 1) {
      const x = column * 82 + 28;
      ctx.beginPath();
      for (let y = -40; y <= 1060; y += 28) {
        const offset = Math.sin(y * 0.018 + column * 1.7) * 10 + Math.sin(y * 0.047 + column) * 4;
        if (y === -40) ctx.moveTo(x + offset, y);
        else ctx.lineTo(x + offset, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.44;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 26; i += 1) {
      const y = 20 + i * 41;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(260, y - 14, 680, y + 16, 1024, y - 4);
      ctx.stroke();
    }
    if (kind === "wave") {
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 4;
      for (let row = 0; row < 4; row += 1) {
        ctx.beginPath();
        for (let x = 0; x <= 1024; x += 16) {
          const y = 240 + row * 180 + Math.sin(x * 0.018 + row) * 30;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (kind === "cloud") {
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 4;
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(120 + i * 210, 470, 82, 0.15, Math.PI * 1.8);
        ctx.stroke();
      }
    } else if (kind === "lotus") {
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i += 1) {
        const x = 100 + i * 170;
        ctx.beginPath();
        ctx.moveTo(x, 820);
        ctx.quadraticCurveTo(x - 58, 550, x, 300);
        ctx.quadraticCurveTo(x + 58, 550, x, 820);
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(texCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  function patternDistance(kind, u, v, controls = {}) {
    const density = controls.density || 1;
    const band = controls.band || 1;
    const bandShift = (band - 1) * 0.9;
    const shiftedV = v - bandShift;
    if (kind === "pinch" && handStrokes.length) {
      if (Math.abs(u) > 1.01 || v < -0.92 || v > 0.88) return 99;
      return Math.min(distanceToHandStrokes(u, v, "carve"), distanceToHandStrokes(u, v, "add")) * 0.42;
    }
    if (kind === "pinch") return 99;
    if (shiftedV < -0.58 || shiftedV > -0.06) return 99;
    if (kind === "wave") {
      const du = u * density;
      const d1 = Math.abs(shiftedV - (-0.22 + Math.sin((du + 0.08) * Math.PI * 1.15) * 0.03));
      const d2 = Math.abs(shiftedV - (-0.34 + Math.sin((du - 0.18) * Math.PI * 1.05) * 0.026));
      const d3 = Math.abs(shiftedV - (-0.46 + Math.sin((du + 0.24) * Math.PI * 0.98) * 0.022));
      const f1 = Math.abs(shiftedV - (-0.3 + Math.sin((du - 0.14) * Math.PI * 1.75) * 0.014)) * 1.35;
      const f2 = Math.abs(shiftedV - (-0.43 + Math.sin((du + 0.2) * Math.PI * 1.55) * 0.012)) * 1.35;
      const f3 = Math.abs(shiftedV - (-0.18 + Math.sin((du + 0.28) * Math.PI * 1.9) * 0.01)) * 1.65;
      const crestA = Math.abs(Math.hypot((u + 0.46) / 0.2, (shiftedV + 0.3) / 0.095) - 1) * 0.032;
      const crestB = Math.abs(Math.hypot((u - 0.08) / 0.22, (shiftedV + 0.39) / 0.085) - 1) * 0.034;
      const crestC = Math.abs(Math.hypot((u - 0.54) / 0.18, (shiftedV + 0.3) / 0.078) - 1) * 0.036;
      return Math.min(d1, d2, d3, f1, f2, f3, crestA, crestB, crestC);
    }
    if (kind === "cloud") {
      const du = u * density;
      const d1 = Math.abs(Math.hypot((du + 0.28) / 0.5, (shiftedV + 0.26) / 0.28) - 1);
      const d2 = Math.abs(Math.hypot((du - 0.18) / 0.42, (shiftedV + 0.22) / 0.24) - 1);
      const d3 = Math.abs(Math.hypot((du + 0.02) / 0.24, (shiftedV + 0.28) / 0.13) - 1) * 1.28;
      const tailA = Math.abs(shiftedV - (-0.18 + Math.sin((du + 0.32) * Math.PI * 1.35) * 0.026)) * 1.2;
      const tailB = Math.abs(shiftedV - (-0.42 + Math.sin((du - 0.28) * Math.PI * 1.28) * 0.022)) * 1.2;
      return Math.min(d1, d2, d3, tailA, tailB) * 0.062;
    }
    if (kind === "pinch") {
      const repeat = ((u + 1) * (4.2 * density)) % 1;
      const cell = repeat * 2 - 1;
      const row1 = Math.abs(Math.hypot(cell / 0.46, (shiftedV + 0.22) / 0.1) - 1) * 0.04;
      const row2 = Math.abs(Math.hypot((cell + 0.32) / 0.5, (shiftedV + 0.36) / 0.11) - 1) * 0.04;
      const row3 = Math.abs(Math.hypot((cell - 0.24) / 0.42, (shiftedV + 0.48) / 0.1) - 1) * 0.04;
      const thumbDip = Math.min(
        Math.hypot(cell / 0.42, (shiftedV + 0.22) / 0.08),
        Math.hypot((cell + 0.32) / 0.45, (shiftedV + 0.36) / 0.09),
        Math.hypot((cell - 0.24) / 0.4, (shiftedV + 0.48) / 0.08)
      ) * 0.014;
      return Math.min(row1, row2, row3, thumbDip);
    }
    const repeat = ((u + 1) * (4.0 * density)) % 1;
    const cell = repeat * 2 - 1;
    const base = -0.56;
    const tip = -0.08;
    const t = (shiftedV - base) / (tip - base);
    if (t < 0 || t > 1) return 99;
    const width = Math.max(0.05, Math.sin(t * Math.PI) * 0.62);
    const outline = Math.abs(Math.abs(cell) - width) * 0.036 + Math.max(0, Math.abs(cell) - width - 0.04) * 0.4;
    const centerVein = Math.abs(cell) * 0.06 + Math.max(0, Math.abs(t - 0.5) - 0.48) * 0.08;
    const sideVeinA = Math.abs(cell - width * 0.52) * 0.08 + Math.abs(t - 0.58) * 0.018;
    const sideVeinB = Math.abs(cell + width * 0.52) * 0.08 + Math.abs(t - 0.58) * 0.018;
    const baseLine = Math.abs(t - 0.06) * 0.07 + Math.max(0, Math.abs(cell) - 0.72) * 0.04;
    return Math.min(outline, centerVein, sideVeinA, sideVeinB, baseLine);
  }

  function sealFaceDistance(kind, u, v, controls = {}) {
    const density = controls.density || 1;
    const bandShift = ((controls.band || 1) - 1) * 0.38;
    const shiftedV = v - bandShift;
    const radius = Math.hypot(u, shiftedV);
    if (kind === "pinch" && handStrokes.length) {
      return Math.min(distanceToHandStrokes(u, shiftedV, "carve"), distanceToHandStrokes(u, shiftedV, "add")) * 0.48;
    }
    if (kind === "pinch") return 99;
    if (kind === "wave") {
      const waveA = Math.abs(shiftedV - Math.sin((u * density + 0.12) * Math.PI * 2.2) * 0.13) * 0.9;
      const waveB = Math.abs(shiftedV + 0.32 - Math.sin((u * density - 0.18) * Math.PI * 2.0) * 0.1);
      const waveC = Math.abs(shiftedV - 0.32 - Math.sin((u * density + 0.28) * Math.PI * 1.8) * 0.1);
      return Math.min(waveA, waveB, waveC) * 0.08;
    }
    if (kind === "cloud") {
      const d1 = Math.abs(Math.hypot((u + 0.22) / 0.56, (shiftedV + 0.04) / 0.32) - 1) * 0.05;
      const d2 = Math.abs(Math.hypot((u - 0.24) / 0.46, (shiftedV - 0.04) / 0.26) - 1) * 0.054;
      const d3 = Math.abs(Math.hypot(u / 0.26, (shiftedV + 0.22) / 0.18) - 1) * 0.062;
      const tail = Math.abs(shiftedV + Math.sin((u + 0.1) * Math.PI * 2.0) * 0.08) * 0.12 + Math.max(0, Math.abs(u) - 0.72) * 0.1;
      return Math.min(d1, d2, d3, tail);
    }
    const petals = 6 * Math.max(0.8, Math.min(1.5, density));
    const theta = Math.atan2(shiftedV, u);
    const petalCenter = 0.42 + Math.cos(theta * petals) * 0.1;
    const petalLine = Math.abs(radius - petalCenter) * 0.072;
    const centerRing = Math.abs(radius - 0.18) * 0.07;
    const vein = Math.abs(Math.sin(theta * petals)) * 0.018 + Math.abs(radius - 0.42) * 0.04;
    return Math.min(petalLine, centerRing, vein);
  }

  function smoothStep(edge0, edge1, value) {
    const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
  }

  function softenThrownBody(geometry, intensity = 1) {
    const pos = geometry.attributes.position;
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const maxY = geometry.boundingBox.max.y;

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const radius = Math.hypot(x, z);
      if (radius <= 0.001) continue;

      const theta = Math.atan2(z, x);
      const v = (y - minY) / Math.max(0.001, maxY - minY);
      const bellyMask = Math.sin(Math.PI * Math.max(0, Math.min(1, v)));
      const rimProtect = 1 - smoothStep(0.74, 0.92, v);
      const handThrow = (Math.sin(theta * 5.0 + v * 4.2) * 0.0021 + Math.sin(theta * 9.0 - v * 2.6) * 0.0011) * intensity;
      const sideAngle = Math.atan2(Math.sin(theta + 0.9), Math.cos(theta + 0.9));
      const sideMask = Math.exp(-(sideAngle * sideAngle) / 0.12) * smoothStep(0.2, 0.46, v) * (1 - smoothStep(0.72, 0.88, v));
      const nextRadius = radius + handThrow * bellyMask * rimProtect - sideMask * 0.011 * intensity * rimProtect;

      pos.setX(i, (x / radius) * nextRadius);
      pos.setZ(i, (z / radius) * nextRadius);
    }

    pos.needsUpdate = true;
  }

  function leanThrownBody(geometry, amount) {
    const pos = geometry.attributes.position;
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const maxY = geometry.boundingBox.max.y;
    const span = Math.max(0.001, maxY - minY);

    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const v = (y - minY) / span;
      const rimProtect = 1 - smoothStep(0.62, 0.84, v);
      const lean = (v - 0.18) * amount * rimProtect;
      pos.setX(i, pos.getX(i) + lean);
      pos.setZ(i, pos.getZ(i) - lean * 0.34);
    }

    pos.needsUpdate = true;
  }

  function spoilFailedBody(geometry, failCount) {
    if (failCount < 6) return;
    const pos = geometry.attributes.position;
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const maxY = geometry.boundingBox.max.y;
    const span = Math.max(0.001, maxY - minY);
    const severity = Math.min(1, (failCount - 5) / 7);

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const radius = Math.hypot(x, z);
      if (radius <= 0.001) continue;
      const theta = Math.atan2(z, x);
      const v = (y - minY) / span;
      const sideDent = Math.exp(-Math.pow(theta + 0.92, 2) / 0.18) * smoothStep(0.18, 0.54, v) * (1 - smoothStep(0.68, 0.9, v));
      const rimWarp = smoothStep(0.76, 0.96, v) * (Math.sin(theta * 1.4 + 0.3) * 0.014 + Math.cos(theta * 3.1) * 0.007);
      const bellyWarp = Math.sin(theta * 2.2 + v * 7.5) * 0.01 * smoothStep(0.12, 0.82, v);
      const collapse = -sideDent * 0.06 * severity + rimWarp * severity + bellyWarp * severity;
      const nextRadius = Math.max(0.001, radius + collapse);
      pos.setX(i, (x / radius) * nextRadius);
      pos.setZ(i, (z / radius) * nextRadius);
      if (failCount >= 10) {
        pos.setY(i, y - sideDent * 0.08 * severity);
      }
    }

    pos.needsUpdate = true;
  }

  function carvePatternIntoGeometry(geometry) {
    const activePattern = artifact.dataset.currentPattern || artifact.dataset.pattern || "none";
    const shape = artifact.dataset.shape || "bowl";
    const stepMap = Object.fromEntries((artifact.dataset.patternSteps || "")
      .split(",")
      .filter(Boolean)
      .map((item) => {
        const [name, value] = item.split(":");
        return [name, Number.parseFloat(value) || 0];
      }));
    const controlMap = Object.fromEntries((artifact.dataset.patternControls || "")
      .split(",")
      .filter(Boolean)
      .map((item) => {
        const [name, density, depth, band, brush] = item.split(":");
        return [name, {
          density: Number.parseFloat(density) || 1,
          depth: Number.parseFloat(depth) || 1,
          band: Number.parseFloat(band) || 1,
          brush: Number.parseFloat(brush) || 1,
        }];
      }));
    const patterns = (artifact.dataset.patterns || activePattern)
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && item !== "none");
    if (!patterns.length) return;

    const pos = geometry.attributes.position;
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const maxY = geometry.boundingBox.max.y;
    const colors = [];
    const grooveWidth = 0.028;
    const patternQuality = dataNumber("patternQuality", 1);
    const qualityDepth = Math.max(0.42, Math.min(1.16, patternQuality));

    if (isSealShape(shape)) {
      const spanY = Math.max(0.001, maxY - minY);
      let maxX = 0.001;
      let maxZ = 0.001;
      for (let i = 0; i < pos.count; i += 1) {
        maxX = Math.max(maxX, Math.abs(pos.getX(i)));
        maxZ = Math.max(maxZ, Math.abs(pos.getZ(i)));
      }

      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const u = x / maxX;
        const v = z / maxZ;
        const faceMask = smoothStep(0.18, 0.015, Math.abs(y - minY) / spanY);
        const shapeEdge = shape === "seal-round"
          ? 1 - smoothStep(0.72, 0.98, Math.hypot(u, v))
          : (1 - smoothStep(0.78, 1, Math.max(Math.abs(u), Math.abs(v))));
        let depthDelta = 0;
        let shadeDelta = 0;

        patterns.forEach((pattern) => {
          const baseStep = stepMap[pattern] ?? cssNumber("--pattern-step", 0);
          const step = pattern === "pinch" ? Math.max(baseStep, handStrokes.length ? 1 : 0) : baseStep;
          if (step <= 0) return;
          const controls = controlMap[pattern] || { density: 1, depth: 1, band: 1, brush: 1 };
          const shiftedV = pattern === "pinch" ? v : v - (controls.band - 1) * 0.38;
          const dist = sealFaceDistance(pattern, u, v, controls);
          const addDist = pattern === "pinch" ? distanceToHandStrokes(u, shiftedV, "add") * 0.48 : 99;
          const carveDist = pattern === "pinch" ? distanceToHandStrokes(u, shiftedV, "carve") * 0.48 : dist;
          const eraseDist = pattern === "pinch" ? distanceToHandStrokes(u, shiftedV, "erase") * 0.48 : 99;
          const imprintMask = faceMask * Math.max(0, shapeEdge);
          const eraseStrength = smoothStep(grooveWidth * 1.55, 0, eraseDist) * imprintMask;
          const breakMask = patternQuality < 0.9
            ? Math.max(0.32, 1 - smoothStep(0.0, 0.72, Math.sin((u * 8.0 + v * 7.2) * Math.PI) * 0.5 + 0.5) * (0.9 - patternQuality) * 1.25)
            : 1;
          const carveStrength = Math.max(0, smoothStep(grooveWidth * 1.15, 0, carveDist) * imprintMask * breakMask - eraseStrength);
          const addStrength = Math.max(0, smoothStep(grooveWidth * 1.35, 0, addDist) * imprintMask * breakMask - eraseStrength);
          const fixedStrength = smoothStep(grooveWidth * 1.1, 0, dist) * imprintMask * breakMask;
          const strength = pattern === "pinch" ? Math.max(carveStrength, addStrength) : fixedStrength;
          const borderStrength = smoothStep(0.028, 0, Math.abs((shape === "seal-round" ? Math.hypot(u, v) : Math.max(Math.abs(u), Math.abs(v))) - 0.72)) * imprintMask * 0.45;
          const totalStrength = Math.max(strength, borderStrength);
          const depth = Math.min(0.068, step * 0.0102 * controls.depth * qualityDepth * (pattern === "pinch" && handStrokes.length ? 1.7 : 1));
          const direction = pattern === "pinch" && addStrength > carveStrength ? -1 : 1;
          depthDelta += direction * depth * totalStrength;
          // Keep the ceramic body color stable; the relief and side light carry
          // the depth cue so it does not look like a painted line.
          shadeDelta += -carveStrength * 0.035 + addStrength * 0.012 - fixedStrength * 0.018 - borderStrength * 0.012;
        });

        if (Math.abs(depthDelta) > 0.00001) {
          pos.setY(i, y + depthDelta);
        }
        const shade = Math.max(0.66, Math.min(1.1, 1 + shadeDelta));
        colors.push(shade, shade, shade);
      }

      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      pos.needsUpdate = true;
      return;
    }

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const radius = Math.hypot(x, z);
      const theta = Math.atan2(z, x);
      const v = ((y - minY) / (maxY - minY)) * 2 - 1;
      let radiusDelta = 0;
      let shadeDelta = 0;

      patterns.forEach((pattern) => {
        const baseStep = stepMap[pattern] ?? cssNumber("--pattern-step", 0);
        const step = pattern === "pinch" ? Math.max(baseStep, handStrokes.length ? 1 : 0) : baseStep;
        if (step <= 0) return;
        const controls = controlMap[pattern] || { density: 1, depth: 1, band: 1, brush: 1 };
        const centerTheta = Math.PI / 2;
        const thetaWidth = pattern === "pinch"
          ? Math.PI
          : shape === "jar"
            ? Math.PI
            : shape === "bowl"
              ? Math.PI * 1.02
              : 2.9;
        const angle = Math.atan2(Math.sin(theta - centerTheta), Math.cos(theta - centerTheta));
        const u = angle / thetaWidth;
        const dist = patternDistance(pattern, u, v, controls);
        const shiftedV = pattern === "pinch" ? v : v - (controls.band - 1) * 0.9;
        const addDist = pattern === "pinch" ? distanceToHandStrokes(u, shiftedV, "add") * 0.42 : 99;
        const carveDist = pattern === "pinch" ? distanceToHandStrokes(u, shiftedV, "carve") * 0.42 : dist;
        const eraseDist = pattern === "pinch" ? distanceToHandStrokes(u, shiftedV, "erase") * 0.42 : 99;
        const bodyMask = pattern === "pinch"
          ? smoothStep(-0.95, -0.86, v) * (1 - smoothStep(0.82, 0.94, v))
          : shape === "bowl"
            ? smoothStep(-0.95, -0.82, v) * (1 - smoothStep(0.88, 0.985, v))
            : shape === "cup"
              ? smoothStep(-0.94, -0.8, v) * (1 - smoothStep(0.8, 0.94, v))
              : smoothStep(-0.92, -0.78, v) * (1 - smoothStep(0.7, 0.86, v));
        const edgeMask = pattern === "pinch" ? Math.max(0, 1 - Math.abs(u) * 0.18) : 1;
        const eraseStrength = smoothStep(grooveWidth * 1.45, 0, eraseDist) * edgeMask * bodyMask;
        const breakMask = patternQuality < 0.9
          ? Math.max(0.28, 1 - smoothStep(0.0, 0.72, Math.sin((u * 9.0 + v * 6.0) * Math.PI) * 0.5 + 0.5) * (0.9 - patternQuality) * 1.35)
          : 1;
        const carveStrength = Math.max(0, smoothStep(grooveWidth, 0, carveDist) * edgeMask * bodyMask * breakMask - eraseStrength);
        const addStrength = Math.max(0, smoothStep(grooveWidth * 1.25, 0, addDist) * edgeMask * bodyMask * breakMask - eraseStrength);
        const fixedStrength = smoothStep(grooveWidth, 0, dist) * edgeMask * bodyMask * breakMask;
        const strength = pattern === "pinch" ? Math.max(carveStrength, addStrength) : fixedStrength;
        const shoulderBand = smoothStep(0.032, 0, Math.abs(v + 0.42)) * 0.18 * edgeMask * bodyMask;
        const totalStrength = Math.max(strength, shoulderBand * Math.max(0.4, breakMask));
        const depth = Math.min(0.058, step * 0.0084 * controls.depth * qualityDepth * (pattern === "pinch" && handStrokes.length ? 2.0 : 1));

        if (totalStrength > 0) {
          const direction = pattern === "pinch" && addStrength > carveStrength ? 1 : -1;
          radiusDelta += direction * depth * totalStrength;
        }
        shadeDelta += -carveStrength * 0.028 + addStrength * 0.01 - fixedStrength * 0.014;
      });

      if (Math.abs(radiusDelta) > 0.00001 && radius > 0.001) {
        const nextRadius = Math.max(0.001, radius + radiusDelta);
        pos.setX(i, (x / radius) * nextRadius);
        pos.setZ(i, (z / radius) * nextRadius);
      }

      const shade = Math.max(0.72, Math.min(1.08, 1 + shadeDelta));
      colors.push(shade, shade, shade);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    pos.needsUpdate = true;
  }

  function sealPatternData() {
    const activePattern = artifact.dataset.currentPattern || artifact.dataset.pattern || "none";
    const stepMap = Object.fromEntries((artifact.dataset.patternSteps || "")
      .split(",")
      .filter(Boolean)
      .map((item) => {
        const [name, value] = item.split(":");
        return [name, Number.parseFloat(value) || 0];
      }));
    const controlMap = Object.fromEntries((artifact.dataset.patternControls || "")
      .split(",")
      .filter(Boolean)
      .map((item) => {
        const [name, density, depth, band, brush] = item.split(":");
        return [name, {
          density: Number.parseFloat(density) || 1,
          depth: Number.parseFloat(depth) || 1,
          band: Number.parseFloat(band) || 1,
          brush: Number.parseFloat(brush) || 1,
        }];
      }));
    const patterns = (artifact.dataset.patterns || activePattern)
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && item !== "none")
      .filter((pattern) => {
        const step = pattern === "pinch" ? Math.max(stepMap[pattern] || 0, handStrokes.length ? 1 : 0) : (stepMap[pattern] || 0);
        return step > 0 || pattern === activePattern;
      });
    return { patterns, stepMap, controlMap };
  }

  function addSealLine(groupTarget, points, material) {
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material.clone());
    groupTarget.add(line);
  }

  function addSealLoop(groupTarget, points, material) {
    if (points.length < 3) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geometry, material.clone());
    groupTarget.add(line);
  }

  function addSealVisibleLine(groupTarget, points, material, loop = false) {
    if (points.length < (loop ? 3 : 2)) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const dark = loop ? new THREE.LineLoop(geometry, material.clone()) : new THREE.Line(geometry, material.clone());
    groupTarget.add(dark);
    const highlightMaterial = material.clone();
    highlightMaterial.color = new THREE.Color(0xe8fff4);
    highlightMaterial.opacity = Math.min(0.28, (material.opacity || 0.6) * 0.34);
    const lift = points.map((point) => point.clone().add(new THREE.Vector3(0, -0.002, 0)));
    const highlightGeometry = new THREE.BufferGeometry().setFromPoints(lift);
    const highlight = loop ? new THREE.LineLoop(highlightGeometry, highlightMaterial) : new THREE.Line(highlightGeometry, highlightMaterial);
    groupTarget.add(highlight);
  }

  function makeSealPoint(u, v, y, maxX, maxZ) {
    return new THREE.Vector3(u * maxX, y, v * maxZ);
  }

  function buildSealLetterGroup(shape) {
    const text = (artifact.dataset.sealText || "").trim().slice(0, 12);
    if (!text || !vessel?.geometry) return null;
    vessel.geometry.computeBoundingBox();
    const box = vessel.geometry.boundingBox;
    const maxX = Math.max(0.001, Math.max(Math.abs(box.min.x), Math.abs(box.max.x))) * 0.92;
    const maxZ = Math.max(0.001, Math.max(Math.abs(box.min.z), Math.abs(box.max.z))) * 0.92;
    const size = 768;
    const texCanvas = document.createElement("canvas");
    texCanvas.width = size;
    texCanvas.height = size;
    const ctx = texCanvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(42, 35, 28, .72)";
    ctx.lineWidth = 5;
    ctx.strokeRect(24, 24, size - 48, size - 48);
    const fontMap = {
      serif: '"Songti SC", "SimSun", serif',
      kai: '"KaiTi", "STKaiti", cursive',
      li: '"LiSu", "STLiti", serif',
      seal: '"FZKai-Z03", "STKaiti", serif',
      fangsong: '"FangSong", "仿宋", serif',
    };
    const fontFamily = fontMap[artifact.dataset.sealFont || "serif"] || fontMap.serif;
    const chars = [...text];
    const count = chars.length;
    const columns = count <= 2 ? 1 : count <= 6 ? 2 : 3;
    const rows = Math.ceil(count / columns);
    const cellW = (size - 170) / columns;
    const cellH = (size - 170) / rows;
    const fontSize = Math.min(208, Math.max(58, Math.min(cellW, cellH) * (count <= 2 ? 0.62 : 0.52)));
    ctx.fillStyle = "rgba(42, 35, 28, .94)";
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    chars.forEach((char, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = 85 + cellW * (column + 0.5);
      const y = 85 + cellH * (row + 0.5);
      ctx.fillText(char, x, y);
    });
    const texture = new THREE.CanvasTexture(texCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const groupTarget = new THREE.Group();
    groupTarget.name = "seal-letter-imprint";
    const geometry = shape === "seal-round"
      ? new THREE.CircleGeometry(Math.min(maxX, maxZ) * 0.8, 96)
      : new THREE.PlaneGeometry(maxX * 1.96, maxZ * 1.96);
    const letterMaterial = new THREE.MeshPhysicalMaterial({
      map: texture,
      color: 0xc1b18c,
      roughness: 0.58,
      clearcoat: 0.18,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const letter = new THREE.Mesh(geometry, letterMaterial);
    letter.rotation.x = Math.PI / 2;
    letter.position.y = box.min.y - 0.012;
    groupTarget.add(letter);
    return groupTarget;
  }

  function buildSealPatternLines(shape) {
    const { patterns, stepMap, controlMap } = sealPatternData();
    if (!patterns.length || !vessel?.geometry) return null;
    vessel.geometry.computeBoundingBox();
    const box = vessel.geometry.boundingBox;
    const maxX = Math.max(0.001, Math.max(Math.abs(box.min.x), Math.abs(box.max.x))) * 0.78;
    const maxZ = Math.max(0.001, Math.max(Math.abs(box.min.z), Math.abs(box.max.z))) * 0.78;
    const y = box.min.y + vessel.position.y - 0.012;
    const groupTarget = new THREE.Group();
    groupTarget.name = "seal-imprint-lines";
    const baseMaterial = new THREE.LineBasicMaterial({
      color: artifact.dataset.glaze === "raw" ? 0x3b2b20 : 0x11231f,
      transparent: true,
      opacity: 0.78,
      depthTest: true,
      depthWrite: false,
    });

    const border = [];
    if (shape === "seal-round") {
      for (let i = 0; i < 144; i += 1) {
        const angle = (i / 144) * Math.PI * 2;
        border.push(makeSealPoint(Math.cos(angle) * 0.82, Math.sin(angle) * 0.82, y, maxX, maxZ));
      }
    } else {
      border.push(
        makeSealPoint(-0.78, -0.78, y, maxX, maxZ),
        makeSealPoint(0.78, -0.78, y, maxX, maxZ),
        makeSealPoint(0.78, 0.78, y, maxX, maxZ),
        makeSealPoint(-0.78, 0.78, y, maxX, maxZ)
      );
    }
    addSealVisibleLine(groupTarget, border, baseMaterial, true);

    patterns.forEach((pattern) => {
      const step = pattern === "pinch" ? Math.max(stepMap[pattern] || 0, handStrokes.length ? 1 : 0) : (stepMap[pattern] || 0);
      const controls = controlMap[pattern] || { density: 1, depth: 1, band: 1, brush: 1 };
      const material = baseMaterial.clone();
      material.opacity = Math.min(0.88, 0.24 + Math.max(0, step) * 0.18);

      if (pattern === "pinch" && handStrokes.length) {
        handStrokes.forEach((stroke) => {
          if ((stroke.tool || "carve") === "erase") return;
          const points = (stroke.points || []).map((point) => makeSealPoint(point.u, point.v, y - 0.004, maxX, maxZ));
          addSealVisibleLine(groupTarget, points, material);
        });
        return;
      }

      if (pattern === "wave") {
        for (let row = -1; row <= 1; row += 1) {
          const points = [];
          for (let i = 0; i <= 96; i += 1) {
            const u = -0.72 + (i / 96) * 1.44;
            const v = row * 0.24 + Math.sin((u * controls.density + row * 0.12) * Math.PI * 2.1) * 0.1;
            points.push(makeSealPoint(u, v, y - 0.004, maxX, maxZ));
          }
          addSealVisibleLine(groupTarget, points, material);
        }
        return;
      }

      if (pattern === "cloud") {
        [[-0.26, -0.02, 0.42, 0.28], [0.22, 0.1, 0.34, 0.23], [0.0, -0.24, 0.22, 0.15]].forEach(([cx, cz, rx, rz]) => {
          const points = [];
          for (let i = 0; i < 96; i += 1) {
            const angle = (i / 96) * Math.PI * 2;
            points.push(makeSealPoint(cx + Math.cos(angle) * rx, cz + Math.sin(angle) * rz, y - 0.004, maxX, maxZ));
          }
          addSealVisibleLine(groupTarget, points, material, true);
        });
        return;
      }

      for (let petal = 0; petal < 6; petal += 1) {
        const angle = (petal / 6) * Math.PI * 2;
        const points = [];
        for (let i = 0; i < 64; i += 1) {
          const t = (i / 63) * Math.PI;
          const r = Math.sin(t) * 0.24;
          const forward = -0.08 + Math.cos(t) * 0.44;
          const u = Math.cos(angle) * forward - Math.sin(angle) * r;
          const v = Math.sin(angle) * forward + Math.cos(angle) * r;
          points.push(makeSealPoint(u, v, y - 0.004, maxX, maxZ));
        }
        addSealVisibleLine(groupTarget, points, material);
      }
      const center = [];
      for (let i = 0; i < 80; i += 1) {
        const angle = (i / 80) * Math.PI * 2;
        center.push(makeSealPoint(Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, y - 0.004, maxX, maxZ));
      }
      addSealVisibleLine(groupTarget, center, material, true);
    });

    return groupTarget;
  }

  function rebuildIfNeeded() {
    const key = [
      artifact.dataset.shape,
      artifact.dataset.pattern,
      artifact.dataset.patterns,
      artifact.dataset.patternSteps,
      artifact.dataset.patternControls,
      artifact.dataset.glaze,
      artifact.dataset.fire,
      artifact.dataset.patternTool,
      artifact.dataset.sealText,
      artifact.dataset.sealFont,
      artifact.dataset.currentTab,
      cssNumber("--clay-step", 0),
      cssNumber("--pattern-step", 0),
      cssNumber("--pattern-density", 1),
      cssNumber("--pattern-depth", 1),
      cssNumber("--pattern-brush", 1),
      cssNumber("--pattern-band", 1),
      handStrokeVersion,
      artifact.dataset.clayQuality,
      artifact.dataset.patternQuality,
      artifact.dataset.glazeQuality,
      artifact.dataset.kilnQuality,
      artifact.dataset.failCount,
      artifact.dataset.perfectCount,
      artifact.dataset.masterwork,
      cssNumber("--mouth", 1),
      cssNumber("--belly", 1),
      cssNumber("--height", 1),
    ].join("|");

    if (key === currentKey) return;
    currentKey = key;

    if (vessel) {
      group.remove(vessel);
      vessel.geometry.dispose();
    }
    if (rimRing) {
      group.remove(rimRing);
      rimRing.traverse?.((child) => {
        child.geometry?.dispose?.();
      });
      rimRing.geometry?.dispose?.();
    }
    if (footRing) {
      group.remove(footRing);
      footRing.geometry?.dispose?.();
    }
    if (sealPatternGroup) {
      group.remove(sealPatternGroup);
      sealPatternGroup.traverse((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
      sealPatternGroup = null;
    }
    if (sealLetterGroup) {
      group.remove(sealLetterGroup);
      sealLetterGroup.traverse((child) => {
        child.geometry?.dispose?.();
        child.material?.map?.dispose?.();
        child.material?.dispose?.();
      });
      sealLetterGroup = null;
    }

    vessel = new THREE.Mesh(makeGeometry(), material);
    vessel.rotation.x = 0;
    vessel.position.y = 0.02;
    group.add(vessel);

    const shape = artifact.dataset.shape || "bowl";
    const currentTab = artifact.dataset.currentTab || document.documentElement.dataset.currentTab || "";
    const sealViewKey = `${shape}|${currentTab}|${artifact.dataset.currentPattern || artifact.dataset.pattern || "none"}`;
    if (isSealShape(shape) && currentTab === "pattern" && sealViewKey !== lastSealViewKey) {
      setSealFaceView(true);
      lastSealViewKey = sealViewKey;
    } else if (!isSealShape(shape)) {
      lastSealViewKey = "";
      setSealFaceView(false);
    }
    const clay = cssNumber("--clay-step", 0) / 3;
    const mouth = cssNumber("--mouth", 1);
    const belly = cssNumber("--belly", 1);
    const height = cssNumber("--height", 1);
    if (isSealShape(shape)) {
      const sealRound = shape === "seal-round";
      const sealRect = shape === "seal-rect";
      const knobBase = sealRound
        ? new THREE.CylinderGeometry(0.34, 0.42, 0.12, 64, 2)
        : new THREE.BoxGeometry(sealRect ? 0.42 : 0.62, 0.11, sealRect ? 0.42 : 0.62, 6, 2, 6);
      const knobTop = sealRound
        ? new THREE.CylinderGeometry(0.22, 0.3, 0.18, 48, 2)
        : new THREE.BoxGeometry(sealRect ? 0.26 : 0.4, 0.16, sealRect ? 0.26 : 0.4, 4, 2, 4);
      rimRing = new THREE.Group();
      const base = new THREE.Mesh(knobBase, rimMaterial);
      const top = new THREE.Mesh(knobTop, rimMaterial);
      top.position.y = 0.14;
      rimRing.add(base);
      rimRing.add(top);
      rimRing.position.y = 0.78 * height;
      rimRing.visible = true;
      group.add(rimRing);

      footRing = new THREE.Mesh(
        sealRound
          ? new THREE.TorusGeometry(0.66 * belly, 0.02, 12, 96)
          : new THREE.BoxGeometry(sealRect ? 0.82 * mouth : 1.22 * mouth, 0.035, sealRect ? 0.82 * belly : 1.22 * belly, 4, 1, 4),
        footMaterial
      );
      if (sealRound) footRing.rotation.x = Math.PI / 2;
      footRing.position.y = -0.88 * height;
      footRing.visible = true;
      group.add(footRing);

      sealLetterGroup = buildSealLetterGroup(shape);
      if (sealLetterGroup) group.add(sealLetterGroup);
    } else {
      const rawProfile = profile(shape, clay, mouth, belly, height);
      const top = rawProfile[rawProfile.length - 1];
      const foot = rawProfile[1] || rawProfile[0];

      rimRing = new THREE.Mesh(
        new THREE.TorusGeometry(
          Math.max(0.08, top[0] * (shape === "jar" ? 0.99 : 0.985)),
          shape === "jar" ? 0.011 : 0.013,
          22,
          192
        ),
        rimMaterial
      );
      rimRing.rotation.x = Math.PI / 2;
      rimRing.position.y = top[1] + (shape === "jar" ? 0.02 : 0.018);
      rimRing.visible = true;
      group.add(rimRing);

      footRing = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(0.12, foot[0] * 0.62), 0.018, 10, 96),
        footMaterial
      );
      footRing.rotation.x = Math.PI / 2;
      footRing.position.y = foot[1] - 0.045;
      footRing.visible = shape === "jar";
      group.add(footRing);
    }

    const firedColor = firedGlazeColor();
    material.color.copy(firedColor);
    if (isSealShape(shape) && artifact.dataset.glaze === "raw") {
      material.color.setHex(0x9fb89a);
    }
    footMaterial.color.setHex(artifact.dataset.glaze === "raw" ? 0x4d3828 : 0x1b1712);
    innerMaterial.color.copy(
      artifact.dataset.glaze === "raw"
        ? new THREE.Color(0x1c1510)
        : firedColor.clone().multiplyScalar(0.22).lerp(new THREE.Color(0x020605), 0.62)
    );
    rimMaterial.color.copy(artifact.dataset.glaze === "raw" ? new THREE.Color(0xb49f84) : firedColor);
    const glazeStep = cssNumber("--glaze-step", 0);
    const fired = artifact.dataset.fired === "true";
    const fire = artifact.dataset.fire || "medium";
    const failCount = Number.parseInt(artifact.dataset.failCount || "0", 10);
    const isMasterwork = artifact.dataset.masterwork === "true";
    const fireHeat = fire === "high" ? 1 : fire === "low" ? -1 : 0;
    const glazeQuality = dataNumber("glazeQuality", 1);
    const kilnQuality = dataNumber("kilnQuality", 1);
    const qualityLoss = Math.max(0, 1 - glazeQuality) * 0.16 + Math.max(0, 1 - kilnQuality) * 0.12;
    material.roughness = Math.max(fired ? 0.1 : 0.16, 0.42 - glazeStep * 0.075 - (fired ? 0.04 + fireHeat * 0.035 : 0) + (fire === "low" ? 0.08 : 0) + qualityLoss);
    material.clearcoat = Math.max(0.12, (artifact.dataset.glaze === "raw" ? (isSealShape(shape) ? 0.42 : 0.18) : fired ? 0.86 + Math.max(0, fireHeat) * 0.12 : 0.72 + Math.max(0, fireHeat) * 0.08) * Math.min(1.12, glazeQuality));
    material.clearcoatRoughness = (fire === "high" ? 0.16 : fire === "low" ? 0.34 : 0.24) + Math.max(0, 1 - glazeQuality) * 0.18;
    if (failCount >= 10) {
      material.roughness = 0.56;
      material.clearcoat = 0.24;
      material.clearcoatRoughness = 0.42;
    } else if (failCount >= 6) {
      material.roughness = Math.max(material.roughness, 0.42);
      material.clearcoat = Math.min(material.clearcoat, 0.48);
    } else if (isMasterwork) {
      material.roughness = 0.18;
      material.clearcoat = 0.92;
      material.clearcoatRoughness = 0.11;
    }
    if (patternTexture) patternTexture.dispose();
    const pattern = artifact.dataset.currentPattern || artifact.dataset.pattern || "none";
    const patternStep = pattern === "pinch" ? Math.max(cssNumber("--current-pattern-step", cssNumber("--pattern-step", 0)), handStrokes.length ? 1 : 0) : cssNumber("--current-pattern-step", cssNumber("--pattern-step", 0));
    const sealPatternVisible = isSealShape(shape) && pattern !== "none";
    const patternReady = pattern !== "none" && (patternStep > 0 || sealPatternVisible);
    patternTexture = patternReady
      ? buildPatternTexture(pattern)
      : null;
    material.map = isSealShape(shape) ? patternTexture : null;
    material.bumpMap = patternTexture;
    material.roughnessMap = isSealShape(shape) ? patternTexture : null;
    material.bumpScale = patternTexture
      ? 0.22 * (isSealShape(shape) ? Math.max(0.42, patternStep) : 1) * cssNumber("--pattern-depth", 1) * Math.max(0.45, dataNumber("patternQuality", 1))
      : 0;
    material.needsUpdate = true;

    const fireStep = cssNumber("--kiln-step", 0);
    fireGlow.material.color.setHex(fire === "high" ? 0xf06a3c : fire === "low" ? 0xb7c88f : 0xd9864c);
    fireGlow.material.opacity = fireStep * (fire === "high" ? 0.16 : fire === "low" ? 0.065 : 0.1);
    fireGlow.scale.setScalar(fire === "high" ? 1.18 : fire === "low" ? 0.82 : 1);
    shadow.material.opacity = fire === "high" ? 0.5 : fire === "low" ? 0.34 : 0.42;
    targetRot = 0;
  }

  function resize() {
    const rect = workbench.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new MutationObserver(rebuildIfNeeded);
  observer.observe(artifact, {
    attributes: true,
    attributeFilter: ["data-shape", "data-current-tab", "data-pattern", "data-patterns", "data-pattern-steps", "data-glaze", "data-fire", "data-seal-text", "data-seal-font", "data-clay-quality", "data-pattern-quality", "data-glaze-quality", "data-kiln-quality", "data-fail-count", "data-perfect-count", "data-masterwork", "style"],
  });

  canvas.addEventListener("pointerdown", (event) => {
    event.__celadonHandled = true;
    updateBrushCursor(event);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartRot = userRot;
    dragStartPitch = userPitch;
    isRotating = false;
    if (isHandCarveMode()) {
      beginHandStroke(event);
      event.preventDefault();
    } else if (activePointers.size === 2) {
      activeHandStroke = null;
      const points = [...activePointers.values()];
      pinchStartDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartZoom = userZoom;
    } else if (beginHandStroke(event)) {
      event.preventDefault();
    } else {
      isRotating = true;
      event.preventDefault();
    }
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    event.__celadonHandled = true;
    updateBrushCursor(event);
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (isHandCarveMode()) {
      if (addHandStrokePoint(event)) event.preventDefault();
      return;
    }
    if (activePointers.size === 2) {
      const points = [...activePointers.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchStartDistance > 0) {
        userZoom = Math.max(0.72, Math.min(4.65, pinchStartZoom * distance / pinchStartDistance));
      }
      return;
    }
    if (addHandStrokePoint(event)) {
      event.preventDefault();
      return;
    }
    if (!isRotating) return;
    const rect = canvas.getBoundingClientRect();
    userRot = dragStartRot + ((event.clientX - dragStartX) / Math.max(1, rect.width)) * Math.PI * 2;
    const shape = artifact.dataset.shape || "bowl";
    const pitchLimit = isSealShape(shape) ? 2.35 : 0.85;
    const pitchRange = isSealShape(shape) ? Math.PI * 1.45 : Math.PI * 0.9;
    userPitch = Math.max(-pitchLimit, Math.min(pitchLimit, dragStartPitch + ((event.clientY - dragStartY) / Math.max(1, rect.height)) * pitchRange));
    event.preventDefault();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    canvas.addEventListener(type, (event) => {
      activePointers.delete(event.pointerId);
      if (activePointers.size === 0) {
        activeHandStroke = null;
        activeHandPointerId = null;
        isRotating = false;
      }
      if (type !== "pointerup") brushCursor.dataset.show = "false";
    });
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    userZoom = Math.max(0.72, Math.min(4.65, userZoom - event.deltaY * 0.0012));
  }, { passive: false });

  sealViewToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isSealShape(artifact.dataset.shape || "bowl")) return;
    setSealFaceView(!sealFaceView);
  });

  canvas.addEventListener("pointerout", () => {
    brushCursor.dataset.show = "false";
  });

  document.addEventListener("celadon-tool-command", (event) => {
    if (event.detail?.command !== "undo" || !handStrokes.length) return;
    handStrokes.pop();
    activeHandStroke = null;
    handStrokeVersion += 1;
    currentKey = "";
    window.__celadonCarveCount = handStrokes.length;
  });

  window.addEventListener("resize", resize);
  resize();
  rebuildIfNeeded();

  function tick(time) {
    rebuildIfNeeded();
    const showcasing = document.documentElement.classList.contains("showcase");
    const targetScale = (showcasing ? 0.84 : 0.9) * userZoom;
    groupScale += (targetScale - groupScale) * 0.06;
    group.scale.setScalar(groupScale);
    group.rotation.x += (userPitch - group.rotation.x) * 0.12;
    group.rotation.y += (userRot + targetRot + Math.sin(time * 0.00045) * (showcasing ? 0.06 : 0.025) - group.rotation.y) * 0.12;
    group.position.y += (((showcasing ? 0.1 : 0) + Math.sin(time * 0.0012) * 0.025) - group.position.y) * 0.08;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}




