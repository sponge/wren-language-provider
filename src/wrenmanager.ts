'use strict';
import * as vscode from 'vscode';

import Lexer from './wrenalyzer-ts/lexer';
import Parser, { Module } from './wrenalyzer-ts/parser';
import Token from './wrenalyzer-ts/token';
import SourceFile from './wrenalyzer-ts/sourcefile';
import * as path from 'path';
import * as fs from 'fs';

class WrenManager {
  trees: Map<string, Module | null> = new Map();
  paths: Array<string> = [];
  pending: Set<string> = new Set();

  methods: Array<vscode.CompletionItem> = [];
  signatures: [string, vscode.SignatureInformation][] = [];

  constructor() {

  }

  addPathToSearch(p: string): void {
    this.paths.push(p);
  }

  updateCompletionItems(): void {
    console.info("regenerating completion items");

    this.methods = [];
    this.signatures = [];

    const methodSet: Set<string> = new Set();

    for (let module of this.trees.values()) {
      module.statements
        .filter(o => o.type === 'ClassStmt')
        .forEach((c: any) => {
          // TODO: we've got all the methods, but probably want fields and eventually everything else
          const methods = c.methods.filter((o: any) => o.type === 'Method');
          for (let m of methods) {
            methodSet.add(m.name.text);

            const params = m.parameters ? m.parameters.map((t: any) => t.text) : [];
            const sig = new vscode.SignatureInformation(`${c.name.text}.${m.name.text}(${params.join(', ')})`, m.name.source.path);
            sig.parameters = params.map((p: any) => new vscode.ParameterInformation(p));
            this.signatures.push([m.name.text, sig]);
          }
        });
    }

    for (let name of methodSet.values()) {
      this.methods.push(new vscode.CompletionItem(name, vscode.CompletionItemKind.Method));
    }
  }

  updateFileImports(start: Module): void {
    let noFilesToUpdate = true;

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

      // set it here so other async operations won't duplicate work
      //this.trees.set(file, null);

      let fpath: string = '';
      const testPaths = [fileTuple[1], ...this.paths];
      for (let testPath of testPaths) {
        if (fs.existsSync(path.join(testPath, file))) {
          fpath = path.join(testPath, file);
          break;
        }
      }

      if (fpath === '') {
        console.warn("couldn't find file in any path " + file);
        continue;
      }

      if (this.pending.has(fpath)) {
        continue;
      }

      this.pending.add(fpath);
      noFilesToUpdate = false;

      fs.readFile(fpath, (err, data) => {
        if (err) {
          console.warn("error reading file " + file);
          return;
        }
        this.parseFile(new SourceFile(file, data.toString()));
        this.pending.delete(fpath);

        if (this.pending.size === 0) {
          console.log("done reading and parsing files, updating completion items");
          this.updateCompletionItems();
        }
      });
    }

    if (noFilesToUpdate && this.pending.size === 0) {
      console.log("no new imports, updating completion items");
      this.updateCompletionItems();
    }
  }

  updateFileIfNotExists(document: vscode.TextDocument): void {
    if (this.trees.has(document.fileName)) {
      return;
    }

    this.parseDocument(document);
  }

  parseFile(source: SourceFile): Module {
    console.log(`Parsing AST for ${source.path}`);

    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const ast = parser.parseModule();

    this.trees.set(source.path, ast);

    this.updateFileImports(ast);

    return ast;
  }

  parseDocument(document: vscode.TextDocument): Module {
    const source = new SourceFile(document.fileName, document.getText());
    const ast = this.parseFile(source);

    return ast;
  }

  lexString(source: string): Token[] {
    const sf = new SourceFile('string', source);
    const lexer = new Lexer(sf);

    let token = lexer.readToken();
    const tokens: Token[] = [];
    while (token.type !== Token.eof) {
      tokens.push(token);
      token = lexer.readToken();
    }
    
    return tokens;
  }
}

export default WrenManager;