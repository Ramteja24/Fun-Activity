// Sets (or changes) the admin login: the only account that can create rooms and host the games.
//
//   npm run admin                         asks for the username and password
//   npm run admin -- <username>           asks only for the password
//
// Saves a scrypt hash of the password (never the password) to admin.json, which git ignores. Running it again replaces the
// login and signs out every browser that was logged in as admin. Restart the server (npm start) afterwards.
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { ADMIN_FILE, makeCredentials } from '../server/admin';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // print the question, then echo nothing while the password is typed
      const out = rl as unknown as { _writeToOutput: (s: string) => void };
      let asked = false;
      out._writeToOutput = (s: string) => {
        if (!asked) {
          process.stdout.write(s);
          asked = true;
        }
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const argUser = process.argv[2];
const username = (argUser ?? (await ask('Admin username: '))).trim();
const password = await ask('Admin password (at least 8 characters): ', true);
const again = await ask('Type the password again: ', true);
if (password !== again) {
  console.error('The two passwords are different. Nothing was saved.');
  process.exit(1);
}
try {
  const creds = makeCredentials(username, password);
  writeFileSync(ADMIN_FILE, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 });
  console.log(`Saved the admin login for "${creds.username}" to ${ADMIN_FILE}.`);
  console.log('Restart the server (npm start) for it to take effect.');
} catch (e) {
  console.error((e as Error).message, 'Nothing was saved.');
  process.exit(1);
}
