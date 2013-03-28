// Adapted from: https://github.com/fkettelhoit/bottom-up-datalog-js

var _ = require("underscore");

function Workspace() {
    this.edb = [];
    this.installedRules = [];
    this.factCache = [];

    this.predicates = {}; // name: [arg0, arg1, ..., fromRule: id]
}

var lastRuleId = 0;

function Rule(head, body) {
    this.head = head;
    this.body = body;
}

Rule.prototype = {
    applyToWorkspace: function(ws) {
        var rule = this;
        var predicatesAddedTo = {};
        this.generateBindings(ws).forEach(function(binding) {
            var newFact = substitute(rule.head, binding);
            predicatesAddedTo[newFact[0]] = true;
            ws.addFact(newFact, rule);
        });
        Object.keys(predicatesAddedTo).forEach(function(predicate) {
            ws.removeDuplicates(predicate);
        });
    },
    generateBindings: function(ws) {
        var goals = this.body.map(function(goal) {
            return ws.query(goal);
        });
        return goals.slice(1).reduce(unifyBindingArrays, goals[0]);
    },
    toString: function() {
        return JSON.stringify(this, null, 4);
    }
};

function Fact(args, source) {
    for (var i = 0; i < args.length; i++) {
        this[i] = args[i];
    }
    this.source = source;
}

Fact.asString = function(fact) {
    var args = [];
    for (var i = 0; fact[i] !== undefined; i++) {
        args.push(fact[i]);
    }
    return args.join(",");
};

Workspace.prototype = {
    addRule: function(rule) {
        this.installedRules.push(rule);
    },
    insert: function(fact) {
        this.edb.push(fact);
        this.addFact(fact);
    },
    fixpoint: function(iteration) {
        iteration = iteration || 1;
        // Prevent infinite iteration
        if (iteration > 1000) {
            throw Error("More than 1000 iterations");
        }
        var factCountBefore = this.countFacts();
        var rules = this.installedRules;
        for (var i = 0; i < rules.length; i++) {
            rules[i].applyToWorkspace(this);
        }
        // Something changed? Go again!
        if (factCountBefore !== this.countFacts()) {
            this.fixpoint(iteration + 1);
        }
    },
    countFacts: function() {
        var count = 0;
        var that = this;
        Object.keys(this.predicates).forEach(function(predicate) {
            count += that.predicates[predicate].length;
        });
        return count;
    },
    rebuild: function() {
        var that = this;
        // Flush
        this.predicates = {};
        // Reinsert all EDB facts
        this.edb.forEach(function(fact) {
            that.addFact(fact);
        });
        this.fixpoint();
    },
    query: function(query) {
        var results = [];
        var predicate = query[0];
        var facts = this.predicates[predicate];
        if(!facts) {
            return [];
        }
        var args = query.slice(1);
        for (var i = 0; i < facts.length; i++) {
            var fact = facts[i];
            var unification = unify(args, fact);
            if (unification) {
                results.push(unification);
            }
        }
        return results;
    },
    // Private
    removeDuplicates: function(predicate) {
        this.predicates[predicate] = _.uniq(this.predicates[predicate], false, Fact.asString);
    },
    addFact: function(fact, source) {
        var predicate = fact[0];
        if (!this.predicates[predicate]) {
            this.predicates[predicate] = [];
        }
        this.predicates[predicate].push(new Fact(fact.slice(1), source));
    },
    addFacts: function(facts, source) {
        for (var i = 0; i < facts.length; i++) {
            this.addFact(facts[i], source);
        }
    },
    toString: function() {
        var ws = this;
        var s = "Rules\n========\n";
        this.installedRules.forEach(function(rule) {
            s += rule.toString() + "\n";
        });
        s += "\nFacts\n========\n";
        Object.keys(this.predicates).forEach(function(predicate) {
            s += predicate + ":\n";
            var facts = ws.predicates[predicate];
            facts.forEach(function(fact) {
                s += "- " + Fact.asString(fact) + "\n";
            });
        });
        return s;
    }
};

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
    Rule: Rule
};