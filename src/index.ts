import type { BunPlugin } from "bun";
import ts from "typescript";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { minimatch } from "minimatch";

/* External API. */

export type FilterPattern = ReadonlyArray<string> | string | null;
export interface Config {
  include?: FilterPattern;
  exclude?: FilterPattern;
  debugger?: boolean;
  functions?: FilterPattern;
  tsconfigPath?: string;
  verbose?: boolean;
}

export function Strip(config: Config = {}): BunPlugin {
  const include = [...(config.include ?? ["**"])];
  const exclude = [...(config.exclude ?? ["**node_modules**"])];
  const functions = config.functions ?? ["console.*", "assert.*"];
  const stripDebugger = config.debugger ?? true;
  const tsconfigPath =
    config.tsconfigPath ?? resolve(process.cwd(), "./tsconfig.json");
  const compilerOptions = getCompilerOptions(tsconfigPath);
  const nothingToStrip = functions.length === 0 && !stripDebugger;
  verbose = config.verbose ?? verbose;

  debug("functions:", functions);
  debug("file include patterns:", include);
  debug("file exclude patterns:", exclude);

  let callback: Bun.OnLoadCallback = async ({ path }) => {
    const contents = await Bun.file(path).text();
    if (exclude.some((pattern) => minimatch(path, pattern))) {
      return { contents };
    }

    const config: StripConfig = {
      stripDebugger,
      functions,
      compilerOptions,
    };
    return {
      contents: stripFunctions(config, path, contents),
    };
  };

  if (nothingToStrip) {
    debug("no functions specified which should be stripped");
    callback = async ({}) => undefined;
  }

  const filter = new RegExp(
    include
      .map((pattern) => (minimatch.makeRe(pattern) as RegExp).source)
      .join("|"),
  );

  return {
    name: "strip-debug",
    setup(build) {
      build.onLoad({ filter }, callback);
    },
  };
}

/* Everything from here on is internal. */

interface StripConfig {
  functions: FilterPattern;
  stripDebugger: boolean;
  compilerOptions: ts.CompilerOptions;
}

export function stripFunctions(
  config: StripConfig,
  path: string,
  source: string,
): string {
  const sourceFile = ts.createSourceFile(
    basename(path),
    source,
    config.compilerOptions.target || ts.ScriptTarget.ES2015,
    false,
  );

  const transformer = makeTransformer(config);
  const transformed = ts.transform(
    sourceFile,
    [transformer],
    config.compilerOptions,
  ).transformed[0];

  return ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed })
    .printNode(ts.EmitHint.Unspecified, transformed!, sourceFile);
}

export function makeTransformer(
  config: StripConfig,
): ts.TransformerFactory<ts.SourceFile> {
  return (ctx: ts.TransformationContext) => {
    return (source: ts.SourceFile) => {
      let needed_to_strip = false;
      const walk = (node: ts.Node): ts.Node => {
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (
            ts.isPropertyAccessExpression(expr) &&
            shouldStrip(config, expr)
          ) {
            if (!needed_to_strip) {
              debug("stripping file", source.fileName);
              needed_to_strip = true;
            }
            return ctx.factory.createVoidZero();
          }
        } else if (ts.isDebuggerStatement(node) && config.stripDebugger) {
          debug("stripping debugger", source.fileName);
          return ctx.factory.createEmptyStatement();
        }

        return ts.visitEachChild(node, walk, ctx);
      };

      return ts.visitNode(source, walk) as ts.SourceFile;
    };
  };
}

function shouldStrip(config: StripConfig, expr: ts.Expression): boolean {
  if (config.functions === null) return false;
  if (!ts.isPropertyAccessExpression(expr)) return false;

  const obj = expr.expression;
  const prop = expr.name;

  if (!ts.isIdentifier(obj) || !ts.isIdentifier(prop)) return false;

  const baseName = obj.text;
  const methodName = prop.text;
  const fullName = `${baseName}.${methodName}`;

  for (const p of [...config.functions]) {
    if (minimatch(fullName, p)) return true;
  }
  return false;
}

function getCompilerOptions(sourcePath: string): ts.CompilerOptions {
  try {
    const content = readFileSync(sourcePath).toString();
    const result = ts.parseConfigFileTextToJson("", content);
    return ts.convertCompilerOptionsFromJson(result.config.compilerOptions, "")
      .options;
  } catch (err) {
    return ts.getDefaultCompilerOptions();
  }
}

let verbose: boolean = false;
const debug = (msg: string, ...args: any[]) => {
  if (verbose) {
    console.log.apply(console, [`bun-plugin-strip: ${msg}`, ...args]);
  }
};
