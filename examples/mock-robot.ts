/**
 * Start a mock Go2 Pro robot for testing without physical hardware.
 *
 * Usage:
 *   npx tsx mock-robot.ts                  # port 9991
 *   npx tsx mock-robot.ts --port 9992      # custom port
 *
 * Then connect to it from the dashboard or direct-control example
 * using "localhost" or "127.0.0.1" as the robot IP.
 */
import { startMockRobot } from "@0g-foundation/zerobot-sdk/mock";

const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? parseInt(process.argv[portArg + 1]) : 9991;

startMockRobot(port);
