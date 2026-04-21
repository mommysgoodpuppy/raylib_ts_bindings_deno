import raylib from "./raylib_bindings.ts";

const DEFAULT_RAYLIB_PATH = new URL(
  "./raylib-5.5_macos/lib/libraylib.dylib",
  import.meta.url,
).pathname;

type ArenaBox = {
  center: raylib.Vector3;
  size: raylib.Vector3;
};

type Pickup = {
  basePosition: raylib.Vector3;
  collected: boolean;
};

const PLAYER_SIZE: raylib.Vector3 = { x: 1.2, y: 1.8, z: 1.2 };
const PLAYER_START: raylib.Vector3 = { x: -8, y: PLAYER_SIZE.y / 2, z: 0 };

const WALLS: ArenaBox[] = [
  { center: { x: 0, y: 1.5, z: -10 }, size: { x: 20, y: 3, z: 1 } },
  { center: { x: 0, y: 1.5, z: 10 }, size: { x: 20, y: 3, z: 1 } },
  { center: { x: -10, y: 1.5, z: 0 }, size: { x: 1, y: 3, z: 20 } },
  { center: { x: 10, y: 1.5, z: 0 }, size: { x: 1, y: 3, z: 20 } },
  { center: { x: -4, y: 1.5, z: -2 }, size: { x: 2, y: 3, z: 5 } },
  { center: { x: 4, y: 1.5, z: 3 }, size: { x: 2, y: 3, z: 6 } },
  { center: { x: 0, y: 1.5, z: 0 }, size: { x: 3, y: 3, z: 2 } },
];

const PICKUP_LAYOUT: raylib.Vector3[] = [
  { x: -7, y: 0.8, z: -7 },
  { x: 7, y: 0.8, z: -7 },
  { x: -7, y: 0.8, z: 7 },
  { x: 7, y: 0.8, z: 7 },
  { x: 0, y: 0.8, z: -6 },
  { x: 0, y: 0.8, z: 6 },
];

function cloneVec3(v: raylib.Vector3): raylib.Vector3 {
  return { x: v.x, y: v.y, z: v.z };
}

function vec3Add(a: raylib.Vector3, b: raylib.Vector3): raylib.Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vec3Scale(v: raylib.Vector3, scalar: number): raylib.Vector3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

function vec3Normalize(v: raylib.Vector3): raylib.Vector3 {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function makeBoundingBox(center: raylib.Vector3, size: raylib.Vector3) {
  const half = vec3Scale(size, 0.5);
  return {
    min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
    max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z },
  };
}

function createPickups(): Pickup[] {
  return PICKUP_LAYOUT.map((position) => ({
    basePosition: cloneVec3(position),
    collected: false,
  }));
}

function main() {
  const raylibPath = Deno.args[0] ?? DEFAULT_RAYLIB_PATH;
  const title = "raylib ffi 3D collectathon";
  const instructions = "WASD move  SHIFT sprint  Mouse wheel zoom  R restart";
  const goal = "Collect every orb in the arena";
  const winText = "Arena cleared!";
  const restartText = "Press R to play again";

  raylib.loadRaylib(raylibPath);

  let windowInitialized = false;

  try {
    raylib.SetConfigFlags(raylib.ConfigFlags.FLAG_WINDOW_RESIZABLE | raylib.ConfigFlags.FLAG_MSAA_4X_HINT);
    raylib.H.InitWindow(1280, 720, title);
    windowInitialized = true;
    raylib.SetTargetFPS(60);

    const floorColor = raylib.LIGHTGRAY;
    const wallFill = raylib.SKYBLUE;
    const wallWire = raylib.DARKGRAY;
    const playerColor = raylib.BLUE;
    const playerWire = raylib.BLACK;
    const textColor = raylib.BLACK;
    const hudColor = raylib.H.Fade(raylib.WHITE, 0.82);
    const goalColor = raylib.DARKGRAY;
    const winColor = raylib.GREEN;
    const dangerColor = raylib.RED;

    let playerPosition = cloneVec3(PLAYER_START);
    let cameraDistance = 14;
    let pickups = createPickups();
    let collectedCount = 0;

    while (!raylib.WindowShouldClose()) {
      const dt = raylib.GetFrameTime();
      const time = raylib.GetTime();

      if (raylib.IsKeyPressed(raylib.KeyboardKey.KEY_R)) {
        playerPosition = cloneVec3(PLAYER_START);
        pickups = createPickups();
        collectedCount = 0;
      }

      cameraDistance = Math.max(7, Math.min(22, cameraDistance - raylib.GetMouseWheelMove() * 1.5));

      const input = {
        x: (raylib.IsKeyDown(raylib.KeyboardKey.KEY_D) ? 1 : 0) - (raylib.IsKeyDown(raylib.KeyboardKey.KEY_A) ? 1 : 0),
        z: (raylib.IsKeyDown(raylib.KeyboardKey.KEY_S) ? 1 : 0) - (raylib.IsKeyDown(raylib.KeyboardKey.KEY_W) ? 1 : 0),
      };
      const move = vec3Normalize({ x: input.x, y: 0, z: input.z });
      const speed = raylib.IsKeyDown(raylib.KeyboardKey.KEY_LEFT_SHIFT) ? 8.5 : 5.0;
      const candidatePosition = vec3Add(playerPosition, vec3Scale(move, speed * dt));
      const candidateBox = makeBoundingBox(candidatePosition, PLAYER_SIZE);
      const blocked = WALLS.some((wall) =>
        raylib.H.CheckCollisionBoxes(candidateBox, makeBoundingBox(wall.center, wall.size))
      );

      if (!blocked) {
        playerPosition = candidatePosition;
      }

      for (const pickup of pickups) {
        if (pickup.collected) continue;
        const bobOffset = Math.sin(time * 2.5 + pickup.basePosition.x) * 0.2;
        const pickupCenter = {
          x: pickup.basePosition.x,
          y: pickup.basePosition.y + bobOffset,
          z: pickup.basePosition.z,
        };
        const hit = raylib.H.CheckCollisionBoxes(
          makeBoundingBox(playerPosition, PLAYER_SIZE),
          makeBoundingBox(pickupCenter, { x: 1, y: 1, z: 1 }),
        );
        if (hit) {
          pickup.collected = true;
          collectedCount += 1;
        }
      }

      const allCollected = collectedCount === pickups.length;
      const camera = {
        position: {
          x: playerPosition.x + cameraDistance * 0.8,
          y: 10 + cameraDistance * 0.35,
          z: playerPosition.z + cameraDistance,
        },
        target: {
          x: playerPosition.x,
          y: playerPosition.y + 1,
          z: playerPosition.z,
        },
        up: { x: 0, y: 1, z: 0 },
        fovy: 55,
        projection: raylib.CameraProjection.CAMERA_PERSPECTIVE,
      } satisfies raylib.Camera3D;

      const scoreText = `orbs ${collectedCount}/${pickups.length}`;
      const statusColor = allCollected ? winColor : goalColor;

      raylib.BeginDrawing();
      raylib.H.ClearBackground(raylib.RAYWHITE);

      raylib.H.BeginMode3D(camera);
      raylib.H.DrawPlane({ x: 0, y: 0, z: 0 }, { x: 24, y: 24 }, floorColor);
      raylib.DrawGrid(24, 1);

      for (const wall of WALLS) {
        raylib.H.DrawCubeV(wall.center, wall.size, wallFill);
        raylib.H.DrawCubeWiresV(wall.center, wall.size, wallWire);
      }

      for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (pickup.collected) continue;
        const bobOffset = Math.sin(time * 2.5 + i) * 0.2;
        const pickupColor = raylib.H.Fade(raylib.ORANGE, 0.65 + Math.sin(time * 4 + i) * 0.2);
        const center = {
          x: pickup.basePosition.x,
          y: pickup.basePosition.y + bobOffset,
          z: pickup.basePosition.z,
        };
        raylib.H.DrawSphere(center, 0.5, pickupColor);
        raylib.H.DrawSphereWires(center, 0.55, 8, 8, raylib.YELLOW);
      }

      raylib.H.DrawCubeV(playerPosition, PLAYER_SIZE, playerColor);
      raylib.H.DrawCubeWiresV(playerPosition, PLAYER_SIZE, playerWire);
      raylib.EndMode3D();

      raylib.H.DrawRectangle(16, 16, 420, 104, hudColor);
      raylib.H.DrawText(instructions, 30, 28, 20, textColor);
      raylib.H.DrawText(goal, 30, 54, 20, goalColor);
      raylib.H.DrawText(scoreText, 30, 80, 24, textColor);
      raylib.H.DrawText(
        allCollected ? "All pickups collected" : "Find the glowing orbs",
        230,
        80,
        24,
        statusColor,
      );
      raylib.DrawFPS(1180, 16);

      if (allCollected) {
        const winWidth = raylib.H.MeasureText(winText, 40);
        const restartWidth = raylib.H.MeasureText(restartText, 24);
        const centerX = Math.floor((raylib.GetScreenWidth() - winWidth) / 2);
        const restartX = Math.floor((raylib.GetScreenWidth() - restartWidth) / 2);
        raylib.H.DrawRectangle(centerX - 20, 140, winWidth + 40, 92, raylib.H.Fade(raylib.WHITE, 0.9));
        raylib.H.DrawText(winText, centerX, 156, 40, winColor);
        raylib.H.DrawText(restartText, restartX, 198, 24, dangerColor);
      }

      raylib.EndDrawing();
    }
  } finally {
    if (windowInitialized) {
      raylib.CloseWindow();
    }
    raylib.unloadRaylib();
  }
}

if (import.meta.main) {
  main();
}
