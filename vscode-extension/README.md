# Contexa VS Code connector

For a development install, open this folder in VS Code and press F5 using **Run Contexa Extension**. In the new extension-host window:

1. Configure `contexa.apiBase` if your API is not at `http://127.0.0.1:4000`.
2. Generate a code in **Contexa → Connectors → VS Code**.
3. Run **Contexa: Pair Workspace** in the Command Palette and enter that code.
4. Open or save a file. The status bar reports the last delivery or a connection problem.

Pairing stores the connector token in VS Code SecretStorage and enables collection. **Contexa: Set Device Token** supports manual setup. Existing `contexa.sessionToken` settings remain readable for compatibility, but new setups use SecretStorage.

The connector sends workspace name, relative file path, language, opened-file and save metadata. It does not send source code, terminal commands or environment-variable contents. Only file-scheme documents are tracked; repeated events are throttled after successful delivery.

To package a VSIX, install this extension's development dependencies and run its package script. The root application's ZIP download includes these sources and its launch configuration; it is a development bundle, not a VSIX marketplace install.
