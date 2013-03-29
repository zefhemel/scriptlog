// Adapted from: https://github.com/fkettelhoit/bottom-up-datalog-js

var _ = require("underscore");

function Rule(headAtom, bodyAtoms) {
    this.headAtom = headAtom;
    this.bodyAtoms = bodyAtoms;
}

Rule.prototype = {
    applyToWorkspace: function(ws) {
        var rule = this;
        var predicatesAddedTo = {};
        this.generateBindings(ws).forEach(function(binding) {
            var newFact = substitute(rule.headAtom, binding);
            predicatesAddedTo[newFact[0]] = true;
            var derivedFromFacts = rule.bodyAtoms.map(function(goal) {
                return substitute(goal, binding);
            });
            //console.log(bodyBindings);
            ws.addFact(newFact, derivedFromFacts);
        });
        Object.keys(predicatesAddedTo).forEach(function(predicate) {
            ws.getPredicate(predicate).compact();
        });
    },
    generateBindings: function(ws) {
        var goals = this.bodyAtoms.map(function(goal) {
            return ws.query(goal);
        });
        return goals.slice(1).reduce(unifyBindingArrays, goals[0]);
    },
    toString: function() {
        return JSON.stringify(this, null, 4);
    }
};

function Atom(array, derivedFrom) {
    for (var i = 0; i < array.length; i++) {
        this[i] = array[i];
    }
    this.length = array.length;
    this.derivedFrom = derivedFrom;
    this.hash = Atom.hashCode(this);
}

Atom.prototype = {
    toString: function() {
        return Atom.hashCode(this);
    }
};

Atom.hashCode = function(atom) {
    var args = [];
    for (var i = 1; i < atom.length; i++) {
        args.push(atom[i]);
    }
    return atom[0] + "(" + args.join(",") + ")";
};

function Predicate(name) {
    this.name = name;
    this.facts = [];
}

Predicate.prototype = {
    count: function() {
        return this.facts.length;
    },
    get: function(index) {
        return this.facts[index];
    },
    add: function(atom) {
        this.facts.push(atom);
    },
    eachFact: function(fn) {
        this.facts.forEach(fn);
    },
    compact: function() {
        this.facts = _.uniq(this.facts, false, Atom.hashCode);
    }
};

function Workspace() {
    this.installedRules = [];
    this.factCache = [];
    this.predicates = {};
}

Workspace.prototype = {
    addRule: function(rule) {
        this.installedRules.push(rule);
    },
    insert: function(atom) {
        this.addFact(atom);
    },
    remove: function(atom) {
        var predicate = this.getPredicate(atom);
    },
    eachPredicate: function(fn) {
        _.values(this.predicates).forEach(fn);
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
        this.eachPredicate(function(predicate) {
            count += predicate.count();
        });
        return count;
    },
    query: function(query) {
        var results = [];
        var predicateName = query[0];
        var predicate = this.predicates[predicateName];
        if (!predicate) {
            return [];
        }
        for (var i = 0; i < predicate.count(); i++) {
            var atom = predicate.get(i);
            var unification = unify(query, atom);
            if (unification) {
                results.push(unification);
            }
        }
        return results;
    },
    getPredicate: function(name) {
        return this.predicates[name];
    },
    // Private
    addFact: function(atom, derivedFrom) {
        var predicateName = atom[0];
        if (!this.getPredicate(predicateName)) {
            this.predicates[predicateName] = new Predicate(predicateName);
        }
        this.getPredicate(predicateName).add(new Atom(atom, derivedFrom));
    },
    toString: function() {
        var s = "Rules\n========\n";
        this.installedRules.forEach(function(rule) {
            s += rule.toString() + "\n";
        });
        s += "\nFacts\n========\n";
        this.eachPredicate(function(predicate) {
            s += predicate.name + ":\n";
            predicate.eachFact(function(atom) {
                s += "- " + atom.toString() + " derived from " + (atom.derivedFrom ? atom.derivedFrom.map(function(atom) {
                    return atom.toString();
                }).join(", ") : "") + "\n";
            });
        });
        return s;
    }
};

/**
 * @param query Atom
 * @return Atom
 */
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
    return new Atom(result);
}

/**
 * @param identifier string
 * @return boolean
 */
function isVar(identifier) {
    return identifier[0].toUpperCase() == identifier[0];
}

/**
 * @param arr1 array of mapping objects
 * @param arr2 array of mapping objects
 * @return array of mapping objects
 */
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

/**
 * @param arr1 mapping object
 * @param arr2 mapping object
 * @return mapping object or false
 */
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

/**
 * @param query Atom
 * @param atom Atom
 * @return mapping object
 */
function unify(query, atom) {
    var obj = {};
    for (var i = 0; i < query.length; i++) {
        var el = query[i];
        if (!isVar(el) && el !== atom[i]) {
            return false;
        } else if (isVar(el)) {
            obj[el] = atom[i];
        }
    }
    return obj;
}

module.exports = {
    Workspace: Workspace,
    Rule: Rule,
    Atom: Atom
};