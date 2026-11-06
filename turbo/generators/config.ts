import type { PlopTypes } from "@turbo/gen"
import { registerNewPackageGenerator } from "./commands/new-package.ts"

export default function generator(plop: PlopTypes.NodePlopAPI) {
  registerNewPackageGenerator(plop)
}
