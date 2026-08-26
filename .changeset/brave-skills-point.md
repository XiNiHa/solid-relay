---
"solid-relay": patch
---

feat: add `solid-relay` agent skill

Adds a pointer skill under `skills/solid-relay` that routes agents to the guide docs. The guides are embedded into the skill's `references/` directory at build time, and the reference table is generated from each guide's `skillPointer` frontmatter field.
