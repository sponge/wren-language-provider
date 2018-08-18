'use strict';
import * as vscode from 'vscode';
import WrenManager from './wrenmanager';
import * as path from 'path';
import * as fs from 'fs';

const WREN_MODE: vscode.DocumentFilter = { language: 'wren', scheme: 'file' };

const manager = new WrenManager();

class WrenSignatureHelpProvider implements vscode.SignatureHelpProvider {
    public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.SignatureHelp> {
        const currentLine = document.lineAt(position.line).text;

        return new Promise((resolve, reject) => {
            manager.updateFileIfNotExists(document);

            const info: any = manager.getLineInfo(currentLine, position);

            const help = new vscode.SignatureHelp();
            help.activeParameter = info.currParam;
            help.activeSignature = 0;
            help.signatures = manager.signatures.filter((s:any) => s[0] === info.identifiers[0].text).map((s:any) => s[1]);
            resolve(help);
        });
    }

}

class WrenCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        const currentLine = document.lineAt(position.line).text;

        return new Promise((resolve, reject) => {
            manager.updateFileIfNotExists(document);
            const info = manager.getLineInfo(currentLine, position);

            // some really basic filtering rules here just to knock a bunch of completions out.
            let results: vscode.CompletionItem[] = manager.completions
                // don't show methods or (static) functions if the line is bare
                .filter((c: any) => !info.foundDot ? (c.kind === vscode.CompletionItemKind.Method || c.kind === vscode.CompletionItemKind.Function) === false : true)
                // don't show classes if the line has any dots
                .filter((c: any) => info.foundDot ? c.kind !== vscode.CompletionItemKind.Class : true)
                // filter out static functions or class methods if the identifier is a class (first letter capitalized)
                .filter((c: any): boolean => {
                    if (c.kind === vscode.CompletionItemKind.Method || c.kind === vscode.CompletionItemKind.Function) {
                        if (info.identifiers.length === 0) {
                            return true;
                        }
                        
                        return info.identifiers[0].isClassName ? c.kind !== vscode.CompletionItemKind.Method : c.kind !== vscode.CompletionItemKind.Function;
                    } else {
                        return true;
                    }
                });

            if (manager.variables.has(document.fileName)) {
                const variables = manager.variables.get(document.fileName)!
                    .filter((v: any) => info.foundDot ? v.kind !== vscode.CompletionItemKind.Field : true); 
                results = results.concat(variables);
            }

            resolve(results);
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

        manager.parseDocument(doc);
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