'use strict';
import * as vscode from 'vscode';

import Lexer from './wrenalyzer-ts/lexer';
import Parser, { Module } from './wrenalyzer-ts/parser';
import Token from './wrenalyzer-ts/token';
import SourceFile from './wrenalyzer-ts/sourcefile';
import * as path from 'path';
import * as fs from 'fs';
import { coreModules } from './corewren';

class WrenManager {
  trees: Map<string, Module | null> = new Map(); // the full ast trees for each file
  variables: Map<string, vscode.CompletionItem[]> = new Map(); // all the variables for a file
  searchPaths: Array<string> = []; // additional paths to search if current dir doesn't find a script
  pending: Set<string> = new Set(); // filenames that have not yet resolved

  completions: Array<vscode.CompletionItem> = []; // list of all completions globally. TODO: split up per file?
  signatures: [string, vscode.SignatureInformation][] = []; // [function name, [signatures]] globally, non unique function names

  constructor() {
    // grab the string from corewren.ts to get all the core classes
    const sourceFile = new SourceFile("core", coreModules);
    this.parseFile(sourceFile);
  }

  // add a relative path, useful for global scripts that might not be in the current dir
  addPathToSearch(p: string): void {
    this.searchPaths.push(p);
  }

  // blank out everything and rebuild all generated data
  updateCompletionItems(): void {
    console.info("Regenerating completion items");

    this.completions = [];
    this.signatures = [];
    this.variables = new Map();

    const methodSet: Set<string> = new Set(); // seen method names to prevent dupe completions
    const classSet: Set<string> = new Set(); // seen class names to prevent dupe completions

    // for each ast, go through and grab everything we want to complete
    for (let e of this.trees.entries()) {
      const path: string = e[0];
      const module: any = e[1];

      const classVars: vscode.CompletionItem[] = []; // array of variables for this file
      this.variables.set(path, classVars);
      const uniqVars: Set<string> = new Set(); // per-file, prevent duplicate variable names

      // for each class in the file, go through and grab everything
      module.statements.filter((o:any) => o.type === 'ClassStmt')
        .forEach((c: any) => {
          // if this is a new class, setup the completion for it
          if (!classSet.has(c.name.text)) {
            this.completions.push(new vscode.CompletionItem(c.name.text, vscode.CompletionItemKind.Class));
            classSet.add(c.name.text);
          }

          // for every method, build up the method completion and variables inside
          for (let m of c.methods) {
            let label = '';
            if (m.constructKeyword) { label += 'construct '; }
            if (m.foreignKeyword) { label += 'foreign '; }
            if (m.staticKeyword) { label += 'static '; }

            // get the list of param labels
            const params = m.parameters ? m.parameters.map((t: any) => t.text) : [];
            label += `${c.name.text}.${m.name.text}(${params.join(', ')})`; // Class.funcName(param1, param2, param3)

            // use the relative path if possible to save space in the thumbnail
            const relPath = vscode.workspace.asRelativePath(m.name.source.path);

            // setup the signature object 
            const sig = new vscode.SignatureInformation(label, relPath);
            sig.parameters = params.map((p: any) => new vscode.ParameterInformation(p));
            // we'll use the function name to filter this.signatures when requested
            this.signatures.push([m.name.text, sig]);

            // setup the autocomplete for the function itself, icon depending on static or not
            if (!methodSet.has(m.name.text)) {
              this.completions.push(new vscode.CompletionItem(m.name.text, m.staticKeyword ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Method));
              methodSet.add(m.name.text); // FIXME: probably don't want this once we actually resolve classes right? we may have different functions that vary in foreign/static properties
            }

            // grab any variables out of the body recursively
            // TODO: this seems to be incomplete. timer.wren, it only grabs var f, but not the var t inside the block arg
            // probably missing other things
            const visitBody = (m: any) => {
              // if m.statements is undefined, the iterator will exception out
              if (!m.statements) {
                return;
              }

              for (let s of m.statements) {
                if (s.body) {
                  visitBody(s.body);
                }

                // this might not ever be hit? might need to loop through args in callto find them
                if (s.blockArgument) {
                  visitBody(s.blockArgument);
                }

                // if it's a "var a = 1" grab the name
                if (s.type === 'VarStmt') {
                  if (uniqVars.has(s.name.text)) {
                    continue;
                  }
                  uniqVars.add(s.name.text);
                  classVars.push(new vscode.CompletionItem(s.name.text, vscode.CompletionItemKind.Variable));
                  continue;
                }

                // there are a few types of assignments, some don't have names
                if (s.type === 'AssignmentExpr' && s.target.name && (s.target.name.type === 'field' || s.target.name.type === 'staticField') ) {
                  if (uniqVars.has(s.target.name.text)) {
                    continue;
                  }
                  uniqVars.add(s.target.name.text);
                  
                  classVars.push(new vscode.CompletionItem(s.target.name.text, vscode.CompletionItemKind.Field));
                  continue;
                }
              }
            };

            // exception handler since this one has been tricky
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

  // take a module we've parsed, and recursively parse all the imports
  updateFileImports(start: Module): void {
    // find all imports and generate relative paths for them. exclude the built in optionals
    // since they'll never be found.
    // TODO: wren module loading has changed recently. rethink this once i've upgraded?
    const files = start.statements
      .filter((stmt: any) => stmt.type === 'ImportStmt' && stmt.path.text !== '"meta"' && stmt.path.text !== '"random"')
      .map((stmt: any) => {
        // we get strings with quotes around them, remove them
        let relPath = stmt.path.text.replace(/\"/g, '');
        // append a ./ and .wren so we can find it on the fs
        if (relPath.startsWith('./') === false) {
          relPath = './' + relPath;
        }
        if (relPath.endsWith('.wren') === false) {
          relPath += '.wren';
        }

        // return the relative path and the folder of the current script
        return [relPath, path.dirname(stmt.path.source.path)];
      });

    // loop through every file from an import
    for (let fileTuple of files) {
      const file = fileTuple[0];

      let fpath: string = ''; // absolute path of the found file
      const testPaths = [fileTuple[1], ...this.searchPaths]; // paths to look for file in, first relative, then extra config locations
      let alreadyParsed = false; // if we're in the middle of, or are already parsing
      // for each path, look to see if the file is a dupe, otherwise check if the file exists on disk
      for (let testPath of testPaths) {
        const joinedPath = path.join(testPath, file);
        if (this.trees.has(joinedPath) || this.pending.has(joinedPath)) {
          alreadyParsed = true; // track this separately since it's expected
          break;
        }
  
        // TODO: is the synchronous api bad here? it's probably quick enough.
        if (fs.existsSync(joinedPath)) {
          fpath = path.join(testPath, file);
          break;
        }
      }

      // not an error
      if (alreadyParsed) {
        continue;
      }

      // couldn't find the import in any location, warn and move on
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

        // trigger completion update, so we don't update if the last file was an error
        this.pending.delete(fpath);
        if (this.pending.size === 0) {
          console.log("Done reading and parsing files, updating completion items");
          this.updateCompletionItems();
        }
      });
    }

    // after we've went through the files, and aren't waiting on any files to complete
    // (aka if a file without any imports happens)
    if (this.pending.size === 0) {
      console.log("No new imports, updating completion items");
      this.updateCompletionItems();
    }
  }

  // trigger an update if we don't have the current document
  updateFileIfNotExists(document: vscode.TextDocument): void {
    if (this.trees.has(document.fileName)) {
      return;
    }

    this.parseDocument(document);
  }

  // parse the ast, save it, and parse the imports
  parseFile(source: SourceFile): Module {
    console.log(`Parsing AST for ${source.path}`);

    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const ast = parser.parseModule();

    this.trees.set(source.path, ast);

    this.updateFileImports(ast);

    return ast;
  }

  // create a SourceFile from a vs document and parse it
  parseDocument(document: vscode.TextDocument): Module {
    const source = new SourceFile(document.fileName, document.getText());
    const ast = this.parseFile(source);

    return ast;
  }

  // used for completion, we'll usually pass a single line into this and mess with tokens
  lexString(source: string): Token[] {
    const sf = new SourceFile('string', source);
    const lexer = new Lexer(sf);

    // generate an array of them instead of using the lexer api
    let token = lexer.readToken();
    const tokens: Token[] = [];
    while (token.type !== Token.eof) {
      tokens.push(token);
      token = lexer.readToken();
    }
    
    return tokens;
  }

  // return an object of whatever we need in the extension to try and filter results
  // and also to provide the argument completion
  getLineInfo(source: string, position:vscode.Position): any {
    const tokens = this.lexString(source).reverse();

    // if we find a left parens, we're done parsing arguments
    let foundLeftParens = false;
    // used to highlight which param we're on
    let currParam = 0;
    // we've found a dot token, will be reset once we find a string.
    // used to identify ex Draw.rect => ['rect', 'Draw']
    let foundDot = true;
    // this is kinda dumb but it's useful for the caller to know if there's been any dot
    // so we can know if we should show class names, etc
    let foundAtLeastOneDot = false; 
    const identifiers: object[] = [];

    for (let token of tokens) {
      // we don't care about anything ahead of us yet
      if (token.columnStart > position.character) {
          continue;
      }

      if (token.type === Token.leftParen) {
        // don't count anymore params
        foundLeftParens = true;
      } else if (!foundLeftParens && token.type === Token.comma) {
        // we're inside a param list, figure out what param we're on
        currParam += 1;
      } else if (token.type === Token.dot) {
        // reset the identifier finder but note for the return value that there's been one
        foundDot = true;
        foundAtLeastOneDot = true;
      } else if (foundDot && token.type === Token.tname) {
        // if we've found a dot (or this is the first name token) push it to a list of identifiers
        // that we've found on this line
        identifiers.push({
          text: token.text,
          isClassName: token.length && token.text[0].toUpperCase() === token.text[0],
          isField: token.length >= 2 && token.text[0] === '_' && token.text[1] !== '_',
          isStaticField: token.length >= 2 && token.text[0] === '_' && token.text[1] === '_'
        });
        // reset so we need to find another dot first
        // this might not be necessary?
        foundDot = false;
      }

      //console.log(token);
    }
    console.log(`foundLeftParens: ${foundLeftParens}, currParam: ${currParam}, foundDot: ${foundDot}, identifiers: ${JSON.stringify(identifiers)}`);
    return {foundLeftParens, currParam, foundDot: foundAtLeastOneDot, identifiers};
  }
}

export default WrenManager;