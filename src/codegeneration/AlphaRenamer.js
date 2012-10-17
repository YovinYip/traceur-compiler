// Copyright 2012 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import ParseTreeTransformer from 'ParseTreeTransformer.js';
import PredefinedName from '../syntax/PredefinedName.js';
import {
  createFunctionDeclaration,
  createIdentifierExpression
} from 'ParseTreeFactory.js';
import createObject from '../util/util.js';
import trees from '../syntax/trees/ParseTrees.js';
import {
  variablesInBlock,
  variablesInFunction
} from '../semantics/VariableBinder.js';

var Block = trees.Block;
var Catch = trees.Catch;
var FunctionDeclaration = trees.FunctionDeclaration;
var IdentifierExpression = trees.IdentifierExpression;

/**
 * Replaces one identifier with another identifier (alpha
 * renaming). This transformation is safe to use for renaming a
 * declared variable ({@code var}, {@code const} or {@code let}) or
 * formal parameter, if the variable's scope isn't dynamically limited
 * using the {@code with} statement, nor its name observed with
 * {@code eval} or in a property binding, and so on.
 *
 * Creates an {@code AlphaRenamer} that will replace uses of the
 * identifier {@code oldName} with {@code newName}.
 *
 * @param {string} oldName
 * @param {string} newName
 * @extends {ParseTreeTransformer}
 * @constructor
 */
export function AlphaRenamer(oldName, newName) {
  ParseTreeTransformer.call(this);
  this.oldName_ = oldName;
  this.newName_ = newName;
}

/**
 * Alpha-renames {@code oldName} to {@code newName} in {@code tree}
 * and returns the new {@code ParseTree}.
 *
 * <p>Renaming is applied throughout the lexical scope of the
 * variable. If the old name is freshly bound alpha-renaming doesn't
 * propagate there; for example, renaming {@code "a"} to {@code "b"}
 * in the following program:
 *
 * <pre>
 * function a(a) {
 *   ...
 * }
 * </pre>
 * Will produce:
 * <pre>
 * function b(a) {
 *   ...
 * }
 * </pre>
 *
 * @param {ParseTree} tree the tree to substitute names in.
 * @param {string} oldName the identifier to be replaced.
 * @param {string} newName the identifier that will appear instead of {@code oldName}.
 * @return {ParseTree} a copy of {@code tree} with replacements.
 */
AlphaRenamer.rename = function(tree, oldName, newName) {
  return new AlphaRenamer(oldName, newName).transformAny(tree);
};

var proto = ParseTreeTransformer.prototype;
AlphaRenamer.prototype = createObject(proto, {

  /**
   * @param {Block} tree
   * @return {ParseTree}
   */
  transformBlock: function(tree) {
    if (this.oldName_ in variablesInBlock(tree)) {
      // the old name is bound in the block, skip rename
      return tree;
    } else {
      return proto.transformBlock.call(this, tree);
    }
  },

  /**
   * @param {IdentifierExpression} tree
   * @return {ParseTree}
   */
  transformIdentifierExpression: function(tree) {
    if (this.oldName_ == tree.identifierToken.value) {
      return createIdentifierExpression(this.newName_);
    } else {
      return tree;
    }
  },

  transformThisExpression: function(tree) {
    if (this.oldName_ !== PredefinedName.THIS)
      return tree;
    return createIdentifierExpression(this.newName_);
  },

  /**
   * @param {FunctionDeclaration} tree
   * @return {ParseTree}
   */
  transformFunctionDeclaration: function(tree) {
    if (this.oldName_ == tree.name) {
      // it is the function that is being renamed
      tree = createFunctionDeclaration(this.newName_,
          tree.formalParameterList, tree.functionBody);
    }

    // Do not recurse into functions if:
    //  - 'arguments' is implicitly bound in function bodies
    //  - 'this' is implicitly bound in function bodies
    //  - this.oldName_ is rebound in the new nested scope
    var doNotRecurse =
        this.oldName_ === PredefinedName.ARGUMENTS ||
        this.oldName_ === PredefinedName.THIS ||
        this.oldName_ in variablesInFunction(tree);
    if (doNotRecurse)
      return tree;
    else
      return proto.transformFunctionDeclaration.call(this, tree);
  },

  /**
   * @param {Catch} tree
   * @return {ParseTree}
   */
  transformCatch: function(tree) {
    if (!tree.binding.isPattern() &&
        this.oldName_ === tree.binding.identifierToken.value) {
      // this.oldName_ is rebound in the catch block, so don't recurse
      return tree;
    }

    // TODO(arv): Compare the old name to the bindings in the pattern.
    return proto.transformCatch.call(this, tree);
  }
});
