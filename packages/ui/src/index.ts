/**
 * Public surface of the shared UI package.
 *
 * Both `apps/editor` (node-card widgets, toolbar inputs) and
 * `apps/supplier` (form inputs) consume this package. It depends only
 * on MUI / Emotion / React — no engine, no Pixi.
 */

export * from './widgets'
export { theme, geist } from './theme'
