var Workspace = require("./scriptlog").Workspace;
var atom = require("./scriptlog").atom;
var rule = require("./scriptlog").rule;
var deltaAtom = require("./scriptlog").deltaAtom;
var queryEventFilter = require("./scriptlog").queryEventFilter;
var assert = require("assert");
var _ = require("underscore");

require("./builtin");

basic();
derivationRule();
testBasicRemove();
testDerivedRemove();
testLongTraceRemove();
testBuiltin();
testDeltaRules();
testWildCard();
testExecRules();
testUpsert();
testEvents();

// Benchmark
testInsertPerformance();
testRemovePerformance();
testUpsertPerformance();
testRulePerformance();

function basic() {
    var ws = new Workspace();
    ws.insert(atom("parent", "ben", "jan"));
    ws.insert(atom("parent", "petra", "jan"));
    ws.insert(atom("parent", "jan", "zef"));
    ws.insert(atom("parent", "antoinet", "zef"));
    ws.insert(atom("parent", "antoinet", "wouter"));
    var result = ws.queryBindings(atom("parent", "jan", "zef"));
    assert.deepEqual([{}], result);

    try {
        ws.insert(atom("doesntexist", 2));
        assert(false, "Shouldn't get here");
    } catch (e) {}

    result = ws.queryBindings(atom("parent", "?x", "zef"));
    assert.equal(1, _.where(result, {"?x": "jan"}).length);
    assert.equal(1, _.where(result, {"?x": "antoinet"}).length);
    assert.equal(0, _.where(result, {"?x": "ben"}).length);
    // shouldn't change anything
    ws.fixpoint();
    assert.equal(1, _.where(result, {"?x": "jan"}).length);
    assert.equal(1, _.where(result, {"?x": "antoinet"}).length);
    assert.equal(0, _.where(result, {"?x": "ben"}).length);
}

function derivationRule() {
    var ws = new Workspace();
    ws.addRule(rule(atom("ancestor", "?a", "?b"),
                    atom("parent", "?a", "?b")));
    ws.addRule(rule(atom("ancestor", "?a", "?c"),
                    atom("ancestor", "?a", "?b"),
                    atom("ancestor", "?b", "?c")));
    ws.insert(atom("parent", "ben", "jan"));
    ws.insert(atom("parent", "petra", "jan"));
    ws.insert(atom("parent", "jan", "zef"));
    ws.insert(atom("parent", "antoinet", "zef"));
    ws.insert(atom("parent", "antoinet", "wouter"));

    try {
        // Inserting into IDB not allowed
        ws.insert(atom("ancestor", "zef", "pete"));
        assert(false, "Shouldn't get here");
    } catch (e) {}

    ws.fixpoint();
    var result = ws.queryBindings(atom("ancestor", "?x", "zef"));
    assert.equal(1, _.where(result, {"?x": "jan"}).length);
    assert.equal(1, _.where(result, {"?x": "antoinet"}).length);
    assert.equal(1, _.where(result, {"?x": "ben"}).length);
    assert.equal(1, _.where(result, {"?x": "petra"}).length);
    assert.equal(0, _.where(result, {"?x": "wouter"}).length);
    result = ws.queryBindings(atom("ancestor", "?x", "wouter"));
    assert.equal(1, _.where(result, {"?x": "antoinet"}).length);
    assert.equal(0, _.where(result, {"?x": "ben"}).length);
}

function testBasicRemove() {
    var ws = new Workspace();
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
    ws.addRule(rule(atom("ancestor", "?a", "?b"),
                    atom("parent", "?a", "?b")));
    ws.addRule(rule(atom("ancestor", "?a", "?c"),
                    atom("ancestor", "?a", "?b"),
                    atom("ancestor", "?b", "?c")));
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
    //console.log(ws.predicates.parent);
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
    ws.addRule(rule(atom("lessthan", "?a", "?b"),
                    atom("successor", "?a", "?b")));
    ws.addRule(rule(atom("lessthan", "?a", "?c"),
                    atom("lessthan", "?a", "?b"),
                    atom("lessthan", "?b", "?c")));
    for (var i = 1; i < 10; i++) {
        ws.insert(atom("successor", i - 1, i));
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
        assert.equal(5, ws.queryBindings(atom("lessthan", 0, "?x")).length);
        assert.equal(3, ws.queryBindings(atom("lessthan", "?x", 9)).length);
    }
}

function testBuiltin() {
    var ws = new Workspace();
    assert.deepEqual([{"?x": 30}], ws.queryBindings(atom("int:add", 10, 20, "?x")));
    assert.deepEqual([{}], ws.queryBindings(atom("int:lessThan", 10, 20, "?x")));
    assert.deepEqual([], ws.queryBindings(atom("int:lessThan", 20, 10, "?x")));

    ws.addRule(rule(atom("smallerThanTen", "?x"),
    atom("num", "?x"),
    atom("int:lessThan", "?x", 10)));
    for (var i = 0; i < 20; i++) {
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
    ws.addRule(rule(deltaAtom("+", "clone1", "?a"),
                    atom("original", "?a")));
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
    ws.createEDBPredicate("successor");
    for (var i = 1; i < 10; i++) {
        ws.insert(atom("successor", i - 1, i));
    }
    var results = ws.query(atom("successor", 2, "?"));
    assert.equal(1, results.length);
    assert.equal(results[0].hashCode, "successor(2,3)");
}

function testExecRules() {
    var ws = new Workspace();
    ws.addRule(rule(atom("lessthan", "?a", "?b"),
    atom("successor", "?a", "?b")));
    ws.addRule(rule(atom("lessthan", "?a", "?c"),
    atom("lessthan", "?a", "?b"),
    atom("lessthan", "?b", "?c")));
    for (var i = 1; i < 10; i++) {
        ws.insert(atom("successor", i - 1, i));
    }
    ws.fixpoint();
    assert(ws.contains(atom("successor", 1, 2)));
    assert(ws.contains(atom("lessthan", 1, 2)));

    ws.fixpointRules([rule(deltaAtom("-", "successor", "?a", "?"),
    atom("lessthan", "?a", 5))]);
    assert(!ws.contains(atom("successor", 1, 2)));
    assert(!ws.contains(atom("lessthan", 1, 2)));

    // Insert everything again
    for (i = 1; i < 10; i++) {
        ws.insert(atom("successor", i - 1, i));
    }
    ws.fixpoint();
    assert(ws.contains(atom("successor", 1, 2)));
    assert(ws.contains(atom("lessthan", 1, 2)));
}

function testUpsert() {
    var ws = new Workspace();
    ws.upsert(atom("counter", 1));
    assert(ws.contains(atom("counter", 1)));
    assert(1, ws.getPredicate("counter").count());
    ws.upsert(atom("counter", 2));
    assert(ws.contains(atom("counter", 2)));
    assert(1, ws.getPredicate("counter").count());

    ws.upsert(atom("age", "zef", 29));
    ws.upsert(atom("age", "wouter", 25));
    assert(ws.contains(atom("age", "zef", 29)));
    assert(2, ws.getPredicate("age").count());
    ws.upsert(atom("age", "zef", 30));
    ws.upsert(atom("age", "wouter", 26));
    assert(ws.contains(atom("age", "zef", 30)));
    assert(2, ws.getPredicate("age").count());
}

function testEvents() {
    var ws = new Workspace();
    // We have to explicitly create the predicate here so that we can subscribe
    // to it later
    ws.createEDBPredicate("parent");
    ws.addRule(rule(atom("ancestor", "?a", "?b"),
                    atom("parent", "?a", "?b")));
    ws.addRule(rule(atom("ancestor", "?a", "?c"),
                    atom("ancestor", "?a", "?b"),
                    atom("ancestor", "?b", "?c")));
    var invoked = 0;
    ws.getPredicate("parent").on("insert", function() {
        invoked++;
    });
    ws.insert(atom("parent", "jan", "zef"));
    ws.insert(atom("parent", "ben", "jan"));
    assert.equal(2, invoked);
    invoked = 0;
    ws.getPredicate("ancestor").on("insert", function() {
        invoked++;
    });
    ws.fixpoint();
    assert.equal(3, invoked);
    
    ws = new Workspace();
    ws.createEDBPredicate("parent");
    invoked = 0;
    ws.getPredicate("parent").on("insert", queryEventFilter(atom("parent", "?p", "zef"), function(atom, bindings) {
        invoked++;
        assert.equal("jan", bindings["?p"]);
    }));
    ws.insert(atom("parent", "jan", "wouter"));
    ws.insert(atom("parent", "jan", "zef"));
    assert.equal(1, invoked);
}

function testInsertPerformance() {
    var before = Date.now();
    var ws = new Workspace();
    var itemsToInsert = 10000;
    for (var i = 1; i <= itemsToInsert; i++) {
        ws.insert(atom("successor", i - 1, i));
    }
    ws.fixpoint();
    console.log("Inserting", itemsToInsert, "items took:", Date.now() - before, "ms");
}

function testRemovePerformance() {
    var ws = new Workspace();
    var itemsToInsert = 10000;
    for (var i = 1; i <= itemsToInsert; i++) {
        ws.insert(atom("successor", i - 1, i));
    }
    ws.fixpoint();
    var before = Date.now();
    for (i = 1; i <= itemsToInsert; i++) {
        ws.remove(atom("successor", i - 1, i));
    }
    console.log("Removing", itemsToInsert, "items took:", Date.now() - before, "ms");
}

function testRulePerformance() {
    var ws = new Workspace();
    ws.addRule(rule(atom("ancestor", "?a", "?b"),
                    atom("parent", "?a", "?b")));
    ws.addRule(rule(atom("ancestor", "?a", "?c"),
                    atom("ancestor", "?a", "?b"),
                    atom("ancestor", "?b", "?c")));
    var numParents = 20;
    for (var i = 0; i < numParents; i++) {
        ws.insert(atom("parent", "p" + i, "p" + (i + 1)));
    }
    var before = Date.now();
    ws.fixpoint();
    assert(ws.contains(atom("ancestor", "p2", "p10")));
    console.log("Fixpointing on", numParents, "parents took: ", Date.now() - before, "ms");
}

function testUpsertPerformance() {
    var ws = new Workspace();
    ws.createEDBPredicate("age");
    var names = ["pete", "jan", "steve", "roger", "hank", "frenkel", "john", "anne", "emma", "samantha"];
    var before = Date.now();
    names.forEach(function(name) {
        for (var i = 0; i < 1000; i++) {
            ws.upsert(atom("age", name + i, 20));
        }
    });
    console.log("Upserting", names.length * 1000, "names took", Date.now() - before, "ms");
}