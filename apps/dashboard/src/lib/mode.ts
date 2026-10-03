/**
 * Local mode runs on the robot's network and adds what has to reach the
 * robot: direct control, the mock robot and live recordings. Hosted mode
 * only talks to the chain. Set by `ZEROBOT_MODE` at build time (next.config.ts).
 */
export const LOCAL_MODE = process.env.NEXT_PUBLIC_ZEROBOT_MODE === 'local';
