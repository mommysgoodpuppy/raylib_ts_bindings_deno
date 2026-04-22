const API_JSON_PATH_CANDIDATES = [
  "submodules/raylib/tools/rlparser/output/raylib_api.json",
  "submodules/raylib/parser/output/raylib_api.json",
] as const;
const OUTPUT_PATH = "raylib_bindings.ts";

const MANUAL_FUNCTION_OVERRIDES: Array<{
  after?: string;
  function: RaylibFunction;
}> = [
  {
    after: "rlGetMatrixViewOffsetStereo",
    function: {
      name: "rlSetMatrixProjection",
      description: "Set a custom projection matrix (replaces internal projection matrix)",
      returnType: "void",
      params: [{ type: "Matrix", name: "projection" }],
    },
  },
  {
    after: "rlSetMatrixProjection",
    function: {
      name: "rlSetMatrixModelview",
      description: "Set a custom modelview matrix (replaces internal modelview matrix)",
      returnType: "void",
      params: [{ type: "Matrix", name: "view" }],
    },
  },
];

const PRIMITIVE_TYPE_INFO: Record<string, { ffi: string; ts: string; runtimeTs: string }> = {
  void: { ffi: "void", ts: "void", runtimeTs: "void" },
  bool: { ffi: "bool", ts: "CBool", runtimeTs: "boolean" },
  _Bool: { ffi: "bool", ts: "CBool", runtimeTs: "boolean" },
  char: { ffi: "i8", ts: "CChar", runtimeTs: "number" },
  "signed char": { ffi: "i8", ts: "CSignedChar", runtimeTs: "number" },
  "unsigned char": { ffi: "u8", ts: "CUChar", runtimeTs: "number" },
  short: { ffi: "i16", ts: "CShort", runtimeTs: "number" },
  "short int": { ffi: "i16", ts: "CShortInt", runtimeTs: "number" },
  "unsigned short": { ffi: "u16", ts: "CUShort", runtimeTs: "number" },
  "unsigned short int": { ffi: "u16", ts: "CUShortInt", runtimeTs: "number" },
  int: { ffi: "i32", ts: "CInt", runtimeTs: "number" },
  "unsigned int": { ffi: "u32", ts: "CUInt", runtimeTs: "number" },
  long: { ffi: "i64", ts: "CLong", runtimeTs: "bigint" },
  "unsigned long": { ffi: "u64", ts: "CULong", runtimeTs: "bigint" },
  "long long": { ffi: "i64", ts: "CLongLong", runtimeTs: "bigint" },
  "long long int": { ffi: "i64", ts: "CLongLongInt", runtimeTs: "bigint" },
  "unsigned long long": { ffi: "u64", ts: "CULongLong", runtimeTs: "bigint" },
  "unsigned long long int": { ffi: "u64", ts: "CULongLongInt", runtimeTs: "bigint" },
  float: { ffi: "f32", ts: "CFloat", runtimeTs: "number" },
  double: { ffi: "f64", ts: "CDouble", runtimeTs: "number" },
  size_t: { ffi: "usize", ts: "CSizeT", runtimeTs: "number | bigint" },
  ssize_t: { ffi: "isize", ts: "CSSizeT", runtimeTs: "number | bigint" },
  intptr_t: { ffi: "isize", ts: "CIntPtrT", runtimeTs: "number | bigint" },
  uintptr_t: { ffi: "usize", ts: "CUIntPtrT", runtimeTs: "number | bigint" },
  int8_t: { ffi: "i8", ts: "CInt8T", runtimeTs: "number" },
  uint8_t: { ffi: "u8", ts: "CUInt8T", runtimeTs: "number" },
  int16_t: { ffi: "i16", ts: "CInt16T", runtimeTs: "number" },
  uint16_t: { ffi: "u16", ts: "CUInt16T", runtimeTs: "number" },
  int32_t: { ffi: "i32", ts: "CInt32T", runtimeTs: "number" },
  uint32_t: { ffi: "u32", ts: "CUInt32T", runtimeTs: "number" },
  int64_t: { ffi: "i64", ts: "CInt64T", runtimeTs: "bigint" },
  uint64_t: { ffi: "u64", ts: "CUInt64T", runtimeTs: "bigint" },
  va_list: { ffi: "pointer", ts: "Deno.PointerValue<unknown>", runtimeTs: "Deno.PointerValue<unknown>" },
  "...": { ffi: "pointer", ts: "unknown", runtimeTs: "unknown" },
};

const PRIMITIVE_TYPES = new Set(Object.keys(PRIMITIVE_TYPE_INFO));

type RaylibDefine = {
  name: string;
  type: string;
  value: unknown;
  description?: string;
};

type RaylibField = {
  type: string;
  name: string;
  description?: string;
};

type RaylibStruct = {
  name: string;
  description?: string;
  fields: RaylibField[];
};

type RaylibAlias = {
  type: string;
  name: string;
  description?: string;
};

type RaylibEnumValue = {
  name: string;
  value: number;
  description?: string;
};

type RaylibEnum = {
  name: string;
  description?: string;
  values: RaylibEnumValue[];
};

type RaylibCallback = {
  name: string;
  description?: string;
  returnType: string;
  params?: RaylibField[];
};

type RaylibFunction = {
  name: string;
  description?: string;
  returnType: string;
  params?: RaylibField[];
};

type RaylibApi = {
  defines: RaylibDefine[];
  structs: RaylibStruct[];
  aliases: RaylibAlias[];
  enums: RaylibEnum[];
  callbacks: RaylibCallback[];
  functions: RaylibFunction[];
};

type ParsedType = {
  original: string;
  isConst: boolean;
  pointerDepth: number;
  arrays: number[];
  core: string;
};

type AliasInfo = {
  name: string;
  type: string;
  isPointerAlias: boolean;
};

type ResolveResult =
  | { kind: "primitive"; name: string }
  | { kind: "struct"; name: string }
  | { kind: "enum"; name: string }
  | { kind: "callback"; name: string }
  | { kind: "opaque"; name: string }
  | { kind: "alias"; name: string; alias: AliasInfo }
  | { kind: "unknown"; name: string };

type FfiResolution =
  | { ok: true; ffi: string }
  | { ok: false; reason: string };

type UnsupportedItem = {
  name: string;
  reason: string;
};

type GeneratedCallback = {
  name: string;
  params: string[];
  result: string;
};

type GeneratedFunction = {
  name: string;
  params: string[];
  result: string;
};

type ManualStructCandidate = {
  name: string;
  description?: string;
  returnType: string;
  params: RaylibField[];
  byValueReturn: string | null;
  byValueParams: Array<{ name: string; type: string; struct: string }>;
};

type GenerationContext = {
  structs: Map<string, RaylibStruct>;
  aliases: Map<string, AliasInfo>;
  enums: Set<string>;
  callbacks: Map<string, RaylibCallback>;
  opaqueTypes: Set<string>;
  supportedCallbacks: Map<string, GeneratedCallback>;
};

const RESERVED_IDENTIFIERS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

async function resolveApiJsonPath(path?: string): Promise<string> {
  if (path !== undefined) return path;

  for (const candidate of API_JSON_PATH_CANDIDATES) {
    try {
      await Deno.stat(candidate);
      return candidate;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }

  throw new Error(
    `Could not locate raylib_api.json in any known location: ${API_JSON_PATH_CANDIDATES.join(", ")}`,
  );
}

export async function loadRaylibApi(path?: string): Promise<RaylibApi> {
  const resolvedPath = await resolveApiJsonPath(path);
  const raw = await Deno.readTextFile(resolvedPath);
  const sanitized = sanitizeRaylibApiJson(raw);
  return applyManualFunctionOverrides(JSON.parse(sanitized) as RaylibApi);
}

export function sanitizeRaylibApiJson(raw: string): string {
  return raw.split("\n").map((line) => sanitizeDescriptionLine(line)).join("\n");
}

function applyManualFunctionOverrides(api: RaylibApi): RaylibApi {
  const functions = [...api.functions];

  for (const override of MANUAL_FUNCTION_OVERRIDES) {
    if (functions.some((entry) => entry.name === override.function.name)) continue;

    const anchorIndex = override.after === undefined
      ? -1
      : functions.findIndex((entry) => entry.name === override.after);

    if (anchorIndex === -1) {
      functions.push(override.function);
      continue;
    }

    functions.splice(anchorIndex + 1, 0, override.function);
  }

  return {
    ...api,
    functions,
  };
}

function sanitizeDescriptionLine(line: string): string {
  const marker = '"description": "';
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) return line;

  const valueStart = markerIndex + marker.length;
  const valueEnd = line.lastIndexOf('"');
  if (valueEnd <= valueStart) return line;

  const prefix = line.slice(0, valueStart);
  const description = line.slice(valueStart, valueEnd);
  const suffix = line.slice(valueEnd);
  const escaped = description.replace(/(?<!\\)"/g, '\\"');

  return `${prefix}${escaped}${suffix}`;
}

export function parseType(typeName: string): ParsedType {
  let working = normalizeWhitespace(typeName);
  let isConst = false;

  if (working.startsWith("const ")) {
    isConst = true;
    working = working.slice("const ".length).trim();
  }

  if (working.endsWith(" const")) {
    isConst = true;
    working = working.slice(0, -(" const".length)).trim();
  }

  const arrays: number[] = [];
  while (true) {
    const match = working.match(/\[(\d+)\]$/);
    if (match === null) break;
    arrays.unshift(Number.parseInt(match[1], 10));
    working = working.slice(0, -match[0].length).trim();
  }

  let pointerDepth = 0;
  while (working.endsWith("*")) {
    pointerDepth += 1;
    working = working.slice(0, -1).trim();
  }

  return {
    original: typeName,
    isConst,
    pointerDepth,
    arrays,
    core: working,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function collectAllTypes(api: RaylibApi): string[] {
  const types = new Set<string>();

  for (const alias of api.aliases) types.add(alias.type);
  for (const callback of api.callbacks) {
    types.add(callback.returnType);
    for (const param of callback.params ?? []) types.add(param.type);
  }
  for (const fn of api.functions) {
    types.add(fn.returnType);
    for (const param of fn.params ?? []) types.add(param.type);
  }
  for (const struct of api.structs) {
    for (const field of struct.fields) types.add(field.type);
  }

  return [...types].sort();
}

function summarizeTypes(api: RaylibApi) {
  const structs = new Set(api.structs.map((entry) => entry.name));
  const aliases = new Set(api.aliases.map((entry) => normalizeAliasName(entry.name)));
  const enums = new Set(api.enums.map((entry) => entry.name));
  const callbacks = new Set(api.callbacks.map((entry) => entry.name));

  const primitiveCores = new Set<string>();
  const namedCores = new Set<string>();
  const specialCores = new Set<string>();
  const unknownCores = new Set<string>();

  for (const typeName of collectAllTypes(api)) {
    const parsed = parseType(typeName);
    if (PRIMITIVE_TYPES.has(parsed.core)) {
      primitiveCores.add(parsed.core);
    } else if (
      structs.has(parsed.core) || aliases.has(parsed.core) || enums.has(parsed.core) ||
      callbacks.has(parsed.core)
    ) {
      namedCores.add(parsed.core);
    } else if (parsed.core === "..." || parsed.core === "va_list") {
      specialCores.add(parsed.core);
    } else {
      unknownCores.add(parsed.core);
    }
  }

  return {
    primitiveCoreCount: primitiveCores.size,
    namedCoreCount: namedCores.size,
    specialCoreCount: specialCores.size,
    unknownCoreCount: unknownCores.size,
    unknownCores: [...unknownCores].sort(),
  };
}

function normalizeAliasName(aliasName: string): string {
  return aliasName.replace(/^\*+/, "");
}

function createContext(api: RaylibApi): GenerationContext {
  const opaqueTypes = new Set(summarizeTypes(api).unknownCores);

  return {
    structs: new Map(api.structs.map((entry) => [entry.name, entry])),
    aliases: new Map(
      api.aliases.map((entry) => {
        const name = normalizeAliasName(entry.name);
        return [name, {
          name,
          type: entry.type,
          isPointerAlias: entry.name.startsWith("*"),
        } satisfies AliasInfo];
      }),
    ),
    enums: new Set(api.enums.map((entry) => entry.name)),
    callbacks: new Map(api.callbacks.map((entry) => [entry.name, entry])),
    opaqueTypes,
    supportedCallbacks: new Map(),
  };
}

function resolveNamedType(
  core: string,
  context: GenerationContext,
): ResolveResult {
  if (PRIMITIVE_TYPES.has(core)) return { kind: "primitive", name: core };
  if (context.structs.has(core)) return { kind: "struct", name: core };
  if (context.enums.has(core)) return { kind: "enum", name: core };
  if (context.callbacks.has(core)) return { kind: "callback", name: core };
  if (context.opaqueTypes.has(core)) return { kind: "opaque", name: core };

  const alias = context.aliases.get(core);
  if (alias !== undefined) return { kind: "alias", name: core, alias };

  return { kind: "unknown", name: core };
}

function resolveFfiType(
  typeName: string,
  context: GenerationContext,
  usage: string,
  seenAliases = new Set<string>(),
): FfiResolution {
  const parsed = parseType(typeName);

  if (parsed.core === "...") {
    return { ok: false, reason: `${usage}: varargs are unsupported` };
  }

  if (parsed.core === "va_list") {
    return { ok: false, reason: `${usage}: va_list is unsupported` };
  }

  if (parsed.arrays.length > 0) {
    return { ok: false, reason: `${usage}: inline arrays are unsupported` };
  }

  if (parsed.pointerDepth > 0) {
    return { ok: true, ffi: `"pointer"` };
  }

  const resolved = resolveNamedType(parsed.core, context);
  switch (resolved.kind) {
    case "primitive":
      return { ok: true, ffi: JSON.stringify(PRIMITIVE_TYPE_INFO[resolved.name].ffi) };
    case "struct":
      return { ok: true, ffi: `${resolved.name}ByValue` };
    case "enum":
      return { ok: true, ffi: `"i32"` };
    case "callback":
      return context.supportedCallbacks.has(resolved.name)
        ? { ok: true, ffi: `"function"` }
        : { ok: false, reason: `${usage}: callback ${resolved.name} is unsupported` };
    case "opaque":
      return { ok: false, reason: `${usage}: opaque non-pointer type ${resolved.name}` };
    case "alias":
      if (resolved.alias.isPointerAlias) return { ok: true, ffi: `"pointer"` };
      if (seenAliases.has(resolved.alias.name)) {
        return { ok: false, reason: `${usage}: circular alias ${resolved.alias.name}` };
      }
      seenAliases.add(resolved.alias.name);
      return resolveFfiType(resolved.alias.type, context, usage, seenAliases);
    case "unknown":
      return { ok: false, reason: `${usage}: unknown type ${resolved.name}` };
  }
}

function getTsType(typeName: string, context: GenerationContext): string {
  const parsed = parseType(typeName);
  if (isCharBufferType(parsed)) {
    return `CStringBuffer<${parsed.arrays[0]}>`;
  }
  let base = parsed.pointerDepth > 0
    ? getPointerTsType(parsed.core, parsed.pointerDepth, context)
    : getScalarTsType(parsed.core, context);
  for (let i = parsed.arrays.length - 1; i >= 0; i--) {
    base = `FixedArray<${base}, ${parsed.arrays[i]}>`;
  }
  return base;
}

function getPointerTsType(
  core: string,
  pointerDepth: number,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): string {
  const primitiveAlias = getPrimitivePointerAlias(core);
  let target = primitiveAlias ?? getScalarTsType(core, context, seenAliases);
  const startDepth = primitiveAlias === null ? 0 : 1;
  for (let i = startDepth; i < pointerDepth; i++) {
    target = `Deno.PointerValue<${target}>`;
  }
  return target;
}

function getScalarTsType(
  core: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): string {
  const resolved = resolveNamedType(core, context);
  switch (resolved.kind) {
    case "primitive":
      return PRIMITIVE_TYPE_INFO[resolved.name].ts;
    case "struct":
    case "enum":
    case "callback":
    case "opaque":
      return resolved.name;
    case "alias":
      return resolved.name;
    case "unknown":
      return core;
  }
}

function isCharCore(core: string): boolean {
  return core === "char" || core === "signed char";
}

function isCharBufferType(parsed: ParsedType): boolean {
  return parsed.pointerDepth === 0 && parsed.arrays.length === 1 && isCharCore(parsed.core);
}

function getPrimitivePointerAlias(core: string): string | null {
  switch (core) {
    case "char":
    case "signed char":
      return "CStringPointer";
    case "unsigned char":
    case "uint8_t":
      return "BytePointer";
    case "float":
      return "FloatPointer";
    case "int":
    case "int32_t":
      return "IntPointer";
    case "unsigned int":
    case "uint32_t":
      return "UIntPointer";
    case "unsigned short":
    case "unsigned short int":
    case "uint16_t":
      return "UShortPointer";
    case "void":
      return "VoidPointer";
    default:
      return null;
  }
}

function getByteTypeExpr(
  typeName: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): string | null {
  const parsed = parseType(typeName);

  if (parsed.pointerDepth > 0) return "u64";

  let scalar = getScalarByteTypeExpr(parsed.core, context, seenAliases);
  if (scalar === null) return null;

  for (let i = parsed.arrays.length - 1; i >= 0; i--) {
    scalar = `new SizedArrayType(${scalar}, ${parsed.arrays[i]})`;
  }

  return scalar;
}

function getScalarByteTypeExpr(
  core: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): string | null {
  const resolved = resolveNamedType(core, context);
  switch (resolved.kind) {
    case "primitive":
      return mapPrimitiveToByteType(resolved.name);
    case "struct":
      return `${resolved.name}Struct`;
    case "enum":
      return "i32";
    case "callback":
    case "opaque":
      return "u64";
    case "alias":
      if (seenAliases.has(resolved.alias.name)) return null;
      seenAliases.add(resolved.alias.name);
      if (resolved.alias.isPointerAlias) return "u64";
      return getByteTypeExpr(resolved.alias.type, context, seenAliases);
    case "unknown":
      return null;
  }
}

function getByValueExpr(
  typeName: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): string | null {
  const parsed = parseType(typeName);

  if (parsed.pointerDepth > 0) return `"pointer"`;

  let scalar = getScalarByValueExpr(parsed.core, context, seenAliases);
  if (scalar === null) return null;

  for (let i = parsed.arrays.length - 1; i >= 0; i--) {
    scalar = `{ struct: [${Array.from({ length: parsed.arrays[i] }, () => scalar).join(", ")}] }`;
  }

  return scalar;
}

function getScalarByValueExpr(
  core: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): string | null {
  const resolved = resolveNamedType(core, context);
  switch (resolved.kind) {
    case "primitive":
      return JSON.stringify(PRIMITIVE_TYPE_INFO[resolved.name].ffi);
    case "struct":
      return `${resolved.name}ByValue`;
    case "enum":
      return `"i32"`;
    case "callback":
    case "opaque":
      return `"pointer"`;
    case "alias":
      if (seenAliases.has(resolved.alias.name)) return null;
      seenAliases.add(resolved.alias.name);
      if (resolved.alias.isPointerAlias) return `"pointer"`;
      return getByValueExpr(resolved.alias.type, context, seenAliases);
    case "unknown":
      return null;
  }
}

function isByValueStructLike(
  typeName: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): boolean {
  const parsed = parseType(typeName);
  if (parsed.pointerDepth > 0) return false;

  const resolved = resolveNamedType(parsed.core, context);
  switch (resolved.kind) {
    case "struct":
      return true;
    case "alias":
      if (resolved.alias.isPointerAlias || seenAliases.has(resolved.alias.name)) {
        return false;
      }
      seenAliases.add(resolved.alias.name);
      return isByValueStructLike(resolved.alias.type, context, seenAliases);
    default:
      return false;
  }
}

function mapPrimitiveToByteType(core: string): string | null {
  switch (core) {
    case "_Bool":
    case "bool":
      return "u8";
    case "char":
    case "signed char":
    case "int8_t":
      return "i8";
    case "unsigned char":
    case "uint8_t":
      return "u8";
    case "short":
    case "short int":
    case "int16_t":
      return "i16";
    case "unsigned short":
    case "unsigned short int":
    case "uint16_t":
      return "u16";
    case "int":
    case "int32_t":
      return "i32";
    case "unsigned int":
    case "uint32_t":
      return "u32";
    case "long":
    case "long long":
    case "long long int":
    case "int64_t":
      return "i64";
    case "unsigned long":
    case "unsigned long long":
    case "unsigned long long int":
    case "uint64_t":
    case "size_t":
    case "uintptr_t":
      return "u64";
    case "ssize_t":
    case "intptr_t":
      return "i64";
    case "float":
      return "f32";
    case "double":
      return "f64";
    case "void":
      return null;
    default:
      return null;
  }
}

function collectSupportedCallbacks(
  api: RaylibApi,
  context: GenerationContext,
): { supported: Map<string, GeneratedCallback>; unsupported: UnsupportedItem[] } {
  const supported = new Map<string, GeneratedCallback>();
  const unsupported: UnsupportedItem[] = [];

  for (const callback of api.callbacks) {
    const result = resolveFfiType(
      callback.returnType,
      context,
      `callback ${callback.name} return`,
    );
    if (!result.ok) {
      unsupported.push({ name: callback.name, reason: result.reason });
      continue;
    }

    const params: string[] = [];
    let isSupported = true;
    for (const param of callback.params ?? []) {
      const resolved = resolveFfiType(
        param.type,
        context,
        `callback ${callback.name} param ${param.name}`,
      );
      if (!resolved.ok) {
        unsupported.push({ name: callback.name, reason: resolved.reason });
        isSupported = false;
        break;
      }
      params.push(resolved.ffi);
    }

    if (!isSupported) continue;
    supported.set(callback.name, { name: callback.name, params, result: result.ffi });
  }

  return { supported, unsupported };
}

function collectSupportedFunctions(
  api: RaylibApi,
  context: GenerationContext,
): { supported: GeneratedFunction[]; unsupported: UnsupportedItem[] } {
  const supported: GeneratedFunction[] = [];
  const unsupported: UnsupportedItem[] = [];

  for (const fn of api.functions) {
    const result = resolveFfiType(
      fn.returnType,
      context,
      `function ${fn.name} return`,
    );
    if (!result.ok) {
      unsupported.push({ name: fn.name, reason: result.reason });
      continue;
    }

    const params: string[] = [];
    let isSupported = true;
    for (const param of fn.params ?? []) {
      const resolved = resolveFfiType(
        param.type,
        context,
        `function ${fn.name} param ${param.name}`,
      );
      if (!resolved.ok) {
        unsupported.push({ name: fn.name, reason: resolved.reason });
        isSupported = false;
        break;
      }
      params.push(resolved.ffi);
    }

    if (!isSupported) continue;
    supported.push({ name: fn.name, params, result: result.ffi });
  }

  return { supported, unsupported };
}

function emitRawBindings(
  api: RaylibApi,
  context: GenerationContext,
): {
  source: string;
  supportedFunctionCount: number;
  unsupportedFunctions: UnsupportedItem[];
  unsupportedCallbacks: UnsupportedItem[];
} {
  const callbackPass = collectSupportedCallbacks(api, context);
  context.supportedCallbacks = callbackPass.supported;
  const functionPass = collectSupportedFunctions(api, context);
  const manualStructCandidates = collectManualStructCandidates(api, context);

  const lines: string[] = [
    "// This file is auto-generated by bindgen_raylib.ts.",
    "",
    'import { SizedArrayType, SizedStruct, u8, i8, u16, i16, u32, i32, f32, u64, i64, f64 } from "@denosaurs/byte-type";',
    'import { cstr } from "./utils.ts";',
    "",
    "export type FixedArray<T, N extends number = number> =",
    "  ReadonlyArray<T> & { readonly length: N };",
    "",
    ...emitPrimitiveScalarAliases(),
    "",
    "export type CStringPointer = Deno.PointerValue<CChar>;",
    "export type CStringBuffer<N extends number = number> = FixedArray<CChar, N>;",
    "export type BytePointer = Deno.PointerValue<CUChar>;",
    "export type FloatPointer = Deno.PointerValue<CFloat>;",
    "export type IntPointer = Deno.PointerValue<CInt>;",
    "export type UIntPointer = Deno.PointerValue<CUInt>;",
    "export type UShortPointer = Deno.PointerValue<CUShort>;",
    "export type VoidPointer = Deno.PointerValue<unknown>;",
    "",
    ...emitOpaqueTypeDefinitions(context),
    "",
    ...emitAliasDefinitions(api, context),
    "",
    ...emitStructDefinitions(api, context),
    "",
    ...emitEnumDefinitions(api),
    "",
    ...emitDefineDefinitions(api),
    "",
    ...emitStructValueHelpers(),
    "",
    "export const symbolDefinitions = {",
  ];

  for (const fn of functionPass.supported) {
    lines.push(...makeSanityComment([
      `${fn.name}`,
      `Description: ${getFunctionDescription(api, fn.name)}`,
      `Parameters: ${JSON.stringify(getFunctionParams(api, fn.name), null, 2)}`,
      `Return: ${getFunctionReturnType(api, fn.name)}`,
    ], 2));
    lines.push(`  ${fn.name}: {`);
    lines.push(`    parameters: [${fn.params.join(", ")}],`);
    lines.push(`    result: ${fn.result},`);
    lines.push("  },");
  }

  lines.push("} as const;");
  lines.push("");
  lines.push("export type RaylibSymbols = typeof symbolDefinitions;");
  lines.push("");
  lines.push('export type StructBytes<T = unknown> = Uint8Array<ArrayBufferLike>;');
  lines.push("export type CStringLike = string | CStringPointer;");
  lines.push("export type StructLike<T> = T | StructBytes<T>;");
  lines.push("");
  lines.push("function coerceCStringLike(value: CStringLike): CStringPointer {");
  lines.push('  return typeof value === "string" ? cstr(value) : value;');
  lines.push("}");
  lines.push("");
  lines.push("function coerceStructLike<T>(");
  lines.push("  value: StructLike<T>,");
  lines.push("  structDef: { toBytes(value: T): Uint8Array },");
  lines.push("): StructBytes<T> {");
  lines.push("  return value instanceof Uint8Array ? value as StructBytes<T> : structDef.toBytes(value as T);");
  lines.push("}");
  lines.push("");
  lines.push("export const unsupportedCallbacks = [");
  for (const item of callbackPass.unsupported) {
    lines.push(
      `  { name: ${JSON.stringify(item.name)}, reason: ${JSON.stringify(item.reason)} },`,
    );
  }
  lines.push("] as const;");
  lines.push("");
  lines.push("export const unsupportedFunctions = [");
  for (const item of functionPass.unsupported) {
    lines.push(
      `  { name: ${JSON.stringify(item.name)}, reason: ${JSON.stringify(item.reason)} },`,
    );
  }
  lines.push("] as const;");
  lines.push("");
  lines.push("export const manualStructMarshalingCandidates = [");
  for (const candidate of manualStructCandidates) {
    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(candidate.name)},`);
    lines.push(`    description: ${JSON.stringify(candidate.description ?? "")},`);
    lines.push(`    returnType: ${JSON.stringify(candidate.returnType)},`);
    lines.push(`    params: ${JSON.stringify(candidate.params)},`);
    lines.push(`    byValueReturn: ${JSON.stringify(candidate.byValueReturn)},`);
    lines.push(`    byValueParams: ${JSON.stringify(candidate.byValueParams)},`);
    lines.push("  },");
  }
  lines.push("] as const;");
  lines.push("");
  lines.push("export function getDefaultRaylibLibraryName(): string {");
  lines.push("  switch (Deno.build.os) {");
  lines.push('    case "windows": return "raylib.dll";');
  lines.push('    case "darwin": return "libraylib.dylib";');
  lines.push('    default: return "libraylib.so";');
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("let raylibLibrary: Deno.DynamicLibrary<RaylibSymbols> | null = null;");
  lines.push("");
  lines.push(
    'export function loadRaylib(path = getDefaultRaylibLibraryName()): Deno.DynamicLibrary<RaylibSymbols> {',
  );
  lines.push("  raylibLibrary ??= Deno.dlopen(path, symbolDefinitions);");
  lines.push("  return raylibLibrary;");
  lines.push("}");
  lines.push("");
  lines.push("export function unloadRaylib(): void {");
  lines.push("  if (raylibLibrary !== null) {");
  lines.push("    raylibLibrary.close();");
  lines.push("    raylibLibrary = null;");
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("export function isRaylibLoaded(): boolean {");
  lines.push("  return raylibLibrary !== null;");
  lines.push("}");
  lines.push("");
  lines.push("function requireRaylibLibrary(): Deno.DynamicLibrary<RaylibSymbols> {");
  lines.push("  if (raylibLibrary === null) {");
  lines.push('    throw new Error("Raylib library not loaded. Call loadRaylib() first.");');
  lines.push("  }");
  lines.push("  return raylibLibrary;");
  lines.push("}");
  lines.push("");
  lines.push('export type RaylibLoadedSymbols = Deno.DynamicLibrary<RaylibSymbols>["symbols"];');
  lines.push("");
  lines.push("export function getRaylibLibrary(): Deno.DynamicLibrary<RaylibSymbols> {");
  lines.push("  return requireRaylibLibrary();");
  lines.push("}");
  lines.push("");
  lines.push("export function getRaylibSymbols(): RaylibLoadedSymbols {");
  lines.push("  return requireRaylibLibrary().symbols;");
  lines.push("}");
  lines.push("");
  lines.push(...emitFunctionWrappers(api, functionPass.supported, context));
  lines.push("");
  lines.push(...emitHighLevelFunctionWrappers(api, functionPass.supported, context));
  lines.push("");
  lines.push(...emitRaylibNamespace(api, functionPass.supported, context));

  return {
    source: lines.join("\n"),
    supportedFunctionCount: functionPass.supported.length,
    unsupportedFunctions: functionPass.unsupported,
    unsupportedCallbacks: callbackPass.unsupported,
  };
}

function emitPrimitiveScalarAliases(): string[] {
  return getPrimitiveScalarAliasNames().map((name) => {
    const info = Object.values(PRIMITIVE_TYPE_INFO).find((entry) => entry.ts === name);
    if (info === undefined) {
      throw new Error(`Missing primitive type info for ${name}`);
    }
    return `export type ${name} = ${info.runtimeTs};`;
  });
}

function getPrimitiveScalarAliasNames(): string[] {
  const emitted = new Set<string>();
  const names: string[] = [];

  for (const info of Object.values(PRIMITIVE_TYPE_INFO)) {
    if (
      info.ts === "void" || info.ts === "unknown" ||
      info.ts.startsWith("Deno.PointerValue")
    ) {
      continue;
    }

    if (emitted.has(info.ts)) continue;
    emitted.add(info.ts);
    names.push(info.ts);
  }

  return names.sort();
}

function emitEnumDefinitions(api: RaylibApi): string[] {
  const lines: string[] = [];

  for (const entry of api.enums) {
    lines.push(...makeSanityComment([
      `${entry.name}`,
      `Description: ${entry.description ?? ""}`,
    ]));
    lines.push(`export enum ${entry.name} {`);
    for (const value of entry.values) {
      lines.push(`  ${value.name} = ${value.value},`);
    }
    lines.push("}");
    lines.push("");
  }

  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function emitDefineDefinitions(api: RaylibApi): string[] {
  const lines: string[] = [];

  for (const entry of getEmittableDefineEntries(api)) {
    const emitted = emitDefineDefinition(entry);
    if (emitted.length === 0) continue;
    lines.push(...makeSanityComment([
      `${entry.name}`,
      `Type: ${entry.type}`,
      `Description: ${entry.description ?? ""}`,
    ]));
    lines.push(...emitted);
    lines.push("");
  }

  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function getEmittableDefineEntries(api: RaylibApi): RaylibDefine[] {
  return api.defines.filter((entry) =>
    !(
      entry.type === "GUARD" ||
      entry.type === "MACRO" ||
      entry.type === "UNKNOWN" ||
      entry.name.includes("(")
    )
  );
}

function emitDefineDefinition(entry: RaylibDefine): string[] {
  if (
    entry.type === "GUARD" ||
    entry.type === "MACRO" ||
    entry.type === "UNKNOWN" ||
    entry.name.includes("(")
  ) {
    return [];
  }

  switch (entry.type) {
    case "INT":
      return [`export const ${entry.name}: CInt = ${Number(entry.value)};`];
    case "LONG":
    case "LONG_LONG":
      return [`export const ${entry.name}: CLongLong = ${BigInt(entry.value as number | string)}n;`];
    case "FLOAT":
    case "DOUBLE":
      return [`export const ${entry.name}: CFloat = ${normalizeCExpression(String(entry.value))};`];
    case "FLOAT_MATH":
      return [`export const ${entry.name}: CFloat = ${normalizeCExpression(String(entry.value))};`];
    case "STRING":
      return [`export const ${entry.name} = ${JSON.stringify(String(entry.value))};`];
    case "COLOR": {
      const colorValue = parseColorDefine(String(entry.value));
      return colorValue === null ? [] : [`export const ${entry.name}: Color = ${colorValue};`];
    }
    default:
      return typeof entry.value === "number"
        ? [`export const ${entry.name} = ${entry.value};`]
        : [];
  }
}

function normalizeCExpression(value: string): string {
  return value
    .replace(/([0-9])f\b/g, "$1")
    .replace(/([0-9])d\b/g, "$1")
    .replace(/\s+/g, "");
}

function parseColorDefine(value: string): string | null {
  const match = value.match(
    /CLITERAL\(Color\)\{\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\}/,
  );
  if (match === null) return null;

  const [, r, g, b, a] = match;
  return `{ r: ${r}, g: ${g}, b: ${b}, a: ${a} }`;
}

function emitFunctionWrappers(
  api: RaylibApi,
  supportedFunctions: GeneratedFunction[],
  context: GenerationContext,
): string[] {
  const lines: string[] = [];

  for (const fn of supportedFunctions) {
    const params = getFunctionParams(api, fn.name);
    const rawReturnType = getFunctionReturnType(api, fn.name);
    const byValueParams = params
      .map((param) => {
        const struct = getByValueStructName(param.type, context);
        return struct === null ? null : { name: param.name, struct };
      })
      .filter((entry): entry is { name: string; struct: string } => entry !== null);
    const byValueReturn = getByValueStructName(getFunctionReturnType(api, fn.name), context);

    const paramDocs = params.map((param) => {
      const struct = getByValueStructName(param.type, context);
      const details = [];
      if ((param.description ?? "").trim().length > 0) details.push(param.description!.trim());
      if (struct !== null) details.push(`Pass struct bytes created with ${struct}.toBytes(value).`);
      return { name: sanitizeIdentifier(param.name), description: details.join(" ") };
    });
    lines.push(...makeJsDocComment(
      getFunctionDescription(api, fn.name) || fn.name,
      paramDocs,
      rawReturnType === "void"
        ? undefined
        : byValueReturn !== null
        ? `Struct bytes for ${byValueReturn}.`
        : `Returns ${rawReturnType}.`,
    ));

    const safeParamNames = makeSafeParamNames(params);
    const paramDeclarations = params.map((param, index) =>
      `${safeParamNames[index]}: ${getWrapperParamType(fn.name, index, param.type, context)}`
    );
    const returnType = getWrapperReturnType(fn.name, rawReturnType, context);
    const callArgs = params.map((param, index) => {
      const byValueStruct = getByValueStructName(param.type, context);
      return byValueStruct === null
        ? safeParamNames[index]
        : `${safeParamNames[index]} as unknown as BufferSource`;
    }).join(", ");

    lines.push(`export function ${fn.name}(${paramDeclarations.join(", ")}): ${returnType} {`);
    if (rawReturnType === "void") {
      lines.push(`  return getRaylibSymbols().${fn.name}(${callArgs});`);
    } else {
      lines.push(`  return getRaylibSymbols().${fn.name}(${callArgs}) as unknown as ${returnType};`);
    }
    lines.push("}");
    lines.push("");
  }

  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function emitHighLevelFunctionWrappers(
  api: RaylibApi,
  supportedFunctions: GeneratedFunction[],
  context: GenerationContext,
): string[] {
  const eligibleFunctions = supportedFunctions;
  const lines: string[] = [];

  if (eligibleFunctions.length === 0) {
    return lines;
  }

  lines.push(...makeJsDocComment(
    "Ergonomic helper surface over the raw ABI-explicit API.",
    [],
    undefined,
    [
      "Accepts high-level JS strings and struct objects for the subset of functions where coercion is straightforward and safe.",
      "Raw values are still accepted, and unsupported edge cases remain available through the primary low-level exports.",
    ],
  ));
  lines.push("export const H = {");

  for (const fn of eligibleFunctions) {
    const params = getFunctionParams(api, fn.name);
    const safeParamNames = makeSafeParamNames(params);
    const rawReturnType = getFunctionReturnType(api, fn.name);
    const byValueReturn = getByValueStructName(rawReturnType, context);
    const paramDocs = params.map((param) => {
      const details = [];
      if ((param.description ?? "").trim().length > 0) details.push(param.description!.trim());
      if (isConstCStringType(param.type, context)) details.push("Accepts a JS string or a raw C string pointer.");
      const struct = getByValueStructName(param.type, context);
      if (struct !== null) details.push(`Accepts a ${struct} object or raw struct bytes.`);
      return { name: sanitizeIdentifier(param.name), description: details.join(" ") };
    });

    lines.push(...makeJsDocComment(
      getFunctionDescription(api, fn.name) || fn.name,
      paramDocs,
      rawReturnType === "void"
        ? undefined
        : byValueReturn !== null
        ? `Returns a decoded ${byValueReturn} object.`
        : `Returns ${getTsType(rawReturnType, context)}.`,
      [],
      2,
    ));

    const paramDeclarations = params.map((param, index) =>
      `${safeParamNames[index]}: ${getHighLevelParamType(fn.name, index, param.type, context)}`
    );
    const callArgs = params.map((param, index) =>
      getHighLevelCallArg(safeParamNames[index], param.type, context)
    ).join(", ");
    const returnType = getHighLevelReturnType(fn.name, rawReturnType, context);

    lines.push(`  ${fn.name}(${paramDeclarations.join(", ")}): ${returnType} {`);
    if (byValueReturn !== null) {
      lines.push(`    return ${byValueReturn}.fromBytes(${fn.name}(${callArgs}));`);
    } else if (rawReturnType === "void") {
      lines.push(`    return ${fn.name}(${callArgs});`);
    } else {
      lines.push(`    return ${fn.name}(${callArgs});`);
    }
    lines.push("  },");
    lines.push("");
  }

  if (lines[lines.length - 1] === "") lines.pop();
  lines.push("} as const;");
  lines.push("");
  lines.push("export type RaylibHighLevelApi = typeof H;");
  return lines;
}

function emitRaylibNamespace(
  api: RaylibApi,
  supportedFunctions: GeneratedFunction[],
  context: GenerationContext,
): string[] {
  const lines: string[] = [];
  const runtimeEntries = [
    "symbolDefinitions",
    "unsupportedCallbacks",
    "unsupportedFunctions",
    "manualStructMarshalingCandidates",
    "getDefaultRaylibLibraryName",
    "loadRaylib",
    "unloadRaylib",
    "isRaylibLoaded",
    "getRaylibLibrary",
    "getRaylibSymbols",
    "H",
    "createByValueStruct",
    "readByValueStruct",
    "createPointerStruct",
    ...api.structs.map((entry) => entry.name),
    ...api.enums.map((entry) => entry.name),
    ...getEmittableDefineEntries(api).map((entry) => entry.name),
    ...supportedFunctions.map((entry) => entry.name),
  ];
  const typeEntries = [
    ...getPrimitiveScalarAliasNames(),
    "CStringPointer",
    "BytePointer",
    "FloatPointer",
    "IntPointer",
    "UIntPointer",
    "UShortPointer",
    "VoidPointer",
    ...Array.from(context.opaqueTypes).sort(),
    ...api.aliases.map((entry) => normalizeAliasName(entry.name)),
    ...api.structs.map((entry) => entry.name),
    "CStringLike",
    "RaylibSymbols",
    "RaylibLoadedSymbols",
    "RaylibHighLevelApi",
  ];
  const uniqueRuntimeEntries = [...new Set(runtimeEntries)];
  const uniqueTypeEntries = [...new Set(typeEntries)];

  lines.push(...makeJsDocComment(
    "Namespace-style runtime surface for the generated raylib binding.",
    [],
    undefined,
    [
      "Lets you import the module once and access runtime values as raylib.SomeFunction, raylib.Color, raylib.KeyboardKey, etc.",
      "Types are also available in type position, for example raylib.Vector3 or raylib.Camera3D.",
      "The optional high-level helper surface lives at raylib.H.",
    ],
  ));
  for (const entry of uniqueRuntimeEntries) {
    lines.push(`const raylibNamespace_${entry} = ${entry};`);
  }
  lines.push("");
  for (const entry of uniqueTypeEntries) {
    lines.push(`type RaylibNamespaceType_${entry} = ${entry};`);
  }
  lines.push("");
  lines.push("export function raylib(): never {");
  lines.push('  throw new Error("raylib is a namespace object and cannot be called.");');
  lines.push("}");
  lines.push("");
  lines.push("export namespace raylib {");
  for (const entry of uniqueRuntimeEntries) {
    lines.push(`  export const ${entry} = raylibNamespace_${entry};`);
  }
  for (const entry of uniqueTypeEntries) {
    lines.push(`  export type ${entry} = RaylibNamespaceType_${entry};`);
  }
  lines.push("}");
  lines.push("");
  lines.push("export default raylib;");

  return lines;
}

function emitStructDefinitions(
  api: RaylibApi,
  context: GenerationContext,
): string[] {
  const lines: string[] = [];
  for (const struct of orderStructsForEmission(api.structs, context)) {
    lines.push(...makeSanityComment([
      `${struct.name}`,
      `Description: ${struct.description ?? ""}`,
      JSON.stringify(struct.fields, null, 2),
    ]));
    lines.push(`export interface ${struct.name} {`);
    for (const field of struct.fields) {
      lines.push(`  ${field.name}: ${getTsType(field.type, context)};`);
    }
    lines.push("}");
    lines.push("");
    lines.push(`const ${struct.name}Struct = new SizedStruct({`);
    for (const field of struct.fields) {
      const byteType = getByteTypeExpr(field.type, context);
      if (byteType === null) {
        lines.push(`  // TODO unsupported field ${field.name}: ${JSON.stringify(field.type)},`);
      } else {
        lines.push(`  ${field.name}: ${byteType},`);
      }
    }
    lines.push("});");
    lines.push("");
    lines.push(`const ${struct.name}ByValue = {`);
    lines.push("  struct: [");
    for (const field of struct.fields) {
      const ffiType = getByValueExpr(field.type, context);
      if (ffiType === null) {
        lines.push(`    // TODO unsupported field ${field.name}: ${JSON.stringify(field.type)},`);
      } else {
        lines.push(`    ${ffiType},`);
      }
    }
    lines.push("  ],");
    lines.push("} as const;");
    lines.push("");
    lines.push(`export const ${struct.name} = {`);
    lines.push(`  sizedStruct: ${struct.name}Struct,`);
    lines.push(`  ffiByValue: ${struct.name}ByValue,`);
    lines.push(`  byteSize: ${struct.name}Struct.byteSize,`);
    lines.push(`  fieldOffsets: ${struct.name}Struct.getFieldOffsets(),`);
    lines.push(`  toBytes(value: ${struct.name}): Uint8Array {`);
    lines.push(`    return createByValueStruct(value, ${struct.name}Struct);`);
    lines.push("  },");
    lines.push(`  fromBytes(bytes: Uint8Array): ${struct.name} {`);
    lines.push(`    return readByValueStruct(bytes, ${struct.name}Struct);`);
    lines.push("  },");
    lines.push(`  createPointer(value: ${struct.name}): StructPointerHandle<${struct.name}> {`);
    lines.push(`    return createPointerStruct(value, ${struct.name}Struct);`);
    lines.push("  },");
    lines.push(`  readBytes(view: DataView): ${struct.name} {`);
    lines.push(`    return ${struct.name}Struct.read(view) as unknown as ${struct.name};`);
    lines.push("  },");
    lines.push(`  writeBytes(value: ${struct.name}, view: DataView): void {`);
    lines.push(`    ${struct.name}Struct.write(value as any, view);`);
    lines.push("  },");
    lines.push("} as const;");
    lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function emitStructValueHelpers(): string[] {
  return [
    "export type StructPointerHandle<T> = {",
    "  pointer: Deno.PointerValue<T>;",
    "  bytes: Uint8Array;",
    "  view: DataView;",
    "  read(): T;",
    "  write(value: T): void;",
    "};",
    "",
    "export function createByValueStruct<T>(",
    "  value: T,",
    "  structDef: { byteSize: number; write(value: any, dt: DataView): void },",
    "): Uint8Array {",
    "  const bytes = new Uint8Array(structDef.byteSize);",
    "  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);",
    "  structDef.write(value, view);",
    "  return bytes;",
    "}",
    "",
    "export function readByValueStruct<T>(",
    "  bytes: Uint8Array,",
    "  structDef: { read(dt: DataView): any },",
    "): T {",
    "  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);",
    "  return structDef.read(view) as T;",
    "}",
    "",
    "export function createPointerStruct<T>(",
    "  value: T,",
    "  structDef: { byteSize: number; write(value: any, dt: DataView): void; read(dt: DataView): any },",
    "): StructPointerHandle<T> {",
    "  const bytes = new Uint8Array(structDef.byteSize);",
    "  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);",
    "  structDef.write(value, view);",
    "  const pointer = Deno.UnsafePointer.of(bytes) as Deno.PointerValue<T>;",
    "  return {",
    "    pointer,",
    "    bytes,",
    "    view,",
    "    read() {",
    "      return structDef.read(view) as T;",
    "    },",
    "    write(nextValue: T) {",
    "      structDef.write(nextValue, view);",
    "    },",
    "  };",
    "}",
  ];
}

function emitOpaqueTypeDefinitions(context: GenerationContext): string[] {
  return [...context.opaqueTypes].sort().map((name) => `export type ${name} = unknown;`);
}

function emitAliasDefinitions(
  api: RaylibApi,
  context: GenerationContext,
): string[] {
  const lines: string[] = [];

  for (const alias of api.aliases) {
    const aliasName = normalizeAliasName(alias.name);
    const typeName = alias.name.startsWith("*")
      ? getPointerTsType(alias.type, 1, context)
      : getTsType(alias.type, context);

    lines.push(...makeSanityComment([
      `${aliasName}`,
      `Description: ${alias.description ?? ""}`,
      `AliasOf: ${alias.type}`,
      `OriginalName: ${alias.name}`,
    ]));
    lines.push(`export type ${aliasName} = ${typeName};`);
    lines.push("");
  }

  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function makeSanityComment(lines: string[], indent = 0): string[] {
  const prefix = " ".repeat(indent);
  const comment = [`${prefix}/*`];
  for (const line of lines) {
    for (const splitLine of line.split("\n")) {
      comment.push(`${prefix}${splitLine}`);
    }
  }
  comment.push(`${prefix}*/`);
  return comment;
}

function makeJsDocComment(
  summary: string,
  params: Array<{ name: string; description: string }> = [],
  returns?: string,
  notes: string[] = [],
  indent = 0,
): string[] {
  const prefix = " ".repeat(indent);
  const lines = [`${prefix}/**`];
  for (const line of summary.split("\n")) {
    lines.push(`${prefix} * ${line}`);
  }
  for (const note of notes) {
    lines.push(`${prefix} *`);
    for (const line of note.split("\n")) {
      lines.push(`${prefix} * ${line}`);
    }
  }
  for (const param of params) {
    lines.push(`${prefix} * @param ${param.name}${param.description ? ` ${param.description}` : ""}`);
  }
  if (returns !== undefined) {
    lines.push(`${prefix} * @returns ${returns}`);
  }
  lines.push(`${prefix} */`);
  return lines;
}

function sanitizeIdentifier(name: string): string {
  let value = name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (value.length === 0) value = "arg";
  if (/^[0-9]/.test(value)) value = `_${value}`;
  if (RESERVED_IDENTIFIERS.has(value)) value = `${value}_`;
  return value;
}

function makeSafeParamNames(params: RaylibField[]): string[] {
  const used = new Map<string, number>();
  return params.map((param) => {
    const base = sanitizeIdentifier(param.name);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function getWrapperParamType(
  functionName: string,
  paramIndex: number,
  typeName: string,
  context: GenerationContext,
): string {
  const byValueStruct = getByValueStructName(typeName, context);
  if (byValueStruct !== null) {
    return `StructBytes<${getTsType(typeName, context)}>`;
  }

  if (usesCallbackType(typeName, context)) {
    return `Parameters<RaylibLoadedSymbols[${JSON.stringify(functionName)}]>[${paramIndex}]`;
  }

  return getTsType(typeName, context);
}

function getWrapperReturnType(
  functionName: string,
  typeName: string,
  context: GenerationContext,
): string {
  const byValueStruct = getByValueStructName(typeName, context);
  if (byValueStruct !== null) {
    return `StructBytes<${getTsType(typeName, context)}>`;
  }

  if (usesCallbackType(typeName, context)) {
    return `ReturnType<RaylibLoadedSymbols[${JSON.stringify(functionName)}]>`;
  }

  return getTsType(typeName, context);
}

function usesCallbackType(
  typeName: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): boolean {
  const parsed = parseType(typeName);
  const resolved = resolveNamedType(parsed.core, context);
  switch (resolved.kind) {
    case "callback":
      return true;
    case "alias":
      if (seenAliases.has(resolved.alias.name)) return false;
      seenAliases.add(resolved.alias.name);
      return usesCallbackType(resolved.alias.type, context, seenAliases);
    default:
      return false;
  }
}

function getFunctionByName(api: RaylibApi, name: string): RaylibFunction | undefined {
  return api.functions.find((entry) => entry.name === name);
}

function getFunctionDescription(api: RaylibApi, name: string): string {
  return getFunctionByName(api, name)?.description ?? "";
}

function getFunctionParams(api: RaylibApi, name: string): RaylibField[] {
  return getFunctionByName(api, name)?.params ?? [];
}

function getFunctionReturnType(api: RaylibApi, name: string): string {
  return getFunctionByName(api, name)?.returnType ?? "void";
}

function collectManualStructCandidates(
  api: RaylibApi,
  context: GenerationContext,
): ManualStructCandidate[] {
  const candidates: ManualStructCandidate[] = [];

  for (const fn of api.functions) {
    const byValueReturn = getByValueStructName(fn.returnType, context);
    const byValueParams = (fn.params ?? [])
      .map((param) => {
        const struct = getByValueStructName(param.type, context);
        return struct === null ? null : { name: param.name, type: param.type, struct };
      })
      .filter((entry): entry is { name: string; type: string; struct: string } =>
        entry !== null
      );

    if (byValueReturn === null && byValueParams.length === 0) continue;

    candidates.push({
      name: fn.name,
      description: fn.description,
      returnType: fn.returnType,
      params: fn.params ?? [],
      byValueReturn,
      byValueParams,
    });
  }

  return candidates;
}

function getByValueStructName(
  typeName: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): string | null {
  const parsed = parseType(typeName);
  if (parsed.pointerDepth > 0 || parsed.arrays.length > 0) return null;

  const resolved = resolveNamedType(parsed.core, context);
  switch (resolved.kind) {
    case "struct":
      return resolved.name;
    case "alias":
      if (resolved.alias.isPointerAlias || seenAliases.has(resolved.alias.name)) {
        return null;
      }
      seenAliases.add(resolved.alias.name);
      return getByValueStructName(resolved.alias.type, context, seenAliases);
    default:
      return null;
  }
}

function orderStructsForEmission(
  structs: RaylibStruct[],
  context: GenerationContext,
): RaylibStruct[] {
  const ordered: RaylibStruct[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(struct: RaylibStruct) {
    if (visited.has(struct.name)) return;
    if (visiting.has(struct.name)) return;

    visiting.add(struct.name);
    for (const dep of getStructDependencies(struct, context)) {
      const depStruct = context.structs.get(dep);
      if (depStruct !== undefined) visit(depStruct);
    }
    visiting.delete(struct.name);
    visited.add(struct.name);
    ordered.push(struct);
  }

  for (const struct of structs) visit(struct);
  return ordered;
}

function isConstCStringType(
  typeName: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): boolean {
  const parsed = parseType(typeName);
  if (
    parsed.pointerDepth === 1 && parsed.arrays.length === 0 &&
    parsed.isConst && isCharCore(parsed.core)
  ) {
    return true;
  }

  if (parsed.pointerDepth > 0 || parsed.arrays.length > 0) return false;

  const resolved = resolveNamedType(parsed.core, context);
  if (resolved.kind === "alias" && !seenAliases.has(resolved.alias.name)) {
    seenAliases.add(resolved.alias.name);
    return isConstCStringType(resolved.alias.type, context, seenAliases);
  }

  return false;
}

function getHighLevelParamType(
  functionName: string,
  paramIndex: number,
  typeName: string,
  context: GenerationContext,
): string {
  const byValueStruct = getByValueStructName(typeName, context);
  if (byValueStruct !== null) {
    return `StructLike<${getTsType(typeName, context)}>`;
  }

  if (isConstCStringType(typeName, context)) {
    return "CStringLike";
  }

  if (usesCallbackType(typeName, context)) {
    return `Parameters<RaylibLoadedSymbols[${JSON.stringify(functionName)}]>[${paramIndex}]`;
  }

  return getTsType(typeName, context);
}

function getHighLevelReturnType(
  functionName: string,
  typeName: string,
  context: GenerationContext,
): string {
  const byValueStruct = getByValueStructName(typeName, context);
  if (byValueStruct !== null) {
    return getTsType(typeName, context);
  }

  if (usesCallbackType(typeName, context)) {
    return `ReturnType<RaylibLoadedSymbols[${JSON.stringify(functionName)}]>`;
  }

  return typeName === "void" ? "void" : getTsType(typeName, context);
}

function getHighLevelCallArg(
  paramName: string,
  typeName: string,
  context: GenerationContext,
): string {
  const byValueStruct = getByValueStructName(typeName, context);
  if (byValueStruct !== null) {
    return `coerceStructLike(${paramName}, ${byValueStruct})`;
  }

  if (isConstCStringType(typeName, context)) {
    return `coerceCStringLike(${paramName})`;
  }

  return paramName;
}

function getStructDependencies(
  struct: RaylibStruct,
  context: GenerationContext,
): Set<string> {
  const deps = new Set<string>();
  for (const field of struct.fields) {
    for (const dep of getTypeDependencies(field.type, context)) {
      if (dep !== struct.name) deps.add(dep);
    }
  }
  return deps;
}

function getTypeDependencies(
  typeName: string,
  context: GenerationContext,
  seenAliases = new Set<string>(),
): Set<string> {
  const parsed = parseType(typeName);
  if (parsed.pointerDepth > 0) return new Set();

  const resolved = resolveNamedType(parsed.core, context);
  switch (resolved.kind) {
    case "struct":
      return new Set([resolved.name]);
    case "alias":
      if (resolved.alias.isPointerAlias || seenAliases.has(resolved.alias.name)) {
        return new Set();
      }
      seenAliases.add(resolved.alias.name);
      return getTypeDependencies(resolved.alias.type, context, seenAliases);
    default:
      return new Set();
  }
}

async function main() {
  const api = await loadRaylibApi();
  const context = createContext(api);
  const emitted = emitRawBindings(api, context);
  await Deno.writeTextFile(OUTPUT_PATH, emitted.source);

  console.log(JSON.stringify({
    output: OUTPUT_PATH,
    defines: api.defines.length,
    structs: api.structs.length,
    aliases: api.aliases.length,
    enums: api.enums.length,
    callbacks: api.callbacks.length,
    functions: api.functions.length,
    ...summarizeTypes(api),
    supportedFunctions: emitted.supportedFunctionCount,
    unsupportedFunctionCount: emitted.unsupportedFunctions.length,
    unsupportedCallbackCount: emitted.unsupportedCallbacks.length,
    unsupportedFunctionSample: emitted.unsupportedFunctions.slice(0, 10),
    unsupportedCallbackSample: emitted.unsupportedCallbacks.slice(0, 10),
  }, null, 2));
}

if (import.meta.main) {
  await main();
}
