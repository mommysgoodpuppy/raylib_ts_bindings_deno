import raylib from "./raylib_bindings.ts";

const DEFAULT_RAYLIB_PATH = new URL(
  "./raylib-5.5_macos/lib/libraylib.dylib",
  import.meta.url,
).pathname;

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 720;
const SURFACE_WIDTH = 1024;
const SURFACE_HEIGHT = 1024;

function main() {
  const raylibPath = Deno.args[0] ?? DEFAULT_RAYLIB_PATH;
  const hidden = Deno.args.includes("--hidden");

  raylib.loadRaylib(raylibPath);

  let windowInitialized = false;
  let renderTarget: raylib.RenderTexture2D | null = null;

  try {
    if (hidden) {
      raylib.SetConfigFlags(raylib.ConfigFlags.FLAG_WINDOW_HIDDEN);
    }

    raylib.H.InitWindow(WINDOW_WIDTH, WINDOW_HEIGHT, "raylib OpenGL surface demo");
    windowInitialized = true;
    raylib.SetTargetFPS(60);

    renderTarget = raylib.H.LoadRenderTexture(SURFACE_WIDTH, SURFACE_HEIGHT);
    if (!raylib.H.IsRenderTextureValid(renderTarget)) {
      throw new Error("RenderTexture is not valid");
    }

    console.log(
      JSON.stringify(
        {
          note: "These are the underlying OpenGL object names managed by raylib.",
          framebufferObject: renderTarget.id,
          colorTextureObject: renderTarget.texture.id,
          depthAttachmentObject: renderTarget.depth.id,
          colorTextureSize: {
            width: renderTarget.texture.width,
            height: renderTarget.texture.height,
          },
        },
        null,
        2,
      ),
    );

    const previewSource: raylib.Rectangle = {
      x: 0,
      y: 0,
      width: renderTarget.texture.width,
      // RenderTexture content is upside down when sampled directly.
      height: -renderTarget.texture.height,
    };
    const previewPosition: raylib.Vector2 = { x: 80, y: 80 };

    while (!raylib.WindowShouldClose()) {
      const time = raylib.GetTime();
      const pulse = 0.5 + Math.sin(time * 2) * 0.25;
      const accent = raylib.H.Fade(raylib.SKYBLUE, pulse);
      const spin = time * 45;

      raylib.H.BeginTextureMode(renderTarget);
      raylib.H.ClearBackground({ r: 17, g: 24, b: 39, a: 255 });
      raylib.H.DrawText("raylib offscreen surface", 56, 48, 42, raylib.RAYWHITE);
      raylib.H.DrawText(
        `GL texture id: ${renderTarget.texture.id}`,
        56,
        102,
        28,
        raylib.H.Fade(raylib.WHITE, 0.85),
      );
      raylib.H.DrawRectangleRounded(
        { x: 56, y: 168, width: 912, height: 300 },
        0.12,
        16,
        { r: 30, g: 41, b: 59, a: 255 },
      );
      raylib.H.DrawRectangleRoundedLinesEx(
        { x: 56, y: 168, width: 912, height: 300 },
        0.12,
        16,
        4,
        accent,
      );
      raylib.H.DrawCircle(256, 320, 88, accent);
      raylib.H.DrawRectangleRounded(
        { x: 416, y: 232, width: 248, height: 132 },
        0.2,
        16,
        raylib.H.Fade(raylib.ORANGE, 0.85),
      );
      raylib.H.DrawText("Render to texture", 444, 278, 28, raylib.BLACK);
      raylib.H.DrawRectangleRounded(
        { x: 740, y: 220, width: 132, height: 132 },
        0.25,
        16,
        raylib.H.Fade(raylib.GREEN, 0.9),
      );
      raylib.H.DrawRectangleRoundedLinesEx(
        { x: 740 + Math.sin(time) * 40, y: 220, width: 132, height: 132 },
        0.25,
        16,
        6,
        raylib.H.Fade(raylib.YELLOW, 0.95),
      );
      raylib.H.EndTextureMode();

      raylib.BeginDrawing();
      raylib.H.ClearBackground(raylib.BLACK);
      raylib.H.DrawText("Preview window sampling the same OpenGL texture", 80, 28, 28, raylib.RAYWHITE);
      raylib.H.DrawText(
        hidden
          ? "Window was requested hidden, but this preview still shows if the platform keeps it visible."
          : "Pass --hidden to request a hidden context window for overlay-style setups.",
        80,
        620,
        20,
        raylib.H.Fade(raylib.WHITE, 0.8),
      );
      raylib.H.DrawTextureRec(renderTarget.texture, previewSource, previewPosition, raylib.WHITE);
      raylib.H.DrawRectangleRoundedLinesEx(
        { x: 76, y: 76, width: SURFACE_WIDTH + 8, height: SURFACE_HEIGHT + 8 },
        0.02,
        8,
        4,
        raylib.H.Fade(raylib.WHITE, 0.85),
      );
      raylib.H.DrawText(
        `Render size ${raylib.H.GetRenderWidth()}x${raylib.H.GetRenderHeight()}  spin ${spin.toFixed(1)} deg`,
        80,
        660,
        22,
        raylib.H.Fade(raylib.SKYBLUE, 0.95),
      );
      raylib.EndDrawing();
    }
  } finally {
    if (renderTarget !== null) {
      raylib.H.UnloadRenderTexture(renderTarget);
    }
    if (windowInitialized) {
      raylib.CloseWindow();
    }
    raylib.unloadRaylib();
  }
}

if (import.meta.main) {
  main();
}
