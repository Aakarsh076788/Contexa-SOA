import { registry } from './registry.js';
import { ChromeConnector } from './chrome.js';
import { VSCodeConnector } from './vscode.js';
import { GitHubConnector } from './github.js';
import { DiscordConnector } from './discord.js';
import { TelegramConnector } from './telegram.js';

registry.register(new ChromeConnector());
registry.register(new VSCodeConnector());
registry.register(new GitHubConnector());
registry.register(new DiscordConnector());
registry.register(new TelegramConnector());

export { registry };
