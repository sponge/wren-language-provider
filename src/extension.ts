'use strict';
import * as vscode from 'vscode';

import WrenManager from './wrenmanager';

const WREN_MODE: vscode.DocumentFilter = { language: 'wren', scheme: 'file' };

const manager = new WrenManager();

// class WrenSignatureHelpProvider implements vscode.SignatureHelpProvider {
//     provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SignatureHelp> {
//         const source = new SourceFile(document.fileName, document.getText());
//         const lexer = new Lexer(source);
//         const parser = new Parser(lexer);
//         const ast = parser.parseModule();
//         //throw new Error("Method not implemented.");
//     }

// }

class WrenCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        return new Promise((resolve, reject) => {
            manager.updateFileIfNotExists(document);
            const items = new Array<vscode.CompletionItem>();
            
            items.push(new vscode.CompletionItem("butts"));
            items.push(new vscode.CompletionItem("butts2"));
            items.push(new vscode.CompletionItem("butts3"));

            resolve(items);
        });
    }
}

export function activate(ctx: vscode.ExtensionContext) {
    console.log('wren-language-provider active!');

    // ctx.subscriptions.push(
    //     vscode.languages.registerSignatureHelpProvider(
    //         WREN_MODE, new WrenSignatureHelpProvider(), '(', ','
    //     )
    // );

    ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider(WREN_MODE, new WrenCompletionItemProvider(), '(', ','));
    ctx.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
        if (doc.languageId !== "wren") {
            return;
        }

        manager.updateDocument(doc);
    }));
}

export function deactivate() {
}