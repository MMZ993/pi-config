import { Type, type Static } from "typebox";

/** Static limits, schemas, and model-facing descriptions for the fd and rg tools. */

/** Limits the number of filesystem entries returned by fd. */
export const FD_DEFAULT_LIMIT = 1_000;

/** Prevents unbounded directory traversal by fd. */
export const FD_MAX_DEPTH = 64;

/** Limits the number of content matches returned per file by rg. */
export const RG_DEFAULT_LIMIT = 100;

/** Prevents excessive context output from rg. */
export const RG_MAX_CONTEXT = 20;

/** Limits the number of content matches returned per file by rg. */
export const RG_MAX_LIMIT = 1_000;

/** Maps the tool names to binaries managed by the dotfiles repository. */
export const SEARCH_BINARIES = {
  fd: "fd",
  rg: "rg",
} as const;

/** Defines the validated input accepted by the fd tool. */
export const FdSchema = Type.Object({
  pattern: Type.Optional(Type.String({ description: "File-name regex or glob." })),
  path: Type.Optional(Type.String({ description: "Directory to search." })),
  type: Type.Optional(
    Type.Unsafe<"file" | "directory" | "symlink">({
      type: "string",
      enum: ["file", "directory", "symlink"],
    }),
  ),
  extension: Type.Optional(Type.String({ description: "File extension to include." })),
  glob: Type.Optional(Type.Boolean({ description: "Treat pattern as a glob." })),
  hidden: Type.Optional(Type.Boolean({ description: "Include hidden entries." })),
  maxDepth: Type.Optional(Type.Integer({ minimum: 1, maximum: FD_MAX_DEPTH })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: FD_DEFAULT_LIMIT })),
});

/** Defines the validated input accepted by the rg tool. */
export const RgSchema = Type.Object({
  pattern: Type.String({ description: "Content regex or literal text." }),
  path: Type.Optional(Type.String({ description: "File or directory to search." })),
  glob: Type.Optional(Type.String({ description: "Only search matching paths." })),
  fileType: Type.Optional(Type.String({ description: "Ripgrep file type." })),
  caseSensitive: Type.Optional(Type.Boolean({ description: "Override smart-case matching." })),
  fixedStrings: Type.Optional(Type.Boolean({ description: "Treat pattern as literal text." })),
  hidden: Type.Optional(Type.Boolean({ description: "Include hidden entries." })),
  context: Type.Optional(Type.Integer({ minimum: 0, maximum: RG_MAX_CONTEXT })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: RG_MAX_LIMIT })),
});

/** Represents validated fd tool input. */
export type FdParameters = Static<typeof FdSchema>;

/** Represents validated rg tool input. */
export type RgParameters = Static<typeof RgSchema>;
