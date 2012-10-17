// Copyright 2012 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import ParseTreeTransformer from '../ParseTreeTransformer.js';
import ParseTreeType from '../../syntax/trees/ParseTree.js';
import PredefinedName from '../../syntax/PredefinedName.js';
import TokenType from '../../syntax/TokenType.js';
import {
  createArgumentList,
  createAssignmentStatement,
  createBinaryOperator,
  createBlock,
  createCallStatement,
  createContinueStatement,
  createEmptyArrayLiteralExpression,
  createForInStatement,
  createForStatement,
  createIdentifierExpression,
  createIfStatement,
  createMemberExpression,
  createMemberLookupExpression,
  createNumberLiteral,
  createOperatorToken,
  createParenExpression,
  createPostfixExpression,
  createUnaryExpression,
  createVariableDeclarationList,
  createVariableStatement
} from '../ParseTreeFactory.js';
import createObject from '../../util/util.js';
import trees from '../../syntax/trees/ParseTrees.js';

var IdentifierExpression = trees.IdentifierExpression;


/**
 * Desugars for-in loops to be compatible with generators.
 * @param {UniqueIdentifierGenerator} identifierGenerator
 * @constructor
 */
export function ForInTransformPass(identifierGenerator) {
  ParseTreeTransformer.call(this);
  this.identifierGenerator_ = identifierGenerator;
}

/*
 * @param {UniqueIdentifierGenerator} identifierGenerator
 * @param {ParseTree} tree
 */
ForInTransformPass.transformTree = function(identifierGenerator, tree) {
  return new ForInTransformPass(identifierGenerator).transformAny(tree);
};

ForInTransformPass.prototype = createObject(
    ParseTreeTransformer.prototype, {

  // for ( var key in object ) statement
  //
  // var $keys = [];
  // var $collection = object;
  // for (var $p in $collection) $keys.push($p);
  // for (var $i = 0; $i < $keys.length; $i++) {
  //   var key;
  //   key = $keys[$i];
  //   if (!(key in $collection))
  //     continue;
  //   statement
  // }
  /**
   * @param {ForInStatement} original
   * @return {ParseTree}
   */
  transformForInStatement: function(original) {
    var tree = original;

    // Transform body first
    var bodyStatements = [];
    var body = this.transformAny(tree.body);
    if (body.type == ParseTreeType.BLOCK) {
      bodyStatements.push.apply(bodyStatements, body.statements);
    } else {
      bodyStatements.push(body);
    }

    var elements = [];

    // var $keys = [];
    var keys = this.identifierGenerator_.generateUniqueIdentifier();
    elements.push(
        createVariableStatement(TokenType.VAR, keys,
        createEmptyArrayLiteralExpression()));

    // var $collection = object;
    var collection = this.identifierGenerator_.generateUniqueIdentifier();
    elements.push(createVariableStatement(TokenType.VAR, collection, tree.collection));

    // for (var $p in $collection) $keys.push($p);
    var p = this.identifierGenerator_.generateUniqueIdentifier();
    elements.push(
        createForInStatement(
            // var $p
            createVariableDeclarationList(TokenType.VAR, p, null),
            // $collection
            createIdentifierExpression(collection),
            // $keys.push($p)
            createCallStatement(
                createMemberExpression(keys, PredefinedName.PUSH),
                createArgumentList(createIdentifierExpression(p)))));

    var i = this.identifierGenerator_.generateUniqueIdentifier();

    // $keys[$i]
    var lookup = createMemberLookupExpression(
        createIdentifierExpression(keys),
        createIdentifierExpression(i));

    var originalKey, assignOriginalKey;
    if (tree.initializer.type == ParseTreeType.VARIABLE_DECLARATION_LIST) {
      var decList = tree.initializer;
      originalKey = createIdentifierExpression(decList.declarations[0].lvalue);
      // var key = $keys[$i];
      assignOriginalKey = createVariableStatement(decList.declarationType,
          originalKey.identifierToken, lookup);
    } else if (tree.initializer.type == ParseTreeType.IDENTIFIER_EXPRESSION) {
      originalKey = tree.initializer;
      // key = $keys[$i];
      assignOriginalKey = createAssignmentStatement(tree.initializer, lookup);
    } else {
      throw new Error('Invalid left hand side of for in loop');
    }

    var innerBlock = [];

    // var key = $keys[$i];
    innerBlock.push(assignOriginalKey);

    // if (!(key in $collection))
    innerBlock.push(
        createIfStatement(
            createUnaryExpression(
                createOperatorToken(TokenType.BANG),
                createParenExpression(
                    createBinaryOperator(
                        originalKey,
                        createOperatorToken(TokenType.IN),
                        createIdentifierExpression(collection)))),
            // continue
            createContinueStatement(),
            null));

    // add original body
    innerBlock.push.apply(innerBlock, bodyStatements);

    // for (var $i = 0; $i < $keys.length; $i++) {
    elements.push(
        createForStatement(
            // var $i = 0
            createVariableDeclarationList(TokenType.VAR, i, createNumberLiteral(0)),
            // $i < $keys.length
            createBinaryOperator(
                createIdentifierExpression(i),
                createOperatorToken(TokenType.OPEN_ANGLE),
                createMemberExpression(keys, PredefinedName.LENGTH)),
            // $i++
            createPostfixExpression(
                createIdentifierExpression(i),
                createOperatorToken(TokenType.PLUS_PLUS)),
            // body
            createBlock(innerBlock)));

    return createBlock(elements);
  }
});
