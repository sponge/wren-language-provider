'use strict';
import * as vscode from 'vscode';

import Lexer from './wrenalyzer-ts/lexer';
import Parser, { Module, ImportStmt } from './wrenalyzer-ts/parser';
import SourceFile from './wrenalyzer-ts/sourcefile';
import * as path from 'path';
import * as fs from 'fs';

class WrenManager {
  trees: Map<string, Module> = new Map();

  constructor() {

  }

  updateCompletionItems() {
    console.log("updating completion items");
  }

  updateFileImports(start: Module) {
    const paths = start.statements
      .filter(stmt => stmt.type === 'ImportStmt')
      .map((stmt: any) => {
        let relPath = stmt.path.text.replace(/\"/g, '');
        if (relPath.startsWith('./') === false) {
          relPath = './' + relPath;
        }
        if (relPath.endsWith('.wren') === false) {
          relPath += '.wren';
        }

        const fileDir = path.dirname(stmt.path.source.path);
        const importPath = path.join(fileDir, relPath);
        return importPath;
      });

    let filesLeft = paths.length;
    paths.forEach((file) => {
      if (this.trees.has(file)) {
        return;
      }

      fs.readFile(file, (err, data) => {
        if (err) {
          console.warn("couldn't find file " + file);
          filesLeft--;
          return;
        }
        this.parseFile(new SourceFile(file, data.toString()));
        filesLeft--;

        if (filesLeft <= 0) {
          this.updateCompletionItems();
        }
        
      });
    });
  }

  updateFileIfNotExists(document: vscode.TextDocument) {
    if (this.trees.has(document.fileName)) {
      return;
    }

    const module = this.updateDocument(document);
    this.updateFileImports(module);
  }

  parseFile(source: SourceFile): Module {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const ast = parser.parseModule();

    this.trees.set(source.path, ast);

    this.updateFileImports(ast);

    return ast;
  }

  updateDocument(document: vscode.TextDocument): Module {
    const source = new SourceFile(document.fileName, document.getText());
    const ast = this.parseFile(source);

    return ast;
  }
}

export default WrenManager;