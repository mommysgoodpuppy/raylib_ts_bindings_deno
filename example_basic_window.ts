import {
  BeginDrawing,
  ClearBackground,
  CloseWindow,
  Color,
  DrawCircle,
  DrawFPS,
  DrawText,
  EndDrawing,
  Fade,
  GetScreenWidth,
  GetTime,
  InitWindow,
  MeasureText,
  SetTargetFPS,
  WindowShouldClose,
  loadRaylib,
  unloadRaylib,
} from "./raylib_bindings.ts";
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

  loadRaylib(raylibPath);

  let windowInitialized = false;

  try {
    InitWindow(960, 540, titlePointer);
    windowInitialized = true;
    SetTargetFPS(60);

    const textColor = Color.toBytes({ r: 40, g: 44, b: 52, a: 255 });
    const baseAccent = Color.toBytes({ r: 0, g: 121, b: 241, a: 255 });

    while (!WindowShouldClose()) {
      const time = GetTime();
      const pulse = 0.55 + Math.sin(time * 2) * 0.25;
      const accent = Fade(baseAccent, pulse);
      const messageWidth = MeasureText(messagePointer, 32);
      const hintWidth = MeasureText(hintPointer, 20);
      const centerX = Math.floor((GetScreenWidth() - messageWidth) / 2);
      const hintX = Math.floor((GetScreenWidth() - hintWidth) / 2);
      const circleX = Math.floor(480 + Math.sin(time) * 180);

      BeginDrawing();
      ClearBackground(Color.toBytes({ r: 245, g: 245, b: 245, a: 255 }));
      DrawText(messagePointer, centerX, 170, 32, accent);
      DrawText(hintPointer, hintX, 220, 20, textColor);
      DrawCircle(circleX, 320, 42, accent);
      DrawFPS(16, 16);
      EndDrawing();
    }
  } finally {
    if (windowInitialized) {
      CloseWindow();
    }
    unloadRaylib();
  }
}

if (import.meta.main) {
  main();
}
