'use strict';

const fs = require('fs');

const gonzales = require('gonzales-pe');

const { isInDeclaration, traverse } = require('./util');

/**
 * Return an array of names of variables declared in a source file.
 *
 * @param ast - Gonzales' CSS parse tree
 */
function gatherDeclaredVars(ast, path) {
  const vars = [];
  ast.forEach('declaration', decl => {
    const propNode = decl.first('property');
    if (!propNode) {
      return;
    }

    const varNode = propNode.first('variable');
    if (!varNode) {
      return;
    }

    const ident = varNode.first('ident').content;

    vars.push({
      type: 'variable', 
      path: path, 
      value: ident
    });
  });

  return vars;
}

/**
 * Return an array of identifiers of variables that are used
 * in a source file.
 */
function gatherUsedVars(ast) {
  const used = new Set();
  traverse(ast, (node, stack) => {
    if (node.type === 'variable') {
      if (!isInDeclaration(stack)) {
        const ident = node.first('ident').content;
        used.add(ident);
      }
    }
  });
  return used;
}

function gatherDeclaredMixins(ast, path) {
  const idents = [];
  traverse(ast, (node) => {
    if (node.type === 'mixin') {
      const identNode = node.first('ident');
      if (!identNode) {
        throw new Error('Found mixin with no identifier');
      }
     
      idents.push({
        type: 'mixin', 
        path: path, 
        value: identNode.content
      });
    }
  });
  return idents;
}

function gatherUsedMixins(ast) {
  const idents = [];
  traverse(ast, node => {
    if (node.type === 'include') {
      const identNode = node.first('ident');
      if (!identNode) {
        throw new Error('Found @include rule with no identifier');
      }
      idents.push(identNode.content);
    }
  });
  return idents;
}

function gatherDeclaredFunctions(ast, path) {
  const idents = [];
  traverse(ast, (node) => {
    if (node.type === 'atrule') {
      const atType = node.first('atkeyword').first('ident');
      if (atType.content !== 'function') {
        return;
      }

      const identNode = node.first('function').first('ident');
      if (!identNode) {
        throw new Error('Found @function rule with no identifier');
      }

      idents.push({
        type: 'function', 
        path: path, 
        value: identNode.content
      });

      return false;
    }
  });
  return idents;
}

function gatherUsedFunctions(ast) {
  const idents = [];
  traverse(ast, (node, stack) => {
    if (node.type === 'function' &&
      stack.length > 1 &&
      stack[stack.length - 2].type !== 'atrule') {
      const identNode = node.first('ident');
      if (!identNode) {
        throw new Error('Found function usage with no identifier');
      }
      idents.push(identNode.content);
    }
  });
  return idents;
}

/**
 * Find unused variables and mixins in a set of SASS files.
 *
 * @param {Array<string>} srcFiles - List of source file paths
 * @param {Function} resolver - Optional. Function that takes a path and returns
 *                   its SASS content. If not specified, `fs.readFileSync` is used.
 */
function findUnused(srcFiles, resolver) {
  let declaredVars = [];
  let usedVars = [];

  let declaredMixins = [];
  let usedMixins = [];

  let declaredFunctions = [];
  let usedFunctions = [];

  srcFiles.forEach(path => {
    const src = resolver ? resolver(path) : fs.readFileSync(path).toString();
    const parseTree = gonzales.parse(src, { syntax: 'scss' });

    // Variables
    declaredVars = declaredVars.concat(gatherDeclaredVars(parseTree, path));
    gatherUsedVars(parseTree).forEach(ident => usedVars.push({
      type: 'variable',
      path: path,
      value: ident
    }));

    // Mixins
    declaredMixins = declaredMixins.concat(gatherDeclaredMixins(parseTree, path));
    gatherUsedMixins(parseTree).forEach(ident => usedMixins.push({
      type: 'mixin',
      path: path,
      value: ident
    }));

    // Functions
    declaredFunctions = declaredFunctions.concat(gatherDeclaredFunctions(parseTree, path));
    gatherUsedFunctions(parseTree).forEach(ident => usedFunctions.push({
      type: 'function',
      path: path,
      value: ident
    }));
  });

  const unusedVars = declaredVars.filter(ident => !usedVars.contains(ident));
  const unusedMixins = declaredMixins.filter(ident => !usedMixins.contains(ident));
  const unusedFunctions = declaredFunctions.filter(ident => !usedFunctions.contains(ident));

  return [
    ...unusedVars,
    ...unusedMixins,
    ...unusedFunctions,
  ];
}

module.exports = findUnused;

