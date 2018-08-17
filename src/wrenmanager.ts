'use strict';
import * as vscode from 'vscode';

import Lexer from './wrenalyzer-ts/lexer';
import Parser, { Module } from './wrenalyzer-ts/parser';
import SourceFile from './wrenalyzer-ts/sourcefile';
import * as path from 'path';
import * as fs from 'fs';

class WrenManager {
  trees: Map<string, Module> = new Map();
  paths: Array<string> = [];

  methods: Array<vscode.CompletionItem> = [];
  signatures: [string, vscode.SignatureInformation][] = [];

  constructor() {

  }

  addPathToSearch(p: string) {
    this.paths.push(p);
  }

  updateCompletionItems() {
    this.methods = [];
    this.signatures = [];

    const methodSet: Set<string> = new Set();

    for (let module of this.trees.values()) {
      module.statements
        .filter(o => o.type === 'ClassStmt')
        .map((o: any) => o.methods)
        .reduce((accum: any, val: any) => accum.concat(val), [])
        .filter((o: any) => o.type === 'Method')
        .forEach((m: any) => {
          methodSet.add(m.name.text);

          const params = m.parameters ? m.parameters.map((t: any) => t.text) : [];
          const sig = new vscode.SignatureInformation(`${m.name.text}(${params.join(', ')})`);
          sig.parameters = params.map((p: any) => new vscode.ParameterInformation(p));
          this.signatures.push([m.name.text, sig]);
        });
    }

    for (let name of methodSet.values()) {
      this.methods.push(new vscode.CompletionItem(name, vscode.CompletionItemKind.Method));
    }
  }

  updateFileImports(start: Module) {
    const files = start.statements
      .filter(stmt => stmt.type === 'ImportStmt')
      .map((stmt: any) => {
        let relPath = stmt.path.text.replace(/\"/g, '');
        if (relPath.startsWith('./') === false) {
          relPath = './' + relPath;
        }
        if (relPath.endsWith('.wren') === false) {
          relPath += '.wren';
        }

        return [relPath, path.dirname(stmt.path.source.path)];
      });

    for (let fileTuple of files) {
      const file = fileTuple[0];

      if (this.trees.has(file)) {
        continue;
      }

      let fpath: string | undefined = undefined;
      const testPaths = [fileTuple[1], ...this.paths];
      for (let testPath of testPaths) {
        if (fs.existsSync(path.join(testPath, file))) {
          fpath = path.join(testPath, file);
          break;
        }
      }

      if (fpath === undefined) {
        console.warn("couldn't find file in any path " + file);
        continue;
      }

      fs.readFile(fpath, (err, data) => {
        if (err) {
          console.warn("error reading file " + file);
          return;
        }
        this.parseFile(new SourceFile(file, data.toString()));
      });
    }
  }

  updateFileIfNotExists(document: vscode.TextDocument) {
    if (this.trees.has(document.fileName)) {
      return;
    }

    const module = this.updateDocument(document);
    this.updateFileImports(module);

    this.updateCompletionItems();
  }

  parseFile(source: SourceFile): Module {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const ast = parser.parseModule();

    this.trees.set(source.path, ast);

    this.updateFileImports(ast);

    // fixme: this won't work fully since async stuff happens in updateFileImports
    this.updateCompletionItems();

    return ast;
  }

  updateDocument(document: vscode.TextDocument): Module {
    const source = new SourceFile(document.fileName, document.getText());
    const ast = this.parseFile(source);

    return ast;
  }
}

export default WrenManager;