import { config as pingPongMorphing } from './ping-pong-morphing/config'
import { config as godRays } from './god-rays/config'
import { config as lightBeam } from './light-beam/config'
import { config as dotGridOrbit } from './dot-grid-orbit/config'
import { config as dropGridOrbit } from './drop-grid-orbit/config'
import { config as glowDropOrbit } from './glow-drop-orbit/config'
import { config as neonRingOrbit } from './neon-ring-orbit/config'
import { config as textGridOrbit } from './text-grid-orbit/config'
import { config as textOrbit } from './text-orbit/config'
import { config as dotOrbit } from './dot-orbit/config'
import { config as marchingAnts } from './marching-ants/config'
import type { PlaygroundConfig } from '../pipeline/types'

export const effects: PlaygroundConfig[] = [
    pingPongMorphing,
    godRays,
    lightBeam,
    dotGridOrbit,
    dropGridOrbit,
    glowDropOrbit,
    neonRingOrbit,
    textGridOrbit,
    textOrbit,
    dotOrbit,
    marchingAnts,
]
