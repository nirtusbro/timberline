/** The little of Node the tests use, so they type-check without @types/node. */
declare module "node:fs" {
  export function writeFileSync(path: string, data: string): void;
}
