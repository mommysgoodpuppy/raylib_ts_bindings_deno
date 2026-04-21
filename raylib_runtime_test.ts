import { assert, assertEquals } from "jsr:@std/assert";

import {
  Color,
  ColorToInt,
  Fade,
  GetColor,
  GetRandomValue,
  SetTraceLogLevel,
  TextLength,
  loadRaylib,
  unloadRaylib,
} from "./raylib_bindings.ts";
import { createCString } from "./utils.ts";

const RAYLIB_DYLIB_PATH = new URL(
  "./raylib-5.5_macos/lib/libraylib.dylib",
  import.meta.url,
).pathname;

Deno.test("raylib bindings load and call runtime symbols", () => {
  loadRaylib(RAYLIB_DYLIB_PATH);

  try {
    SetTraceLogLevel(0);

    assertEquals(GetRandomValue(7, 7), 7);
    const [textPointer, textHandle] = createCString("raylib ffi");
    void textHandle;
    assertEquals(TextLength(textPointer), 10);

    const colorBytes = GetColor(0x11223344);
    const color = Color.fromBytes(colorBytes);
    assertEquals(color, { r: 0x11, g: 0x22, b: 0x33, a: 0x44 });

    assertEquals(ColorToInt(Color.toBytes(color)), 0x11223344);

    const faded = Color.fromBytes(
      Fade(
        Color.toBytes({ r: 255, g: 128, b: 64, a: 255 }),
        0.5,
      ),
    );
    assertEquals(faded, { r: 255, g: 128, b: 64, a: 127 });

    const colorHandle = Color.createPointer(color);
    assert(colorHandle.pointer !== null);
    assertEquals(colorHandle.read(), color);

    colorHandle.write(faded);
    assertEquals(colorHandle.read(), faded);
  } finally {
    unloadRaylib();
  }
});
