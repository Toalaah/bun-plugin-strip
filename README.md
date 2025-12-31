bun-plugin-strip
================

A Bun plugin for stripping debug functions at build time.

Very similar in usage and functionality to `@rollup/plugin-strip`.

Usage
-----

```typescript
import { Strip } from "bun-plugin-strip";

await Bun.build({
  // ...
  plugins: [
    Strip({
      include: ["**/*.ts"],
      exclude: ["**/*.test.ts"],
      functions: ["console.*", "myModule.foo"],
    })
  ],
  // ...
});
```

Installation
------------

```bash
bun add bun-plugin-strip
```

License
-------

This project is licensed under the MIT license.
