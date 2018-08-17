'use strict';
import * as vscode from 'vscode';
import WrenManager from './wrenmanager';
import * as path from 'path';
import * as fs from 'fs';
import Token from './wrenalyzer-ts/token';

const WREN_MODE: vscode.DocumentFilter = { language: 'wren', scheme: 'file' };

const manager = new WrenManager();

class WrenSignatureHelpProvider implements vscode.SignatureHelpProvider {
    public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.SignatureHelp> {
        const currentLine = document.lineAt(position.line).text;
        return new Promise((resolve, reject) => {
            manager.updateFileIfNotExists(document);

            const tokens = manager.lexString(currentLine).reverse();
            let foundLeftParens = false;
            let currParam = 0;
            let foundDot = true;
            const identifiers: string[] = [];
            for (let token of tokens) {
                if (token.columnStart > position.character) {
                    continue;
                }
    
                if (token.type === Token.leftParen) {
                    foundLeftParens = true;
                } else if (!foundLeftParens && token.type === Token.comma) {
                    currParam += 1;
                } else if (foundLeftParens && token.type === Token.dot) {
                    foundDot = true;
                } else if (foundLeftParens && foundDot && token.type === Token.tname) {
                    identifiers.push(token.text);
                    foundDot = false;
                }
    
                //console.log(token);
            }
            //console.log(`foundLeftParens: ${foundLeftParens}, currParam: ${currParam}, identifiers: ${identifiers}`);

            const help = new vscode.SignatureHelp();
            help.activeParameter = currParam;
            help.activeSignature = 0;
            help.signatures = manager.signatures.filter((s:any) => s[0] === identifiers[0]).map((s:any) => s[1]);
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