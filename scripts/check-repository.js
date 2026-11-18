import { execFileSync } from 'node:child_process';
const git = process.platform === 'darwin' ? '/usr/bin/git' : 'git';
const paths = execFileSync(git, ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = paths.filter(file => /^\.env(?:\.|$)/.test(file) && file !== '.env.example' || /^(?:\.local\/|backend\/data\/.*\.json$|connectors\/(?:discord\/servers|telegram\/chats)\.json$)/.test(file));
if (forbidden.length) {
  console.error('Private runtime paths must not be committed:', forbidden.join(', '));
  process.exitCode = 1;
} else console.log('No private runtime paths tracked. This check does not scan historical Git objects.');
