// Adapted from: https://github.com/fkettelhoit/bottom-up-datalog-js

var _ = require("underscore");

function Workspace() {
    this.edb = [];
    this.rules = [];
    this.factCache = [];
}

Workspace.prototype = {
    addRule: function(rule) {
        this.rules.push(rule.head.concat(rule.body));
    },
    insert: function() {
        var f = Array.prototype.slice.call(arguments);
        this.edb.push(f);
        this.factCache.push(f);
    },
    fixpoint: function() {
        var oldFacts = this.factCache;
        var newFacts = this.factCache;
        var rules = this.rules;
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            newFacts = applyRule(newFacts, rule);
        }
        this.factCache = newFacts;
        if (oldFacts.length !== newFacts.length) {
            this.fixpoint();
        }
    },
    rebuild: function() {
        this.factCache = this.edb.slice();
        this.fixpoint();
    },
    query: function() {
        return evalQuery(this.factCache, Array.prototype.slice.call(arguments));
    }
};

function applyRule(facts, rule) {
    var newFacts = facts.concat(ruleAsFacts(facts, rule));
    return _.uniq(newFacts, false, JSON.stringify);
}

function ruleAsFacts(facts, rule) {
    return generateBindings(facts, rule).map(function(binding) {
        return substitute(rule[0], binding);
    });
}

function substitute(query, bindings) {
    var result = [];
    for (var i = 0; i < query.length; i++) {
        var el = query[i];
        if (isVar(el)) {
            result.push(bindings[el] || el);
        } else {
            result.push(el);
        }
    }
    return result;
}

function isVar(identifier) {
    return identifier[0].toUpperCase() == identifier[0];
}

function generateBindings(facts, rule) {
    var body = rule.slice(1);
    var goals = [];
    for (var i = 0; i < body.length; i++) {
        var goal = body[i];
        goals.push(evalQuery(facts, goal));
    }
    return goals.slice(1).reduce(unifyBindingArrays, goals[0]);
}

function unifyBindingArrays(arr1, arr2) {
    // This is important as items may be added on the fly
    var arr1Length = arr1.length;
    var arr2Length = arr2.length;
    var results = [];
    for (var i = 0; i < arr1Length; i++) {
        var bindings1 = arr1[i];
        for (var j = 0; j < arr2Length; j++) {
            var bindings2 = arr2[j];
            var unified = unifyBindings(bindings1, bindings2);
            if (unified) {
                results.push(unified);
            }
        }
    }
    return results;
}

function unifyBindings(bindings1, bindings2) {
    // New object for binding
    var obj = {};
    // So far so good
    var success = true;

    Object.keys(bindings1).forEach(function(b) {
        // If it's set in the other binding, it has to be the same, otherwise FAIL
        if (bindings2[b] && bindings1[b] !== bindings2[b]) {
            success = false;
            return;
        } else {
            obj[b] = bindings1[b];
        }
    });
    if (!success) {
        // Shortcut
        return false;
    }
    Object.keys(bindings2).forEach(function(b) {
        if (bindings1[b] && bindings2[b] !== bindings2[b]) {
            success = false;
            return;
        } else {
            obj[b] = bindings2[b];
        }
    });
    if (success) {
        return obj;
    } else {
        return false;
    }
}

function evalQuery(facts, query) {
    var results = [];
    for (var i = 0; i < facts.length; i++) {
        var fact = facts[i];
        var unification = unify(query, fact);
        if (unification) {
            results.push(unification);
        }
    }
    return results;
}

function unify(query, fact) {
    var obj = {};
    for (var i = 0; i < query.length; i++) {
        var el = query[i];
        if (!isVar(el) && el !== fact[i]) {
            return false;
        } else if (isVar(el)) {
            obj[el] = fact[i];
        }
    }
    return obj;
}

module.exports = {
    Workspace: Workspace,
    isVar: isVar,
    generateBindings: generateBindings,
    unifyBindings: unifyBindings,
    unifyBindingArrays: unifyBindingArrays,
    unify: unify,
    ruleAsFacts: ruleAsFacts,
    evalQuery: evalQuery
};