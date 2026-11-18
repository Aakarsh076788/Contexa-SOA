export const APP_CATALOG = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    category: 'Browsers',
    tag: 'Browser Extension',
    color: '#EA4335',
    downloadUrl: '/downloads/contexa-chrome-extension.zip',
    downloadName: 'contexa-chrome-extension.zip',
    description: 'Captures tab titles, domains, search terms, and URL paths. Skips incognito and Contexa pages.',
    scopes: ['tab_history', 'search_queries', 'active_urls'],
    steps: [
      { title: 'Download & Extract Extension', text: 'Download the Contexa Chrome Extension package (.zip) below and unzip it to any folder on your computer.' },
      { title: 'Open Chrome Extensions', text: 'Open Google Chrome, navigate to chrome://extensions in your address bar, and turn ON "Developer mode" in the top-right corner.' },
      { title: 'Load Unpacked Extension', text: 'Click the "Load unpacked" button in Chrome and select the extracted extension folder.' },
      { title: 'Type 6-Character Code', text: 'Click the Contexa icon in your Chrome toolbar and type the 6-character code shown above to connect instantly!' }
    ]
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'Developer Tools',
    tag: 'IDE Extension',
    color: '#007ACC',
    downloadUrl: '/downloads/contexa-vscode-extension.zip',
    downloadName: 'contexa-vscode-extension.zip',
    description: 'Captures opened and saved file metadata, workspace names, and language. Source code and terminal commands are not collected.',
    scopes: ['active_files', 'workspace_path', 'command_metadata'],
    steps: [
      { title: 'Download & Extract Extension', text: 'Download the Contexa VS Code Extension package (.zip) below and extract it.' },
      { title: 'Open in VS Code', text: 'Open the extracted folder in VS Code and press F5 (or Run ➔ Start Debugging) to launch the extension host.' },
      { title: 'Set Device Token', text: 'In the extension host, run "Contexa: Pair Workspace" from the Command Palette and enter the 6-character code shown here.' }
    ]
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'Developer Tools',
    tag: 'Cloud Integration',
    color: '#9333EA',
    description: 'Syncs issue and pull request metadata from your recently updated repositories when you request a sync.',
    scopes: ['repo:read', 'issues:read', 'pull_requests:read'],
    steps: [
      { title: 'Create Personal Access Token', text: 'Go to GitHub Settings ➔ Developer Settings ➔ Personal Access Tokens.' },
      { title: 'Grant Read Scopes', text: 'Generate a token with read-only access for issues and pull requests.' },
      { title: 'Connect & Sync', text: 'Paste your token in the "Credentials & Config" tab and click "Connect GitHub", then click "Sync Activity".' }
    ]
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'Communication',
    tag: 'Bot Gateway',
    color: '#5865F2',
    inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1542782626165690408&permissions=68608&scope=bot%20applications.commands',
    description: 'Captures activity from linked servers, subject to gateway channel filters and your collection settings.',
    scopes: ['messages:read', 'channels:view'],
    steps: [
      { title: 'Add Contexa Bot to Server', text: 'Click the "Add Bot to Discord" button below and authorize the official Contexa bot into your Discord server.' },
      { title: 'Type !link in Discord', text: 'As a server administrator or member with Manage Server permission, type !link and the 6-character code in the channel you want to capture. Only approved channels are linked.' }
    ]
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'Communication',
    tag: 'Bot Gateway',
    color: '#229ED9',
    inviteUrl: 'https://t.me/contexa_app_bot?startgroup=true',
    description: 'Captures activity from linked Telegram chats and groups according to your collection settings.',
    scopes: ['messages:read', 'groups:view'],
    steps: [
      { title: 'Add Bot to Telegram Group or Chat', text: 'Click the "➕ Add Bot to Telegram" button below or open @contexa_app_bot in Telegram.' },
      { title: 'Type /link in Telegram', text: 'As a group administrator, type /link and the 6-character code in the group you want to capture. You can also link your private chat with the bot.' }
    ]
  }
];
