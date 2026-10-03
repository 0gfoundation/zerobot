// Copies the committed recordings into public/ so the stage page can play
// them back in hosted mode, where the server can't read examples/.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const from = path.resolve(process.env.RECORDINGS_DIR ?? path.join(root, 'examples/recordings'));
const to = path.join(import.meta.dirname, '../public/recordings');

fs.rmSync(to, { recursive: true, force: true });
for (const robot of fs.readdirSync(from, { withFileTypes: true })) {
	if (!robot.isDirectory()) continue;
	fs.mkdirSync(path.join(to, robot.name), { recursive: true });
	for (const file of fs.readdirSync(path.join(from, robot.name))) {
		if (file.endsWith('.json')) {
			fs.copyFileSync(path.join(from, robot.name, file), path.join(to, robot.name, file));
		}
	}
}
