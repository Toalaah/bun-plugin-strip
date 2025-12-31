await Bun.build({
  entrypoints: ["./index.ts"],
  outdir: "./dist",
  target: "bun",
  minify: true,
});
