import raylib from "./raylib_bindings.ts";
import { createCString } from "./utils.ts";

const DEFAULT_RAYLIB_PATH = new URL(
  "./raylib-5.5_macos/lib/libraylib.dylib",
  import.meta.url,
).pathname;

function main() {
  const raylibPath = Deno.args[0] ?? DEFAULT_RAYLIB_PATH;
  const [titlePointer, titleHandle] = createCString("raylib ffi bindings demo");
  const [messagePointer, messageHandle] = createCString("Hello from raylib via Deno FFI");
  const [hintPointer, hintHandle] = createCString("Close the window or press ESC to exit");

  // Keep the backing buffers alive for the duration of the app.
  void titleHandle;
  void messageHandle;
  void hintHandle;

  raylib.loadRaylib(raylibPath);

  let windowInitialized = false;

  try {
    raylib.InitWindow(960, 540, titlePointer);
    windowInitialized = true;
    raylib.SetTargetFPS(60);

    const textColor = raylib.Color.toBytes({ r: 40, g: 44, b: 52, a: 255 });
    const baseAccent = raylib.Color.toBytes({ r: 0, g: 121, b: 241, a: 255 });

    while (!raylib.WindowShouldClose()) {
      const time = raylib.GetTime();
      const pulse = 0.55 + Math.sin(time * 2) * 0.25;
      const accent = raylib.Fade(baseAccent, pulse);
      const messageWidth = raylib.MeasureText(messagePointer, 32);
      const hintWidth = raylib.MeasureText(hintPointer, 20);
      const centerX = Math.floor((raylib.GetScreenWidth() - messageWidth) / 2);
      const hintX = Math.floor((raylib.GetScreenWidth() - hintWidth) / 2);
      const circleX = Math.floor(480 + Math.sin(time) * 180);

      raylib.BeginDrawing();
      raylib.ClearBackground(raylib.Color.toBytes({ r: 245, g: 245, b: 245, a: 255 }));
      raylib.DrawText(messagePointer, centerX, 170, 32, accent);
      raylib.DrawText(hintPointer, hintX, 220, 20, textColor);
      raylib.DrawCircle(circleX, 320, 42, accent);
      raylib.DrawFPS(16, 16);
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
