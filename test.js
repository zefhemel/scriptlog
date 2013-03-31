var Workspace = require("./tiny").Workspace;
var atom = require("./tiny").atom;
var rule = require("./tiny").rule;
var deltaAtom = require("./tiny").deltaAtom;
var assert = require("assert");
var _ = require("underscore");

basic();
derivationRule();
testBasicRemove();
testDerivedRemove();
testLongTraceRemove();
testInsertPerformance();
testBuiltin();
testDeltaRules();
testWildCard();
testExecRules();

function basic() {
    var ws = new Workspace();
    ws.addEDBPredicate("parent");
    ws.insert(atom("parent", "ben", "jan"));
    ws.insert(atom("parent", "petra", "jan"));
    ws.insert(atom("parent", "jan", "zef"));
    ws.insert(atom("parent", "antoinet", "zef"));
    ws.insert(atom("parent", "antoinet", "wouter"));
    var result = ws.query(atom("parent", "jan", "zef"));
    assert.deepEqual([{}], result);
    
    try {
        ws.insert(atom("doesntexist", 2));
        assert(false, "Shouldn't get here");
    } catch(e) { }
    
    result = ws.query(atom("parent", "X", "zef"));
    assert.equal(1, _.where(result, {X: "jan"}).length);
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(0, _.where(result, {X: "ben"}).length);
    // shouldn't change anything
    ws.fixpoint();
    assert.equal(1, _.where(result, {X: "jan"}).length);
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(0, _.where(result, {X: "ben"}).length);
}

function testInsertPerformance() {
    var before = Date.now();
    var ws = new Workspace();
    var itemsToInsert = 10000;
    ws.addEDBPredicate("successor");
    for(var i = 1; i <= itemsToInsert; i++) {
        ws.insert(atom("successor", i-1, i));
    }
    ws.fixpoint();
    console.log("Inserting", itemsToInsert, "items took:", Date.now()-before, "ms");
}

function derivationRule() {
    var ws = new Workspace();
    ws.addEDBPredicate("parent");
    ws.addIDBPredicate("ancestor");
    ws.addRule(rule(atom("ancestor", "A", "B"), 
                    atom("parent", "A", "B")));
    ws.addRule(rule(atom("ancestor", "A", "C"), 
                    atom("ancestor", "A", "B"),
                    atom("ancestor", "B", "C")));
    ws.insert(atom("parent", "ben", "jan"));
    ws.insert(atom("parent", "petra", "jan"));
    ws.insert(atom("parent", "jan", "zef"));
    ws.insert(atom("parent", "antoinet", "zef"));
    ws.insert(atom("parent", "antoinet", "wouter"));
    
    try {
        // Inserting into IDB not allowed
        ws.insert(atom("ancestor", "zef", "pete"));
        assert(false, "Shouldn't get here");
    } catch(e) { }
    
    ws.fixpoint();
    var result = ws.query(atom("ancestor", "X", "zef"));
    assert.equal(1, _.where(result, {X: "jan"}).length);
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(1, _.where(result, {X: "ben"}).length);
    assert.equal(1, _.where(result, {X: "petra"}).length);
    assert.equal(0, _.where(result, {X: "wouter"}).length);
    result = ws.query(atom("ancestor", "X", "wouter"));
    assert.equal(1, _.where(result, {X: "antoinet"}).length);
    assert.equal(0, _.where(result, {X: "ben"}).length);
}

function testBasicRemove() {
    var ws = new Workspace();
    ws.addEDBPredicate("parent");
    ws.insert(atom("parent", "jan", "zef"));
    ws.insert(atom("parent", "antoinet", "zef"));
    assert(ws.contains(atom("parent", "antoinet", "zef")));
    assert(ws.contains(atom("parent", "jan", "zef")));
    ws.remove(atom("parent", "jan", "zef"));
    assert(!ws.contains(atom("parent", "jan", "zef")));
    assert(ws.contains(atom("parent", "antoinet", "zef")));
}

function testDerivedRemove() {
    var ws = new Workspace();
    ws.addEDBPredicate("parent");
    ws.addIDBPredicate("ancestor");
    ws.addRule(rule(atom("ancestor", "A", "B"), 
                    atom("parent", "A", "B")));
    ws.addRule(rule(atom("ancestor", "A", "C"), 
                    atom("ancestor", "A", "B"),
                    atom("ancestor", "B", "C")));
    ws.insert(atom("parent", "jan-jozef", "ben"));
    ws.insert(atom("parent", "ben", "jan"));
    ws.insert(atom("parent", "petra", "jan"));
    ws.insert(atom("parent", "jan", "zef"));
    ws.insert(atom("parent", "antoinet", "zef"));
    ws.insert(atom("parent", "antoinet", "wouter"));
    ws.fixpoint();
    assert(ws.contains(atom("ancestor", "ben", "jan")));
    assert(ws.contains(atom("ancestor", "ben", "zef")));
    assert(ws.contains(atom("ancestor", "petra", "zef")));
    ws.remove(atom("parent", "ben", "jan"));
    check();
    ws.fixpoint();
    check();
    function check() {
        assert(!ws.contains(atom("ancestor", "ben", "jan")));
        assert(!ws.contains(atom("ancestor", "ben", "zef")));
        assert(ws.contains(atom("ancestor", "petra", "zef")));
    }
}

function testLongTraceRemove() {
    var ws = new Workspace();
    ws.addEDBPredicate("successor");
    ws.addIDBPredicate("lessthan");
    ws.addRule(rule(atom("lessthan", "A", "B"), 
                    atom("successor", "A", "B")));
    ws.addRule(rule(atom("lessthan", "A", "C"), 
                    atom("lessthan", "A", "B"),
                    atom("lessthan", "B", "C")));
    for(var i = 1; i < 10; i++) {
        ws.insert(atom("successor", i-1, i));
    }
    ws.fixpoint();
    assert(ws.contains(atom("lessthan", 0, 1)));
    assert(ws.contains(atom("lessthan", 0, 9)));
    // Let's break the chain
    ws.remove(atom("successor", 5, 6));
    check();
    ws.fixpoint();
    check();
    function check() {
        assert(!ws.contains(atom("lessthan", 5, 6)));
        assert(ws.contains(atom("lessthan", 0, 5)));
        assert(ws.contains(atom("lessthan", 6, 9)));
        assert(!ws.contains(atom("lessthan", 0, 9)));
        assert(!ws.contains(atom("lessthan", 3, 7)));
        assert.equal(5, ws.query(atom("lessthan", 0, "X")).length);
        assert.equal(3, ws.query(atom("lessthan", "X", 9)).length);
    }
}

function testBuiltin() {
    var ws = new Workspace();
    assert.deepEqual([{X: 30}], ws.query(atom("int:add", 10, 20, "X")));
    assert.deepEqual([{}], ws.query(atom("int:lessThan", 10, 20, "X")));
    assert.deepEqual([], ws.query(atom("int:lessThan", 20, 10, "X")));
    
    ws.addEDBPredicate("num");
    ws.addIDBPredicate("smallerThanTen");
    ws.addRule(rule(atom("smallerThanTen", "X"),
                    atom("num", "X"),
                    atom("int:lessThan", "X", 10)));
    for(var i = 0; i < 20; i++) {
        ws.insert(atom("num", i));
    }
    ws.fixpoint();
    assert(ws.contains(atom("smallerThanTen", 5)));
    assert(!ws.contains(atom("smallerThanTen", 18)));
    ws.remove(atom("num", 5));
    assert(!ws.contains(atom("smallerThanTen", 5)));
    ws.fixpoint();
}

// TODO not done
function testDeltaRules() {
    var ws = new Workspace();
    ws.addEDBPredicate("original");
    ws.addEDBPredicate("clone1");
    ws.addRule(rule(deltaAtom("+", "clone1", "A"), 
                    atom("original", "A")));
    ws.insert(atom("original", 1));
    ws.fixpoint();
    assert(ws.contains(atom("original", 1)));
    assert(ws.contains(atom("clone1", 1)));
    ws.remove(atom("original", 1));
    assert(!ws.contains(atom("original", 1)));
    assert(ws.contains(atom("clone1", 1)));
}

function testWildCard() {
    var ws = new Workspace();
    ws.addEDBPredicate("successor");
    for(var i = 1; i < 10; i++) {
        ws.insert(atom("successor", i-1, i));
    }
    var results = ws.query(atom("successor", "A", "_"));
    assert(!results[0]._);
}

function testExecRules() {
    var ws = new Workspace();
    ws.addEDBPredicate("successor");
    ws.addIDBPredicate("lessthan");
    ws.addRule(rule(atom("lessthan", "A", "B"), 
                    atom("successor", "A", "B")));
    ws.addRule(rule(atom("lessthan", "A", "C"), 
                    atom("lessthan", "A", "B"),
                    atom("lessthan", "B", "C")));
    for(var i = 1; i < 10; i++) {
        ws.insert(atom("successor", i-1, i));
    }
    ws.fixpoint();
    assert(ws.contains(atom("successor", "1", "2")));
    assert(ws.contains(atom("lessthan", "1", "2")));
    
    ws.fixpointRules(rule(deltaAtom("-", "successor", "A", "B"),
                          atom("lessthan", "A", 5)));
    assert(!ws.contains(atom("successor", "1", "2")));
    assert(!ws.contains(atom("lessthan", "1", "2")));
    
    // Insert everything again
    for(i = 1; i < 10; i++) {
        ws.insert(atom("successor", i-1, i));
    }
    ws.fixpoint();
    assert(ws.contains(atom("successor", "1", "2")));
    assert(ws.contains(atom("lessthan", "1", "2")));
}