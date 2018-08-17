'use strict';
import * as vscode from 'vscode';
import WrenManager from './wrenmanager';
import * as path from 'path';
import * as fs from 'fs';

const WREN_MODE: vscode.DocumentFilter = { language: 'wren', scheme: 'file' };

const manager = new WrenManager();

class WrenSignatureHelpProvider implements vscode.SignatureHelpProvider {
    public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.SignatureHelp> {
        let lastWordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
        if (!lastWordRange) {
            lastWordRange = document.getWordRangeAtPosition(new vscode.Position(position.line, position.character-1))
        }

        if (!lastWordRange) {
            console.log("fuck if i know");
            return new Promise((resolve, reject) => {
                reject();
            });
        }
        
        const lastWord = document.getText( lastWordRange );
        return new Promise((resolve, reject) => {
            manager.updateFileIfNotExists(document);
            const help = new vscode.SignatureHelp();
            help.activeParameter = 0;
            help.activeSignature = 0;
            help.signatures = manager.signatures.filter((s:any) => s[0] === lastWord).map((s:any) => s[1]);
            resolve(help);
        });
    }

}

class WrenCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        return new Promise((resolve, reject) => {
            manager.updateFileIfNotExists(document);
            resolve(manager.methods);
        });
    }
}

export function activate(ctx: vscode.ExtensionContext) {
    console.log('wren-language-provider active!');

    ctx.subscriptions.push(vscode.languages.registerSignatureHelpProvider(WREN_MODE, new WrenSignatureHelpProvider(), '(', ','));
    ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(WREN_MODE, new WrenCompletionItemProvider(), '.'));
    ctx.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
        if (doc.languageId !== "wren") {
            return;
        }

        manager.updateDocument(doc);
    }));

    const config = vscode.workspace.getConfiguration('wren');
    for (let additionalPath of config.additionalModuleDirectories) {
        if (vscode.workspace.workspaceFolders === undefined) {

        } else {
            for (let ws of vscode.workspace.workspaceFolders) {
                const scriptPath = path.join(ws.uri.fsPath, additionalPath);
                if (fs.existsSync(scriptPath)) {
                    manager.addPathToSearch(scriptPath);
                }
            }
        }
    }
}

export function deactivate() {
}