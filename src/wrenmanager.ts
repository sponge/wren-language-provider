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
  variables: Map<string, vscode.CompletionItem[]> = new Map();
  paths: Array<string> = [];
  pending: Set<string> = new Set();

  completions: Array<vscode.CompletionItem> = [];
  signatures: [string, vscode.SignatureInformation][] = [];

  constructor() {

  }

  addPathToSearch(p: string): void {
    this.paths.push(p);
  }

  updateCompletionItems(): void {
    console.info("Regenerating completion items");

    this.completions = [];
    this.signatures = [];
    this.variables = new Map();

    const methodSet: Set<string> = new Set();
    const classSet: Set<string> = new Set();

    for (let e of this.trees.entries()) {
      const path: string = e[0];
      const module: any = e[1];

      const classVars: vscode.CompletionItem[] = [];
      this.variables.set(path, classVars);
      const uniqVars: Set<string> = new Set();

      module.statements.filter(o => o.type === 'ClassStmt')
        .forEach((c: any) => {
          if (!classSet.has(c.name.text)) {
            this.completions.push(new vscode.CompletionItem(c.name.text, vscode.CompletionItemKind.Class));
            classSet.add(c.name.text);
          }

          for (let m of c.methods) {
            let label = '';
            if (m.constructKeyword) { label += 'construct '; }
            if (m.foreignKeyword) { label += 'foreign '; }
            if (m.staticKeyword) { label += 'static '; }

            const params = m.parameters ? m.parameters.map((t: any) => t.text) : [];
            label += `${c.name.text}.${m.name.text}(${params.join(', ')})`;

            const relPath = vscode.workspace.asRelativePath(m.name.source.path);

            const sig = new vscode.SignatureInformation(label, relPath);
            sig.parameters = params.map((p: any) => new vscode.ParameterInformation(p));
            this.signatures.push([m.name.text, sig]);

            if (!methodSet.has(m.name.text)) {
              this.completions.push(new vscode.CompletionItem(m.name.text, m.staticKeyword ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Method));
              methodSet.add(m.name.text); // FIXME: probably don't want this once we actually resolve classes right? we may have different functions that vary in foreign/static properties
            }

            // grab any variables out
            // TODO: this seems to be incomplete. timer.wren, it only grabs var f, but not the var t inside the block arg
            // probably missing other things
            const visitBody = (m: any) => {
              if (!m.statements) {
                return;
              }

              for (let s of m.statements) {
                if (s === undefined) {
                  console.log('???');
                }
                if (s.body) {
                  visitBody(s.body);
                }

                if (s.blockArgument) {
                  visitBody(s.blockArgument);
                }

                if (s.type === 'VarStmt') {
                  if (uniqVars.has(s.name.text)) {
                    continue;
                  }
                  uniqVars.add(s.name.text);
                  classVars.push(new vscode.CompletionItem(s.name.text, vscode.CompletionItemKind.Variable));
                  continue;
                }

                if (s.type === 'AssignmentExpr' && s.target.name && (s.target.name.type === 'field' || s.target.name.type === 'staticField') ) {
                  if (uniqVars.has(s.target.name.text)) {
                    continue;
                  }
                  uniqVars.add(s.target.name.text);
                  
                  classVars.push(new vscode.CompletionItem(s.target.name.text, vscode.CompletionItemKind.Field));
                  continue;
                }
              }
            }
            try {
              if (m.body) {
                visitBody(m.body);
              }

              if (m.blockArgument) {
                visitBody(m.blockArgument);
              }
            } catch (err) {
              console.error(err);
            }

          }
        });
    }
  }

  updateFileImports(start: Module): void {
    // generate relative paths for every import statement
    const files = start.statements
      .filter((stmt: any) => stmt.type === 'ImportStmt' && stmt.path.text !== '"meta"' && stmt.path.text !== '"random"')
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

    // loop through every file from an import
    for (let fileTuple of files) {
      const file = fileTuple[0];

      let fpath: string = ''; // absolute path of file
      const testPaths = [fileTuple[1], ...this.paths]; // paths to look for file in, first relative, then extra config locations
      let alreadyParsed = false; // if we're in the middle of, or are already parsing
      // for each path, look to see if the file is a dupe, otherwise check if the file exists on disk
      for (let testPath of testPaths) {
        const joinedPath = path.join(testPath, file);
        if (this.trees.has(joinedPath) || this.pending.has(joinedPath)) {
          alreadyParsed = true;
          break;
        }
  
        if (fs.existsSync(joinedPath)) {
          fpath = path.join(testPath, file);
          break;
        }
      }

      // not an error
      if (alreadyParsed) {
        continue;
      }

      // couldn't find the import in any location
      if (fpath === '') {
        console.warn("couldn't find file in any path " + file);
        continue;
      }

      // we found a file, add it to the list of files we're waiting on
      this.pending.add(fpath);

      fs.readFile(fpath, (err, data) => {
        if (err) {
          console.warn("error reading file " + fpath);
        } else {
          this.parseFile(new SourceFile(fpath, data.toString()));
        }

        // trigger completion update even if the last file was an error
        this.pending.delete(fpath);
        if (this.pending.size === 0) {
          console.log("Done reading and parsing files, updating completion items");
          this.updateCompletionItems();
        }
      });
    }

    // after we've went through the files, and aren't waiting on any files to complete
    if (this.pending.size === 0) {
      console.log("No new imports, updating completion items");
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

  getLineInfo(source: string, position:vscode.Position): any {
    const tokens = this.lexString(source).reverse();

    let foundLeftParens = false;
    let currParam = 0;
    let foundDot = true;
    let foundAtLeastOneDot = false;
    const identifiers: object[] = [];

    for (let token of tokens) {
        if (token.columnStart > position.character) {
            continue;
        }

        if (token.type === Token.leftParen) {
            foundLeftParens = true;
        } else if (!foundLeftParens && token.type === Token.comma) {
            currParam += 1;
        } else if (token.type === Token.dot) {
            foundDot = true;
            foundAtLeastOneDot = true;
        } else if (foundDot && token.type === Token.tname) {
            identifiers.push({
              text: token.text,
              isClassName: token.length && token.text[0].toUpperCase() === token.text[0],
              isField: token.length >= 2 && token.text[0] === '_' && token.text[1] !== '_',
              isStaticField: token.length >= 2 && token.text[0] === '_' && token.text[1] === '_'
            });
            foundDot = false;
        }

        //console.log(token);
    }
    console.log(`foundLeftParens: ${foundLeftParens}, currParam: ${currParam}, foundDot: ${foundDot}, identifiers: ${JSON.stringify(identifiers)}`);
    return {foundLeftParens, currParam, foundDot: foundAtLeastOneDot, identifiers};
  }
}

export default WrenManager;