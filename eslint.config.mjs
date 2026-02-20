import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

// `eslint-config-next` (Next 16) ships a flat config array.
const nextFlatConfig = require("eslint-config-next")

const config = [...nextFlatConfig]

export default config

