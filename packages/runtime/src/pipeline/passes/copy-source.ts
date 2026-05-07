import type { FullscreenPass } from '../types'

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uDiffuse;
void main() {
    fragColor = texture(uDiffuse, vUV);
}
`

/**
 * Stock first-pass that draws the Effect node's `source` input as the canvas
 * background. Skipped automatically when `source` is not connected.
 */
export const copySourcePass: FullscreenPass = {
    id: 'background',
    kind: 'fullscreen',
    blend: 'normal',
    fragment: FRAGMENT,
    requiresInputs: ['source'],
}
