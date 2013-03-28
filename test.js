var Workspace = require("./tiny").Workspace;
var Rule = require("./tiny").Rule;
var assert = require("assert");
var _ = require("underscore");

basic();
derivationRule();

function basic() {
    var ws = new Workspace();
    ws.insert(["parent", "ben", "jan"]);
    ws.insert(["parent", "petra", "jan"]);
    ws.insert(["parent", "jan", "zef"]);
    ws.insert(["parent", "antoinet", "zef"]);
    ws.insert(["parent", "antoinet", "wouter"]);
    var result = ws.query(["parent", "jan", "zef"]);
    assert.deepEqual([{}], result);
    
    result = ws.query(["parent", "X", "zef"]);
    assert.equal(1, _.where(result, {X: "jan"}).length);
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(0, _.where(result, {X: "ben"}).length);
    // shouldn't change anything
    ws.fixpoint();
    assert.equal(1, _.where(result, {X: "jan"}).length);
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(0, _.where(result, {X: "ben"}).length);
}

function derivationRule() {
    var ws = new Workspace();
    ws.addRule(new Rule(["ancestor", "A", "B"], 
                        [["parent", "A", "B"]]));
    ws.addRule(new Rule(["ancestor", "A", "C"], 
                        [["ancestor", "A", "B"],
                         ["ancestor", "B", "C"]]));
    ws.insert(["parent", "ben", "jan"]);
    ws.insert(["parent", "petra", "jan"]);
    ws.insert(["parent", "jan", "zef"]);
    ws.insert(["parent", "antoinet", "zef"]);
    ws.insert(["parent", "antoinet", "wouter"]);
    ws.fixpoint();
    var result = ws.query(["ancestor", "X", "zef"]);
    assert.equal(1, _.where(result, {X: "jan"}).length);
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(1, _.where(result, {X: "ben"}).length);
    assert.equal(1, _.where(result, {X: "petra"}).length);
    assert.equal(0, _.where(result, {X: "wouter"}).length);
    result = ws.query(["ancestor", "X", "wouter"]);
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(0, _.where(result, {X: "ben"}).length);
    
    console.log(ws.toString());
}